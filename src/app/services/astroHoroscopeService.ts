import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { dateOnly } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  astroClaims,
  astroCycles,
  contentAstroArchetypes,
  guildSettings,
  users
} from '../../infra/db/schema';
import {
  ASTRO_CONTEXTS,
  ASTRO_MODES,
  ASTRO_SIGN_KEYS,
  addDaysToDateOnly,
  astroSignLabelRu,
  computeAstroSeed,
  computeAstroCycleRange,
  pickDeterministicAstroArchetypeKey,
  parseAstroContext,
  parseAstroMode,
  parseAstroSignKey,
  stableHashInt,
  type AstroContext,
  type AstroMode,
  type AstroSignKey
} from '../../domain/astro';
import { getGuildSettings, upsertGuildSettings } from '../../infra/db/queries/guildSettings';
import { logger } from '../../lib/logger';

const astroVariantLeafSchema = z.object({
  risk: z.string().min(1),
  step: z.string().min(1),
  keyPhrase: z.string().min(1),
  taboo: z.string().min(1),
  miniChallenge: z.string().min(1)
});

const astroVariantRootSchema = z.object({
  meta: z.object({
    skyTheme: z.string().min(1),
    aboutLine: z.string().min(1)
  }),
  signs: z.record(z.string(), z.unknown())
});

type AstroVariantLeaf = z.infer<typeof astroVariantLeafSchema>;

type AstroVariants = {
  meta: {
    skyTheme: string;
    aboutLine: string;
  };
  signs: Record<AstroSignKey, Record<AstroMode, Record<AstroContext, AstroVariantLeaf>>>;
};

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_HOROSCOPE_EVERY_DAYS = 4;
const HOROSCOPE_ALLOWED_FREQUENCY = new Set([1, 4, 7]);
const HOROSCOPE_LOCAL_RUN_HOUR = 10;

export type AstroFeatureState = {
  guildId: string;
  enabled: boolean;
  configured: boolean;
  channelId: string | null;
  messageId: string | null;
  anchorDate: string | null;
  timezone: string;
  everyDays: number;
  nextRunAt: Date | null;
  lastPostAt: Date | null;
};

export type AstroCycleRuntime = {
  anchorDate: string;
  cycleIndex: number;
  cycleStartDate: string;
  cycleEndDate: string;
};

type AstroClaimRow = typeof astroClaims.$inferSelect;

export const ASTRO_PUBLIC_DISCLAIMER = 'Астрология здесь — метафора и ритуал, не предсказание и не наука.';
export const ASTRO_PRIVATE_DISCLAIMER = 'Метафора/ритуал, не прогноз и не научное утверждение.';

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function normalizeEveryDays(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !HOROSCOPE_ALLOWED_FREQUENCY.has(value)) {
    return DEFAULT_HOROSCOPE_EVERY_DAYS;
  }

  return value;
}

function safeTimezone(timezone: string | null | undefined): string {
  if (!timezone) {
    return DEFAULT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function toTimeZoneParts(date: Date, timeZone: string): TimeZoneParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((part) => part.type === type)?.value ?? '0';
    return Number.parseInt(raw, 10);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second')
  };
}

function addDaysUtc(input: TimeZoneParts, days: number): TimeZoneParts {
  const next = new Date(Date.UTC(input.year, input.month - 1, input.day + days, input.hour, input.minute, input.second));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: next.getUTCHours(),
    minute: next.getUTCMinutes(),
    second: next.getUTCSeconds()
  };
}

function zonedLocalToUtc(input: TimeZoneParts, timeZone: string): Date {
  let candidateUtcMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second);

  for (let i = 0; i < 4; i += 1) {
    const seen = toTimeZoneParts(new Date(candidateUtcMs), timeZone);
    const targetMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second);
    const seenMs = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const deltaMs = targetMs - seenMs;
    if (deltaMs === 0) {
      break;
    }

    candidateUtcMs += deltaMs;
  }

  return new Date(candidateUtcMs);
}

