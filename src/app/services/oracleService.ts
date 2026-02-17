import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { startOfWeekIso } from '../../lib/time';
import { logger } from '../../lib/logger';
import { db } from '../../infra/db/drizzle';
import { contentOracleArchetypes, guildSettings, oracleClaims, oracleWeeks } from '../../infra/db/schema';
import { assertGuildFeatureEnabled, getGuildFeatureState } from './guildConfigService';

export const ORACLE_MODES = ['soft', 'neutral', 'hard'] as const;
export type OracleMode = (typeof ORACLE_MODES)[number];

export const ORACLE_CONTEXTS = [
  'conflict',
  'ok',
  'boredom',
  'distance',
  'fatigue',
  'jealousy',
] as const;
export type OracleContext = (typeof ORACLE_CONTEXTS)[number];

const variantSchema = z.object({
  risk: z.string(),
  step: z.string(),
  keyPhrase: z.string(),
  taboo: z.string(),
  miniChallenge: z.string(),
});

type Variant = z.infer<typeof variantSchema>;

const oracleModeLabelsRu: Record<OracleMode, string> = {
  soft: 'Мягко',
  neutral: 'Честно',
  hard: 'Жёстко',
};

const oracleContextLabelsRu: Record<OracleContext, string> = {
  conflict: 'Ссора',
  ok: 'Всё ок',
  boredom: 'Рутина',
  distance: 'Отдаление',
  fatigue: 'Усталость',
  jealousy: 'Ревность',
};

function normalizeMode(value: string): OracleMode | null {
  const normalized = value.trim().toLowerCase();
  return ORACLE_MODES.find((mode) => mode === normalized) ?? null;
}

