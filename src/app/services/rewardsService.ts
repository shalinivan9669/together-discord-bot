import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { isFeatureEnabled } from '../../config/featureFlags';
import { db } from '../../infra/db/drizzle';
import { progressState, rewardsLedger } from '../../infra/db/schema';

export function ensureRewardsEnabled(): void {
  if (!isFeatureEnabled('rewards')) {
    throw new Error('Rewards feature is disabled');
  }
}

export type AwardRewardInput = {
  guildId: string;
  userId: string;
  pairId?: string | null;
  kind: string;
  amount: number;
  key: string;
  sourceType: string;
  sourceId: string;
};

export async function awardReward(
  input: AwardRewardInput,
): Promise<{ awarded: boolean; level: number | null }> {
  if (!isFeatureEnabled('rewards')) {
    return { awarded: false, level: null };
  }

  const inserted = await db
    .insert(rewardsLedger)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      userId: input.userId,
      pairId: input.pairId ?? null,
      kind: input.kind,
      amount: input.amount,
      key: input.key,
      sourceType: input.sourceType,
      sourceId: input.sourceId
    })
    .onConflictDoNothing({
      target: [
        rewardsLedger.kind,
        rewardsLedger.key,
        rewardsLedger.sourceType,
        rewardsLedger.sourceId,
        rewardsLedger.userId
      ]
    })
    .returning({ id: rewardsLedger.id });

  if (inserted.length === 0) {
    const existingProgress = await db
      .select({ level: progressState.level })
      .from(progressState)
      .where(and(eq(progressState.guildId, input.guildId), eq(progressState.userId, input.userId)))
      .limit(1);

    return { awarded: false, level: existingProgress[0]?.level ?? null };
  }

  const totalResult = await db
    .select({ total: sql<number>`coalesce(sum(${rewardsLedger.amount}), 0)` })
    .from(rewardsLedger)
    .where(and(eq(rewardsLedger.guildId, input.guildId), eq(rewardsLedger.userId, input.userId)));

  const totalPoints = Number(totalResult[0]?.total ?? 0);
  const level = Math.max(1, Math.floor(totalPoints / 100) + 1);

  await db
    .insert(progressState)
    .values({
      guildId: input.guildId,
      userId: input.userId,
      pairId: input.pairId ?? null,
      level,
      unlocksJson: [],
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [progressState.guildId, progressState.userId],
      set: {
        pairId: input.pairId ?? null,
        level,
        updatedAt: new Date()
      }
    });

  return { awarded: true, level };
}

export async function awardPairReward(input: {
  guildId: string;
  pairId: string;
  userIds: [string, string];
  kind: string;
  amount: number;
  key: string;
  sourceType: string;
  sourceId: string;
}): Promise<void> {
  await awardReward({
    guildId: input.guildId,
    userId: input.userIds[0],
    pairId: input.pairId,
    kind: input.kind,
    amount: input.amount,
    key: input.key,
    sourceType: input.sourceType,
    sourceId: input.sourceId
  });

  await awardReward({
    guildId: input.guildId,
    userId: input.userIds[1],
    pairId: input.pairId,
    kind: input.kind,
    amount: input.amount,
    key: input.key,
    sourceType: input.sourceType,
    sourceId: input.sourceId
  });
}