export function computeNextRun(input: {
  now: Date;
  timezone: string | null | undefined;
  everyDays: number | null | undefined;
  localHour?: number;
}): Date {
  const timezone = safeTimezone(input.timezone);
  const everyDays = normalizeEveryDays(input.everyDays);
  const localHour = input.localHour ?? HOROSCOPE_LOCAL_RUN_HOUR;

  const nowLocal = toTimeZoneParts(input.now, timezone);
  const todayAtLocal = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
    hour: localHour,
    minute: 0,
    second: 0
  };

  const shouldRunToday = nowLocal.hour < localHour || (nowLocal.hour === localHour && nowLocal.minute === 0 && nowLocal.second === 0);
  const scheduledLocal = shouldRunToday ? todayAtLocal : addDaysUtc(todayAtLocal, everyDays);
  return zonedLocalToUtc(scheduledLocal, timezone);
}

export function buildHoroscopeDedupeKey(input: {
  guildId: string;
  runAt: Date;
  isTest?: boolean;
}): string {
  if (input.isTest) {
    return `horoscope:test:${input.guildId}`;
  }

  const day = input.runAt.toISOString().slice(0, 10);
  return `horoscope:${input.guildId}:${day}`;
}

function parseVariantsJson(raw: unknown): AstroVariants {
  const root = astroVariantRootSchema.parse(raw);
  const signs = {} as AstroVariants['signs'];

  for (const sign of ASTRO_SIGN_KEYS) {
    const signValue = (root.signs as Record<string, unknown>)[sign];
    if (!signValue || typeof signValue !== 'object' || Array.isArray(signValue)) {
      throw new Error(`Astro archetype is missing sign node: ${sign}`);
    }

    const modes = signValue as Record<string, unknown>;
    signs[sign] = {} as AstroVariants['signs'][AstroSignKey];

    for (const mode of ASTRO_MODES) {
      const modeValue = modes[mode];
      if (!modeValue || typeof modeValue !== 'object' || Array.isArray(modeValue)) {
        throw new Error(`Astro archetype is missing mode node: ${sign}.${mode}`);
      }

      const contexts = modeValue as Record<string, unknown>;
      signs[sign][mode] = {} as AstroVariants['signs'][AstroSignKey][AstroMode];

      for (const context of ASTRO_CONTEXTS) {
        const leafValue = contexts[context];
        signs[sign][mode][context] = astroVariantLeafSchema.parse(leafValue);
      }
    }
  }

  return {
    meta: root.meta,
    signs
  };
}

function parseAstroRowSign(value: string): AstroSignKey {
  const sign = parseAstroSignKey(value);
  if (!sign) {
    throw new Error(`Unsupported astro sign key in stored claim: ${value}`);
  }
  return sign;
}

function parseAstroRowMode(value: string): AstroMode {
  const mode = parseAstroMode(value);
  if (!mode) {
    throw new Error(`Unsupported astro mode in stored claim: ${value}`);
  }
  return mode;
}

function parseAstroRowContext(value: string): AstroContext {
  const context = parseAstroContext(value);
  if (!context) {
    throw new Error(`Unsupported astro context in stored claim: ${value}`);
  }
  return context;
}

function buildClaimText(input: {
  sign: AstroSignKey;
  cycleStartDate: string;
  cycleEndDate: string;
  skyTheme: string;
  variant: AstroVariantLeaf;
}): string {
  return [
    `Гороскоп на 6 дней: ${input.cycleStartDate} — ${input.cycleEndDate}`,
    `Знак: ${astroSignLabelRu[input.sign]} (${input.sign})`,
    `В астрологическом языке это звучит как: ${input.skyTheme}`,
    '',
    `Риск: ${input.variant.risk}`,
    `Шаг (<= 10 минут): ${input.variant.step}`,
    `Ключевая фраза: ${input.variant.keyPhrase}`,
    `Табу: ${input.variant.taboo}`,
    `Мини-челлендж: ${input.variant.miniChallenge}`,
    '',
    ASTRO_PRIVATE_DISCLAIMER
  ].join('\n');
}