function normalizeContext(value: string): OracleContext | null {
  const normalized = value.trim().toLowerCase();
  return ORACLE_CONTEXTS.find((context) => context === normalized) ?? null;
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function pickDeterministic<T>(list: readonly T[], key: string): T {
  const idx = hashNumber(key) % list.length;
  return list[idx]!;
}

function readVariant(variantsJson: unknown, mode: OracleMode, context: OracleContext): Variant {
  const variants = z.record(z.string(), z.record(z.string(), variantSchema)).parse(variantsJson);
  const modeMap = variants[mode];
  if (!modeMap) {
    throw new Error(`Oracle mode "${mode}" not found in archetype variants`);
  }

  const variant = modeMap[context];
  if (!variant) {
    throw new Error(`Oracle context "${context}" not found in archetype variants`);
  }

  return variant;
}

function buildClaimText(params: {
  archetypeTitle: string;
  weekStartDate: string;
  mode: OracleMode;
  context: OracleContext;
  variant: Variant;
}): string {
  return [
    `Оракул недели: ${params.archetypeTitle}`,
    `Неделя: ${params.weekStartDate}`,
    `Тон: ${oracleModeLabelsRu[params.mode]}`,
    `Ситуация: ${oracleContextLabelsRu[params.context]}`,
    '',
    `Риск: ${params.variant.risk}`,
    `Шаг: ${params.variant.step}`,
    `Фраза: ${params.variant.keyPhrase}`,
    `Не делай: ${params.variant.taboo}`,
    `Мини-челлендж: ${params.variant.miniChallenge}`,
  ].join('\n');
}

export async function ensureOracleEnabled(guildId: string): Promise<void> {
  await assertGuildFeatureEnabled(guildId, 'oracle');
}

export function parseOracleMode(input: string): OracleMode | null {
  return normalizeMode(input);
}

export function parseOracleContext(input: string): OracleContext | null {
  return normalizeContext(input);
}

export async function ensureOracleWeek(guildId: string, weekStartDate: string) {
  const existingWeek = await db
    .select()
    .from(oracleWeeks)
    .where(and(eq(oracleWeeks.guildId, guildId), eq(oracleWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (existingWeek[0]) {
    return existingWeek[0];
  }

  const archetypes = await db
    .select({
      key: contentOracleArchetypes.key,
      title: contentOracleArchetypes.title,
    })
    .from(contentOracleArchetypes)
    .where(eq(contentOracleArchetypes.active, true));

  if (archetypes.length === 0) {
    throw new Error('No active oracle archetypes seeded');
  }

  const selected = pickDeterministic(archetypes, `${guildId}:${weekStartDate}`);
  const seed = hashNumber(`${guildId}:${weekStartDate}:${selected.key}`);

  await db
    .insert(oracleWeeks)
    .values({
      id: randomUUID(),
      guildId,
      weekStartDate,
      archetypeKey: selected.key,
      seed,
    })
    .onConflictDoNothing({
      target: [oracleWeeks.guildId, oracleWeeks.weekStartDate],
    });

  const afterInsert = await db
    .select()
    .from(oracleWeeks)
    .where(and(eq(oracleWeeks.guildId, guildId), eq(oracleWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (!afterInsert[0]) {
    throw new Error('Failed to ensure oracle week row');
  }

  return afterInsert[0];
}

export async function scheduleWeeklyOraclePosts(now: Date = new Date()): Promise<number> {
  const weekStartDate = startOfWeekIso(now);

  const guilds = await db
    .select({
      guildId: guildSettings.guildId,
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.oracleChannelId));

  let preparedCount = 0;

  for (const guild of guilds) {
    const state = await getGuildFeatureState(guild.guildId, 'oracle');
    if (!state.enabled || !state.configured) {
      logger.info(
        {
          feature: 'oracle',
          action: 'schedule_prepare_skipped',
          guild_id: guild.guildId,
          reason: state.reason,
        },
        'skipped: missing channel config',
      );
      continue;
    }

    await ensureOracleWeek(guild.guildId, weekStartDate);
    preparedCount += 1;
  }

  return preparedCount;
}

export async function claimOracle(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  mode: OracleMode;
  context: OracleContext;
  now?: Date;
}) {
  await ensureOracleEnabled(input.guildId);
  const now = input.now ?? new Date();
  const weekStartDate = startOfWeekIso(now);

  const existingClaim = await db
    .select()
    .from(oracleClaims)
    .where(
      and(
        eq(oracleClaims.guildId, input.guildId),
        eq(oracleClaims.weekStartDate, weekStartDate),
        eq(oracleClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (existingClaim[0] && existingClaim[0].claimText) {
    return {
      claim: existingClaim[0],
      created: false,
      text: existingClaim[0].claimText,
      weekStartDate,
    };
  }

  const week = await ensureOracleWeek(input.guildId, weekStartDate);
  const archetypeRows = await db
    .select()
    .from(contentOracleArchetypes)
    .where(eq(contentOracleArchetypes.key, week.archetypeKey))
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
    variant,
  });

  const inserted = await db
    .insert(oracleClaims)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      weekStartDate,
      userId: input.userId,
      pairId: input.pairId,
      deliveredTo: 'pending',
      mode: input.mode,
      context: input.context,
      claimText,
    })
    .onConflictDoNothing({
      target: [oracleClaims.guildId, oracleClaims.weekStartDate, oracleClaims.userId],
    })
    .returning();

  if (inserted[0]) {
    return {
      claim: inserted[0],
      created: true,
      text: claimText,
      weekStartDate,
    };
  }

  const afterConflict = await db
    .select()
    .from(oracleClaims)
    .where(
      and(
        eq(oracleClaims.guildId, input.guildId),
        eq(oracleClaims.weekStartDate, weekStartDate),
        eq(oracleClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (!afterConflict[0]) {
    throw new Error('Oracle claim dedupe conflict but row not found');
  }

  return {
    claim: afterConflict[0],
    created: false,
    text: afterConflict[0].claimText ?? claimText,
    weekStartDate,
  };
}

export async function markOracleClaimDelivery(
  claimId: string,
  deliveredTo: 'dm' | 'pair' | 'ephemeral',
) {
  await db.update(oracleClaims).set({ deliveredTo }).where(eq(oracleClaims.id, claimId));
}
