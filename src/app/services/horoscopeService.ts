import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { isFeatureEnabled } from '../../config/featureFlags';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { contentHoroscopeArchetypes, guildSettings, horoscopeClaims, horoscopeWeeks } from '../../infra/db/schema';

export const HOROSCOPE_MODES = ['soft', 'neutral', 'hard'] as const;
export type HoroscopeMode = (typeof HOROSCOPE_MODES)[number];

export const HOROSCOPE_CONTEXTS = [
  'conflict',
  'ok',
  'boredom',
  'distance',
  'fatigue',
  'jealousy'
] as const;
export type HoroscopeContext = (typeof HOROSCOPE_CONTEXTS)[number];

const variantSchema = z.object({
  risk: z.string(),
  step: z.string(),
  keyPhrase: z.string(),
  taboo: z.string(),
  miniChallenge: z.string()
});

type Variant = z.infer<typeof variantSchema>;

function normalizeMode(value: string): HoroscopeMode | null {
  const normalized = value.trim().toLowerCase();
  return HOROSCOPE_MODES.find((mode) => mode === normalized) ?? null;
}

function normalizeContext(value: string): HoroscopeContext | null {
  const normalized = value.trim().toLowerCase();
  return HOROSCOPE_CONTEXTS.find((context) => context === normalized) ?? null;
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function pickDeterministic<T>(list: readonly T[], key: string): T {
  const idx = hashNumber(key) % list.length;
  return list[idx]!;
}

function readVariant(
  variantsJson: unknown,
  mode: HoroscopeMode,
  context: HoroscopeContext,
): Variant {
  const variants = z.record(z.string(), z.record(z.string(), variantSchema)).parse(variantsJson);
  const modeMap = variants[mode];
  if (!modeMap) {
    throw new Error(`Horoscope mode "${mode}" not found in archetype variants`);
  }

  const variant = modeMap[context];
  if (!variant) {
    throw new Error(`Horoscope context "${context}" not found in archetype variants`);
  }

  return variant;
}

function buildClaimText(params: {
  archetypeTitle: string;
  weekStartDate: string;
  mode: HoroscopeMode;
  context: HoroscopeContext;
  variant: Variant;
}): string {
  return [
    `## Weekly Horoscope: ${params.archetypeTitle}`,
    `Week: \`${params.weekStartDate}\``,
    `Mode: **${params.mode}**`,
    `Context: **${params.context}**`,
    '',
    `Risk: ${params.variant.risk}`,
    `Action step: ${params.variant.step}`,
    `Key phrase: "${params.variant.keyPhrase}"`,
    `Avoid: ${params.variant.taboo}`,
    `Mini challenge: ${params.variant.miniChallenge}`
  ].join('\n');
}

export function ensureHoroscopeEnabled(): void {
  if (!isFeatureEnabled('horoscope')) {
    throw new Error('Horoscope feature is disabled');
  }
}

export function parseHoroscopeMode(input: string): HoroscopeMode | null {
  return normalizeMode(input);
}

export function parseHoroscopeContext(input: string): HoroscopeContext | null {
  return normalizeContext(input);
}

export async function ensureHoroscopeWeek(guildId: string, weekStartDate: string) {
  const existingWeek = await db
    .select()
    .from(horoscopeWeeks)
    .where(and(eq(horoscopeWeeks.guildId, guildId), eq(horoscopeWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (existingWeek[0]) {
    return existingWeek[0];
  }

  const archetypes = await db
    .select({
      key: contentHoroscopeArchetypes.key,
      title: contentHoroscopeArchetypes.title
    })
    .from(contentHoroscopeArchetypes)
    .where(eq(contentHoroscopeArchetypes.active, true));

  if (archetypes.length === 0) {
    throw new Error('No active horoscope archetypes seeded');
  }

  const selected = pickDeterministic(archetypes, `${guildId}:${weekStartDate}`);
  const seed = hashNumber(`${guildId}:${weekStartDate}:${selected.key}`);

  await db
    .insert(horoscopeWeeks)
    .values({
      id: randomUUID(),
      guildId,
      weekStartDate,
      archetypeKey: selected.key,
      seed
    })
    .onConflictDoNothing({
      target: [horoscopeWeeks.guildId, horoscopeWeeks.weekStartDate]
    });

  const afterInsert = await db
    .select()
    .from(horoscopeWeeks)
    .where(and(eq(horoscopeWeeks.guildId, guildId), eq(horoscopeWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (!afterInsert[0]) {
    throw new Error('Failed to ensure horoscope week row');
  }

  return afterInsert[0];
}

export async function scheduleWeeklyHoroscopePosts(now: Date = new Date()): Promise<number> {
  ensureHoroscopeEnabled();
  const weekStartDate = startOfWeekIso(now);

  const guilds = await db
    .select({
      guildId: guildSettings.guildId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.horoscopeChannelId));

  let preparedCount = 0;

  for (const guild of guilds) {
    await ensureHoroscopeWeek(guild.guildId, weekStartDate);
    preparedCount += 1;
  }

  return preparedCount;
}

export async function claimHoroscope(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  mode: HoroscopeMode;
  context: HoroscopeContext;
  now?: Date;
}) {
  ensureHoroscopeEnabled();
  const now = input.now ?? new Date();
  const weekStartDate = startOfWeekIso(now);

  const existingClaim = await db
    .select()
    .from(horoscopeClaims)
    .where(
      and(
        eq(horoscopeClaims.guildId, input.guildId),
        eq(horoscopeClaims.weekStartDate, weekStartDate),
        eq(horoscopeClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (existingClaim[0] && existingClaim[0].claimText) {
    return {
      claim: existingClaim[0],
      created: false,
      text: existingClaim[0].claimText,
      weekStartDate
    };
  }

  const week = await ensureHoroscopeWeek(input.guildId, weekStartDate);
  const archetypeRows = await db
    .select()
    .from(contentHoroscopeArchetypes)
    .where(eq(contentHoroscopeArchetypes.key, week.archetypeKey))
    .limit(1);

  const archetype = archetypeRows[0];
  if (!archetype) {
    throw new Error(`Archetype "${week.archetypeKey}" not found`);
  }

  const variant = readVariant(archetype.variantsJson, input.mode, input.context);
  const claimText = buildClaimText({
    archetypeTitle: archetype.title,
    weekStartDate,
    mode: input.mode,
    context: input.context,
    variant
  });

  const inserted = await db
    .insert(horoscopeClaims)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      weekStartDate,
      userId: input.userId,
      pairId: input.pairId,
      deliveredTo: 'pending',
      mode: input.mode,
      context: input.context,
      claimText
    })
    .onConflictDoNothing({
      target: [horoscopeClaims.guildId, horoscopeClaims.weekStartDate, horoscopeClaims.userId]
    })
    .returning();

  if (inserted[0]) {
    return {
      claim: inserted[0],
      created: true,
      text: claimText,
      weekStartDate
    };
  }

  const afterConflict = await db
    .select()
    .from(horoscopeClaims)
    .where(
      and(
        eq(horoscopeClaims.guildId, input.guildId),
        eq(horoscopeClaims.weekStartDate, weekStartDate),
        eq(horoscopeClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (!afterConflict[0]) {
    throw new Error('Horoscope claim dedupe conflict but row not found');
  }

  return {
    claim: afterConflict[0],
    created: false,
    text: afterConflict[0].claimText ?? claimText,
    weekStartDate
  };
}

export async function markHoroscopeClaimDelivery(claimId: string, deliveredTo: 'dm' | 'pair' | 'ephemeral') {
  await db
    .update(horoscopeClaims)
    .set({
      deliveredTo
    })
    .where(eq(horoscopeClaims.id, claimId));
}