function buildPairText(input: {
  userSign: AstroSignKey;
  partnerSign: AstroSignKey;
  cycleStartDate: string;
  cycleEndDate: string;
  strengthLine: string;
  frictionLine: string;
  sharedStep: string;
  phraseAtoB: string;
  phraseBtoA: string;
  sixDayRule: string;
}): string {
  return [
    `Синастрия на 6 дней: ${input.cycleStartDate} — ${input.cycleEndDate}`,
    `A: ${astroSignLabelRu[input.userSign]} (${input.userSign})`,
    `B: ${astroSignLabelRu[input.partnerSign]} (${input.partnerSign})`,
    '',
    `Сила: ${input.strengthLine}`,
    `Трение: ${input.frictionLine}`,
    `Общий шаг (<= 15 минут): ${input.sharedStep}`,
    `Фраза A→B: ${input.phraseAtoB}`,
    `Фраза B→A: ${input.phraseBtoA}`,
    `Правило на 6 дней: ${input.sixDayRule}`,
    '',
    ASTRO_PRIVATE_DISCLAIMER
  ].join('\n');
}

async function getAstroArchetypeByKey(key: string) {
  const rows = await db
    .select()
    .from(contentAstroArchetypes)
    .where(eq(contentAstroArchetypes.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(`Astro archetype not found: ${key}`);
  }

  return row;
}

export async function getAstroFeatureState(guildId: string): Promise<AstroFeatureState> {
  const settings = await getGuildSettings(guildId);
  const channelId = settings?.horoscopeChannelId
    ?? settings?.astroHoroscopeChannelId
    ?? settings?.oracleChannelId
    ?? null;
  const enabled = settings?.horoscopeEnabled ?? true;
  const timezone = safeTimezone(settings?.timezone ?? DEFAULT_TIMEZONE);
  const everyDays = normalizeEveryDays(settings?.horoscopeEveryDays);

  return {
    guildId,
    enabled,
    configured: enabled && Boolean(channelId),
    channelId,
    messageId: settings?.horoscopePostMessageId ?? settings?.astroHoroscopeMessageId ?? null,
    anchorDate: settings?.astroHoroscopeAnchorDate ?? null,
    timezone,
    everyDays,
    nextRunAt: settings?.horoscopeNextRunAt ?? null,
    lastPostAt: settings?.horoscopeLastPostAt ?? null
  };
}

export async function configureAstroFeature(input: {
  guildId: string;
  channelId: string;
  enable: boolean;
  everyDays?: number;
  postAnchorIfMissing?: boolean;
  recomputeNextRun?: boolean;
  now?: Date;
}): Promise<AstroFeatureState> {
  const current = await getGuildSettings(input.guildId);
  const nextFeatures = {
    ...(current?.features && typeof current.features === 'object' && !Array.isArray(current.features) ? current.features : {}),
    astro: input.enable
  } as Record<string, boolean>;
  const now = input.now ?? new Date();

  const today = dateOnly(now);
  const anchorDate = current?.astroHoroscopeAnchorDate
    ?? (input.postAnchorIfMissing ?? true ? today : null);
  const currentChannel = current?.horoscopeChannelId ?? current?.astroHoroscopeChannelId ?? null;
  const currentMessageId = current?.horoscopePostMessageId ?? current?.astroHoroscopeMessageId ?? null;
  const nextMessageId = currentChannel === input.channelId
    ? currentMessageId
    : null;
  const everyDays = normalizeEveryDays(input.everyDays ?? current?.horoscopeEveryDays);
  const timezone = safeTimezone(current?.timezone ?? DEFAULT_TIMEZONE);
  const recomputeNextRun = input.recomputeNextRun ?? true;
  const nextRunAt = recomputeNextRun
    ? computeNextRun({
        now,
        timezone,
        everyDays
      })
    : current?.horoscopeNextRunAt ?? null;

  await upsertGuildSettings(input.guildId, {
    horoscopeEnabled: input.enable,
    horoscopeChannelId: input.channelId,
    horoscopeEveryDays: everyDays,
    horoscopeNextRunAt: nextRunAt,
    horoscopePostMessageId: nextMessageId,
    astroHoroscopeChannelId: input.channelId,
    astroHoroscopeMessageId: nextMessageId,
    astroHoroscopeAnchorDate: anchorDate,
    features: nextFeatures
  });

  return getAstroFeatureState(input.guildId);
}

export async function ensureAstroAnchorDate(guildId: string, now: Date = new Date()): Promise<string> {
  const current = await getGuildSettings(guildId);
  if (current?.astroHoroscopeAnchorDate) {
    return current.astroHoroscopeAnchorDate;
  }

  const anchorDate = dateOnly(now);
  await upsertGuildSettings(guildId, {
    astroHoroscopeAnchorDate: anchorDate
  });

  return anchorDate;
}

export async function resolveCurrentAstroCycle(guildId: string, now: Date = new Date()): Promise<AstroCycleRuntime> {
  // Repository date loops use UTC date-only strings (`YYYY-MM-DD`) as deterministic keys.
  const anchorDate = await ensureAstroAnchorDate(guildId, now);
  const today = dateOnly(now);
  const cycle = computeAstroCycleRange(anchorDate, today);

  return {
    anchorDate,
    cycleIndex: cycle.cycleIndex,
    cycleStartDate: cycle.cycleStartDate,
    cycleEndDate: cycle.cycleEndDate
  };
}

export async function ensureAstroCycle(input: {
  guildId: string;
  cycleStartDate: string;
}) {
  const existing = await db
    .select()
    .from(astroCycles)
    .where(and(eq(astroCycles.guildId, input.guildId), eq(astroCycles.cycleStartDate, input.cycleStartDate)))
    .limit(1);

  if (existing[0]) {
    return {
      row: existing[0],
      created: false
    };
  }

  const activeRows = await db
    .select({
      key: contentAstroArchetypes.key
    })
    .from(contentAstroArchetypes)
    .where(eq(contentAstroArchetypes.active, true));

  const activeKeys = activeRows.map((row) => row.key);
  if (activeKeys.length === 0) {
    throw new Error('No active astro archetypes seeded');
  }

  const archetypeKey = pickDeterministicAstroArchetypeKey({
    guildId: input.guildId,
    cycleStartDate: input.cycleStartDate,
    activeKeys
  });
  const seed = computeAstroSeed({
    guildId: input.guildId,
    cycleStartDate: input.cycleStartDate,
    archetypeKey
  });

  const inserted = await db
    .insert(astroCycles)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      cycleStartDate: input.cycleStartDate,
      archetypeKey,
      seed
    })
    .onConflictDoNothing({
      target: [astroCycles.guildId, astroCycles.cycleStartDate]
    })
    .returning();

  if (inserted[0]) {
    return {
      row: inserted[0],
      created: true
    };
  }

  const afterConflict = await db
    .select()
    .from(astroCycles)
    .where(and(eq(astroCycles.guildId, input.guildId), eq(astroCycles.cycleStartDate, input.cycleStartDate)))
    .limit(1);

  if (!afterConflict[0]) {
    throw new Error('Astro cycle dedupe conflict but row not found');
  }

  return {
    row: afterConflict[0],
    created: false
  };
}

export async function ensureCurrentAstroCycle(guildId: string, now: Date = new Date()) {
  const cycle = await resolveCurrentAstroCycle(guildId, now);
  const ensured = await ensureAstroCycle({
    guildId,
    cycleStartDate: cycle.cycleStartDate
  });

  return {
    cycle,
    cycleRow: ensured.row,
    created: ensured.created
  };
}

export async function getAstroPublicSnapshot(guildId: string, now: Date = new Date()) {
  const ensured = await ensureCurrentAstroCycle(guildId, now);
  const archetype = await getAstroArchetypeByKey(ensured.cycleRow.archetypeKey);
  const variants = parseVariantsJson(archetype.variantsJson);

  return {
    cycleStartDate: ensured.cycle.cycleStartDate,
    cycleEndDate: ensured.cycle.cycleEndDate,
    archetypeKey: archetype.key,
    skyTheme: variants.meta.skyTheme,
    aboutLine: variants.meta.aboutLine,
    createdCycle: ensured.created
  };
}

export async function getUserZodiacSign(userId: string): Promise<AstroSignKey | null> {
  const rows = await db
    .select({ zodiacSign: users.zodiacSign })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);

  const sign = rows[0]?.zodiacSign;
  return sign ? parseAstroSignKey(sign) : null;
}

export async function setUserZodiacSign(userId: string, sign: AstroSignKey): Promise<void> {
  await db
    .insert(users)
    .values({
      userId,
      zodiacSign: sign
    })
    .onConflictDoUpdate({
      target: users.userId,
      set: {
        zodiacSign: sign
      }
    });
}

export async function claimAstroHoroscope(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  sign: AstroSignKey;
  mode: AstroMode;
  context: AstroContext;
  saveSign: boolean;
  now?: Date;
}, deps?: {
  ensureCurrentCycle?: typeof ensureCurrentAstroCycle;
  getArchetypeByKey?: typeof getAstroArchetypeByKey;
  selectExistingClaim?: (input: { guildId: string; cycleStartDate: string; userId: string }) => Promise<AstroClaimRow | null>;
  insertClaim?: (input: {
    guildId: string;
    cycleStartDate: string;
    userId: string;
    pairId: string | null;
    sign: AstroSignKey;
    mode: AstroMode;
    context: AstroContext;
    claimText: string;
  }) => Promise<AstroClaimRow | null>;
  selectClaimAfterConflict?: (input: { guildId: string; cycleStartDate: string; userId: string }) => Promise<AstroClaimRow | null>;
  setUserSign?: typeof setUserZodiacSign;
}) {
  const ensureCurrentCycle = deps?.ensureCurrentCycle ?? ensureCurrentAstroCycle;
  const getArchetypeByKey = deps?.getArchetypeByKey ?? getAstroArchetypeByKey;
  const setUserSign = deps?.setUserSign ?? setUserZodiacSign;
  const selectExistingClaim = deps?.selectExistingClaim ?? (async (query) => {
    const rows = await db
      .select()
      .from(astroClaims)
      .where(
        and(
          eq(astroClaims.guildId, query.guildId),
          eq(astroClaims.cycleStartDate, query.cycleStartDate),
          eq(astroClaims.userId, query.userId),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  });
  const insertClaim = deps?.insertClaim ?? (async (insertInput) => {
    const rows = await db
      .insert(astroClaims)
      .values({
        id: randomUUID(),
        guildId: insertInput.guildId,
        cycleStartDate: insertInput.cycleStartDate,
        userId: insertInput.userId,
        pairId: insertInput.pairId,
        deliveredTo: 'ephemeral',
        signKey: insertInput.sign,
        mode: insertInput.mode,
        context: insertInput.context,
        claimText: insertInput.claimText
      })
      .onConflictDoNothing({
        target: [astroClaims.guildId, astroClaims.cycleStartDate, astroClaims.userId]
      })
      .returning();

    return rows[0] ?? null;
  });
  const selectClaimAfterConflict = deps?.selectClaimAfterConflict ?? selectExistingClaim;

  const now = input.now ?? new Date();
  const ensured = await ensureCurrentCycle(input.guildId, now);
  const cycleStartDate = ensured.cycle.cycleStartDate;

  const existing = await selectExistingClaim({
    guildId: input.guildId,
    cycleStartDate,
    userId: input.userId
  });

  if (input.saveSign) {
    await setUserSign(input.userId, input.sign);
  }

  if (existing) {
    const existingClaim = existing;
    return {
      created: false,
      claim: existingClaim,
      cycleStartDate,
      cycleEndDate: addDaysToDateOnly(cycleStartDate, 5),
      sign: parseAstroRowSign(existingClaim.signKey),
      mode: parseAstroRowMode(existingClaim.mode),
      context: parseAstroRowContext(existingClaim.context),
      text: existingClaim.claimText
    };
  }

  const archetype = await getArchetypeByKey(ensured.cycleRow.archetypeKey);
  const variants = parseVariantsJson(archetype.variantsJson);
  const variant = variants.signs[input.sign][input.mode][input.context];
  const claimText = buildClaimText({
    sign: input.sign,
    cycleStartDate,
    cycleEndDate: addDaysToDateOnly(cycleStartDate, 5),
    skyTheme: variants.meta.skyTheme,
    variant
  });

  const inserted = await insertClaim({
    guildId: input.guildId,
    cycleStartDate,
    userId: input.userId,
    pairId: input.pairId,
    sign: input.sign,
    mode: input.mode,
    context: input.context,
    claimText
  });

  if (inserted) {
    return {
      created: true,
      claim: inserted,
      cycleStartDate,
      cycleEndDate: addDaysToDateOnly(cycleStartDate, 5),
      sign: input.sign,
      mode: input.mode,
      context: input.context,
      text: claimText
    };
  }

  const afterConflict = await selectClaimAfterConflict({
    guildId: input.guildId,
    cycleStartDate,
    userId: input.userId
  });

  if (!afterConflict) {
    throw new Error('Astro claim dedupe conflict but row not found');
  }

  return {
    created: false,
    claim: afterConflict,
    cycleStartDate,
    cycleEndDate: addDaysToDateOnly(cycleStartDate, 5),
    sign: parseAstroRowSign(afterConflict.signKey),
    mode: parseAstroRowMode(afterConflict.mode),
    context: parseAstroRowContext(afterConflict.context),
    text: afterConflict.claimText
  };
}

export async function markAstroClaimDelivery(claimId: string, deliveredTo: 'ephemeral' | 'dm'): Promise<void> {
  await db
    .update(astroClaims)
    .set({ deliveredTo })
    .where(eq(astroClaims.id, claimId));
}

export async function buildAstroPairView(input: {
  guildId: string;
  userSign: AstroSignKey;
  partnerSign: AstroSignKey;
  now?: Date;
}): Promise<string> {
  const ensured = await ensureCurrentAstroCycle(input.guildId, input.now ?? new Date());
  const cycleStartDate = ensured.cycle.cycleStartDate;
  const cycleEndDate = ensured.cycle.cycleEndDate;
  const archetype = await getAstroArchetypeByKey(ensured.cycleRow.archetypeKey);
  const variants = parseVariantsJson(archetype.variantsJson);

  const ordered = [input.userSign, input.partnerSign].sort((left, right) => left.localeCompare(right));
  const pairSeed = `${input.guildId}:${cycleStartDate}:${ordered[0]}:${ordered[1]}`;
  const mode = ASTRO_MODES[stableHashInt(`${pairSeed}:mode`) % ASTRO_MODES.length]!;
  const context = ASTRO_CONTEXTS[stableHashInt(`${pairSeed}:context`) % ASTRO_CONTEXTS.length]!;

  const userVariant = variants.signs[input.userSign][mode][context];
  const partnerVariant = variants.signs[input.partnerSign][mode][context];
  const sharedStep = `15 минут: ${userVariant.step}`;
  const strength = `${userVariant.miniChallenge} + ${partnerVariant.miniChallenge}`;
  const friction = `${userVariant.risk} / ${partnerVariant.taboo}`;
  const sixDayRule = `6 дней не делаем: ${userVariant.taboo}; вместо этого держим фразу: ${userVariant.keyPhrase}`;

  return buildPairText({
    userSign: input.userSign,
    partnerSign: input.partnerSign,
    cycleStartDate,
    cycleEndDate,
    strengthLine: strength,
    frictionLine: friction,
    sharedStep,
    phraseAtoB: userVariant.keyPhrase,
    phraseBtoA: partnerVariant.keyPhrase,
    sixDayRule
  });
}

export async function listAstroTickGuilds(): Promise<Array<{
  guildId: string;
  channelId: string;
  messageId: string | null;
  anchorDate: string | null;
  timezone: string;
  everyDays: number;
  nextRunAt: Date | null;
}>> {
  const now = new Date();
  const rows = await db
    .select({
      guildId: guildSettings.guildId,
      channelId: guildSettings.horoscopeChannelId,
      messageId: guildSettings.horoscopePostMessageId,
      anchorDate: guildSettings.astroHoroscopeAnchorDate,
      timezone: guildSettings.timezone,
      everyDays: guildSettings.horoscopeEveryDays,
      nextRunAt: guildSettings.horoscopeNextRunAt
    })
    .from(guildSettings)
    .where(
      and(
        eq(guildSettings.horoscopeEnabled, true),
        isNotNull(guildSettings.horoscopeChannelId),
        or(
          isNull(guildSettings.horoscopeNextRunAt),
          lte(guildSettings.horoscopeNextRunAt, now)
        )
      )
    );

  return rows
    .filter((row) => row.channelId)
    .map((row) => ({
      guildId: row.guildId,
      channelId: row.channelId!,
      messageId: row.messageId ?? null,
      anchorDate: row.anchorDate ?? null,
      timezone: safeTimezone(row.timezone),
      everyDays: normalizeEveryDays(row.everyDays),
      nextRunAt: row.nextRunAt ?? null
    }));
}

export async function queueAstroPublishForTick(input: {
  now: Date;
  enqueue: (params: {
    guildId: string;
    reason: 'due_run';
    runAt: Date;
    dedupeKey: string;
  }) => Promise<void>;
}, deps?: {
  listTickGuilds?: typeof listAstroTickGuilds;
}): Promise<{ processed: number; queued: number }> {
  const listTickGuilds = deps?.listTickGuilds ?? listAstroTickGuilds;

  const guilds = await listTickGuilds();
  let processed = 0;
  let queued = 0;

  for (const guild of guilds) {
    processed += 1;
    const runAt = guild.nextRunAt ?? input.now;
    await input.enqueue({
      guildId: guild.guildId,
      reason: 'due_run',
      runAt,
      dedupeKey: buildHoroscopeDedupeKey({
        guildId: guild.guildId,
        runAt
      })
    });
    queued += 1;
  }

  logger.info(
    {
      feature: 'astro',
      action: 'tick_daily',
      processed,
      queued
    },
    'Astro daily tick completed',
  );

  return { processed, queued };
}

export async function markHoroscopePublished(input: {
  guildId: string;
  publishedAt?: Date;
  isTest?: boolean;
}): Promise<void> {
  if (input.isTest) {
    return;
  }

  const publishedAt = input.publishedAt ?? new Date();
  const settings = await getGuildSettings(input.guildId);
  const timezone = safeTimezone(settings?.timezone ?? DEFAULT_TIMEZONE);
  const everyDays = normalizeEveryDays(settings?.horoscopeEveryDays);
  const publishedLocal = toTimeZoneParts(publishedAt, timezone);
  const nextLocalDate = addDaysUtc(
    {
      ...publishedLocal,
      hour: HOROSCOPE_LOCAL_RUN_HOUR,
      minute: 0,
      second: 0
    },
    everyDays
  );
  const nextRunAt = zonedLocalToUtc(nextLocalDate, timezone);

  await upsertGuildSettings(input.guildId, {
    horoscopeLastPostAt: publishedAt,
    horoscopeNextRunAt: nextRunAt
  });
}
