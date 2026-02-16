import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type PgBoss from 'pg-boss';
import {
  RAID_DAILY_OFFERS_COUNT,
  RAID_DAILY_PAIR_CAP_POINTS,
  RAID_DEFAULT_GOAL_POINTS,
} from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { requestRaidProgressRefresh } from '../projections/raidProjection';
import { requestPairHomeRefresh } from '../projections/pairHomeProjection';
import { addDays, dateOnly, startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  guildSettings,
  pairs,
  raidClaims,
  raidDailyOffers,
  raidPairDailyTotals,
  raidQuests,
  raids,
} from '../../infra/db/schema';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { awardPairReward } from './rewardsService';

export function ensureRaidEnabled(): void {
  if (!isFeatureEnabled('raid')) {
    throw new Error('Raid feature is disabled');
  }
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function weekStartDateUtc(date: Date): string {
  return startOfWeekIso(date);
}

function weekEndAtUtc(weekStartDate: string): Date {
  return addDays(new Date(`${weekStartDate}T00:00:00.000Z`), 7);
}

export async function getActiveRaidForGuild(guildId: string) {
  const rows = await db
    .select()
    .from(raids)
    .where(and(eq(raids.guildId, guildId), eq(raids.status, 'active')))
    .orderBy(desc(raids.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function ensureDailyOffersForRaid(raidId: string, dayDate: string): Promise<string[]> {
  const existingRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  if (existingRows[0]) {
    const parsed = existingRows[0].questKeysJson;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  }

  const activeQuests = await db
    .select({
      key: raidQuests.key
    })
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  if (activeQuests.length === 0) {
    throw new Error('No active raid quests seeded');
  }

  const selected = [...activeQuests]
    .sort((a, b) => {
      const left = hashNumber(`${raidId}:${dayDate}:${a.key}`);
      const right = hashNumber(`${raidId}:${dayDate}:${b.key}`);
      if (left !== right) {
        return left - right;
      }
      return a.key.localeCompare(b.key);
    })
    .slice(0, Math.min(RAID_DAILY_OFFERS_COUNT, activeQuests.length))
    .map((row) => row.key);

  await db
    .insert(raidDailyOffers)
    .values({
      id: randomUUID(),
      raidId,
      dayDate,
      questKeysJson: selected
    })
    .onConflictDoNothing({
      target: [raidDailyOffers.raidId, raidDailyOffers.dayDate]
    });

  const afterInsertRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  const afterInsert = afterInsertRows[0];
  if (!afterInsert) {
    throw new Error('Failed to create raid daily offers');
  }

  if (!Array.isArray(afterInsert.questKeysJson)) {
    throw new Error('Invalid raid daily offer payload');
  }

  return afterInsert.questKeysJson.filter((value): value is string => typeof value === 'string');
}

export async function generateDailyRaidOffers(now: Date = new Date()): Promise<number> {
  ensureRaidEnabled();
  const day = dateOnly(now);

  const activeRaids = await db
    .select()
    .from(raids)
    .where(and(eq(raids.status, 'active'), lte(raids.createdAt, now)));

  let generated = 0;

  for (const raid of activeRaids) {
    const beforeRows = await db
      .select({ id: raidDailyOffers.id })
      .from(raidDailyOffers)
      .where(and(eq(raidDailyOffers.raidId, raid.id), eq(raidDailyOffers.dayDate, day)))
      .limit(1);

    await ensureDailyOffersForRaid(raid.id, day);

    if (!beforeRows[0]) {
      generated += 1;
    }
  }

  return generated;
}

export async function startRaid(input: {
  guildId: string;
  publicChannelId: string;
  goalPoints?: number;
  createProgressMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId?: string;
  userId?: string;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const weekStartDate = weekStartDateUtc(now);
  const weekEndAt = weekEndAtUtc(weekStartDate);
  const goalPoints = input.goalPoints && input.goalPoints > 0 ? input.goalPoints : RAID_DEFAULT_GOAL_POINTS;

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext('raid.week.start')) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      throw new Error('Raid start is already in progress');
    }

    const existing = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.status, 'active')))
      .orderBy(desc(raids.createdAt))
      .limit(1);

    if (existing[0]) {
      return { raid: existing[0], created: false };
    }

    await tx
      .update(raids)
      .set({ status: 'ended' })
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate), eq(raids.status, 'active')));

    const inserted = await tx
      .insert(raids)
      .values({
        id: randomUUID(),
        guildId: input.guildId,
        status: 'active',
        weekStartDate,
        weekEndAt,
        goalPoints,
        progressPoints: 0,
        publicChannelId: input.publicChannelId
      })
      .onConflictDoNothing({
        target: [raids.guildId, raids.weekStartDate]
      })
      .returning();

    if (inserted[0]) {
      return { raid: inserted[0], created: true };
    }

    const afterConflict = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate)))
      .limit(1);

    if (!afterConflict[0]) {
      throw new Error('Raid conflict but row not found');
    }

    return { raid: afterConflict[0], created: false };
  });

  if (!txResult.created) {
    return txResult;
  }

  const progressMessageId = await input.createProgressMessage('Initializing raid progress...');

  await db
    .update(raids)
    .set({ progressMessageId })
    .where(eq(raids.id, txResult.raid.id));

  await ensureDailyOffersForRaid(txResult.raid.id, dateOnly(now));

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raid.id,
    reason: 'raid_start',
    correlationId: input.correlationId
  });

  return {
    raid: {
      ...txResult.raid,
      progressMessageId
    },
    created: true
  };
}

export async function startWeeklyRaidsForConfiguredGuilds(input: {
  createProgressMessage: (params: { guildId: string; channelId: string; content: string }) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  now?: Date;
}) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  const guildRows = await db
    .select({
      guildId: guildSettings.guildId,
      raidChannelId: guildSettings.raidChannelId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.raidChannelId));

  let created = 0;

  for (const guild of guildRows) {
    const channelId = guild.raidChannelId;
    if (!channelId) {
      continue;
    }

    const result = await startRaid({
      guildId: guild.guildId,
      publicChannelId: channelId,
      goalPoints: RAID_DEFAULT_GOAL_POINTS,
      createProgressMessage: (content) =>
        input.createProgressMessage({
          guildId: guild.guildId,
          channelId,
          content
        }),
      boss: input.boss,
      correlationId: input.correlationId,
      now
    });

    if (result.created) {
      created += 1;
    }
  }

  return created;
}

export async function endExpiredRaids(now: Date = new Date()): Promise<number> {
  ensureRaidEnabled();

  const ended = await db
    .update(raids)
    .set({ status: 'ended' })
    .where(and(eq(raids.status, 'active'), lte(raids.weekEndAt, now)))
    .returning({ id: raids.id });

  return ended.length;
}

export async function getTodayRaidOffers(guildId: string, now: Date = new Date()) {
  ensureRaidEnabled();

  const activeRaid = await getActiveRaidForGuild(guildId);
  if (!activeRaid) {
    throw new Error('No active raid found');
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(activeRaid.id, dayDate);
  if (offerKeys.length === 0) {
    return { raid: activeRaid, dayDate, offers: [] as Array<typeof raidQuests.$inferSelect> };
  }

  const allQuests = await db
    .select()
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  const byKey = new Map(allQuests.map((quest) => [quest.key, quest]));
  const offers = offerKeys.map((key) => byKey.get(key)).filter((value): value is typeof raidQuests.$inferSelect => Boolean(value));

  return { raid: activeRaid, dayDate, offers };
}

export async function claimRaidQuest(input: {
  guildId: string;
  userId: string;
  questKey: string;
  sendConfirmMessage: (params: {
    claimId: string;
    pairId: string;
    pairPrivateChannelId: string;
    claimerUserId: string;
    questKey: string;
    points: number;
  }) => Promise<void>;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const dayDate = dateOnly(now);

  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    throw new Error('No active raid found');
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    throw new Error('Pair room not found for this user');
  }

  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);
  if (!offerKeys.includes(input.questKey)) {
    throw new Error('Quest is not in today offers');
  }

  const questRows = await db
    .select()
    .from(raidQuests)
    .where(and(eq(raidQuests.key, input.questKey), eq(raidQuests.active, true)))
    .limit(1);

  const quest = questRows[0];
  if (!quest) {
    throw new Error('Quest not found');
  }

  const inserted = await db
    .insert(raidClaims)
    .values({
      id: randomUUID(),
      raidId: raid.id,
      dayDate,
      pairId: pair.id,
      questKey: quest.key,
      status: 'pending_confirm',
      basePoints: quest.points,
      bonusPoints: 0,
      requestedByUserId: input.userId
    })
    .onConflictDoNothing({
      target: [raidClaims.raidId, raidClaims.dayDate, raidClaims.pairId, raidClaims.questKey]
    })
    .returning();

  const claim = inserted[0]
    ? inserted[0]
    : (
        await db
          .select()
          .from(raidClaims)
          .where(
            and(
              eq(raidClaims.raidId, raid.id),
              eq(raidClaims.dayDate, dayDate),
              eq(raidClaims.pairId, pair.id),
              eq(raidClaims.questKey, quest.key),
            ),
          )
          .limit(1)
      )[0];

  if (!claim) {
    throw new Error('Failed to create raid claim');
  }

  if (inserted[0]) {
    await input.sendConfirmMessage({
      claimId: claim.id,
      pairId: pair.id,
      pairPrivateChannelId: pair.privateChannelId,
      claimerUserId: input.userId,
      questKey: claim.questKey,
      points: claim.basePoints + claim.bonusPoints
    });
  }

  return { claim, created: Boolean(inserted[0]), pair, raid };
}

export async function confirmRaidClaim(input: {
  guildId: string;
  claimId: string;
  confirmerUserId: string;
  boss: PgBoss;
  correlationId: string;
}) {
  ensureRaidEnabled();

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext(${input.claimId})) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      return { changed: false, appliedPoints: 0, reason: 'locked' as const, raidId: null, pair: null };
    }

    const claimRows = await tx
      .select()
      .from(raidClaims)
      .where(eq(raidClaims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) {
      throw new Error('Claim not found');
    }

    const raidRows = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.id, claim.raidId), eq(raids.guildId, input.guildId)))
      .limit(1);
    const raid = raidRows[0];
    if (!raid) {
      throw new Error('Raid not found');
    }

    const pairRows = await tx
      .select()
      .from(pairs)
      .where(and(eq(pairs.id, claim.pairId), eq(pairs.guildId, input.guildId), eq(pairs.status, 'active')))
      .limit(1);
    const pair = pairRows[0];
    if (!pair) {
      throw new Error('Pair not found for claim');
    }

    if (pair.user1Id !== input.confirmerUserId && pair.user2Id !== input.confirmerUserId) {
      throw new Error('Only pair members can confirm');
    }

    if (claim.requestedByUserId && input.confirmerUserId === claim.requestedByUserId) {
      return { changed: false, appliedPoints: 0, reason: 'same_user' as const, raidId: raid.id, pair };
    }

    if (claim.status === 'confirmed' || claim.status === 'capped') {
      return { changed: false, appliedPoints: 0, reason: 'already_confirmed' as const, raidId: raid.id, pair };
    }

    const totalRows = await tx
      .select()
      .from(raidPairDailyTotals)
      .where(
        and(
          eq(raidPairDailyTotals.raidId, claim.raidId),
          eq(raidPairDailyTotals.dayDate, claim.dayDate),
          eq(raidPairDailyTotals.pairId, claim.pairId),
        ),
      )
      .limit(1);

    const currentTotal = totalRows[0]?.pointsTotal ?? 0;
    const claimPoints = claim.basePoints + claim.bonusPoints;
    const remaining = Math.max(0, RAID_DAILY_PAIR_CAP_POINTS - currentTotal);
    const appliedPoints = Math.max(0, Math.min(remaining, claimPoints));

    if (appliedPoints > 0) {
      await tx
        .insert(raidPairDailyTotals)
        .values({
          raidId: claim.raidId,
          dayDate: claim.dayDate,
          pairId: claim.pairId,
          pointsTotal: currentTotal + appliedPoints
        })
        .onConflictDoUpdate({
          target: [raidPairDailyTotals.raidId, raidPairDailyTotals.dayDate, raidPairDailyTotals.pairId],
          set: {
            pointsTotal: currentTotal + appliedPoints
          }
        });

      await tx
        .update(raids)
        .set({
          progressPoints: raid.progressPoints + appliedPoints
        })
        .where(eq(raids.id, raid.id));
    }

    await tx
      .update(raidClaims)
      .set({
        status: appliedPoints > 0 ? 'confirmed' : 'capped',
        confirmedByUserId: input.confirmerUserId,
        confirmedAt: new Date()
      })
      .where(eq(raidClaims.id, claim.id));

    return {
      changed: true,
      appliedPoints,
      reason: appliedPoints > 0 ? ('confirmed' as const) : ('capped' as const),
      raidId: raid.id,
      pair
    };
  });

  if (!txResult.raidId || !txResult.pair) {
    return txResult;
  }

  if (txResult.appliedPoints > 0) {
    await awardPairReward({
      guildId: input.guildId,
      pairId: txResult.pair.id,
      userIds: [txResult.pair.user1Id, txResult.pair.user2Id],
      kind: 'raid',
      amount: txResult.appliedPoints,
      key: `raid:${input.claimId}`,
      sourceType: 'raid_claim',
      sourceId: input.claimId
    });
  }

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raidId,
    reason: 'claim_confirm',
    correlationId: input.correlationId
  });

  await requestPairHomeRefresh(input.boss, {
    guildId: input.guildId,
    pairId: txResult.pair.id,
    reason: 'raid_claim_confirmed',
    correlationId: input.correlationId,
    userId: input.confirmerUserId
  });

  return txResult;
}

export type RaidProgressPair = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  points: number;
};

export type RaidProgressSnapshot = {
  raidId: string;
  guildId: string;
  status: string;
  weekStartDate: string;
  weekEndAt: Date;
  goalPoints: number;
  progressPoints: number;
  participantsCount: number;
  publicChannelId: string;
  progressMessageId: string | null;
  todayOffers: Array<{ key: string; text: string; points: number }>;
  topPairs: RaidProgressPair[];
  updatedAt: Date;
};

export async function getRaidProgressSnapshot(input: { raidId?: string; guildId?: string; now?: Date }) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  let raid: typeof raids.$inferSelect | null = null;
  if (input.raidId) {
    const rows = await db.select().from(raids).where(eq(raids.id, input.raidId)).limit(1);
    raid = rows[0] ?? null;
  } else if (input.guildId) {
    raid = await getActiveRaidForGuild(input.guildId);
  }

  if (!raid) {
    return null;
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);

  const offerRows = offerKeys.length
    ? await db.select().from(raidQuests).where(eq(raidQuests.active, true)).orderBy(asc(raidQuests.key))
    : [];
  const offerMap = new Map(offerRows.map((row) => [row.key, row]));
  const todayOffers = offerKeys
    .map((key) => offerMap.get(key))
    .filter((row): row is typeof raidQuests.$inferSelect => Boolean(row))
    .map((row) => ({
      key: row.key,
      text: row.text,
      points: row.points
    }));

  const totals = await db
    .select({
      pairId: raidPairDailyTotals.pairId,
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(eq(raidPairDailyTotals.raidId, raid.id))
    .groupBy(raidPairDailyTotals.pairId);

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, raid.guildId), eq(pairs.status, 'active')));
  const pairMap = new Map(pairRows.map((row) => [row.id, row]));

  const topPairs = totals
    .map((total) => {
      const pair = pairMap.get(total.pairId);
      if (!pair) {
        return null;
      }

      return {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        points: Number(total.points ?? 0)
      } satisfies RaidProgressPair;
    })
    .filter((value): value is RaidProgressPair => Boolean(value))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.pairId.localeCompare(b.pairId);
    });

  return {
    raidId: raid.id,
    guildId: raid.guildId,
    status: raid.status,
    weekStartDate: raid.weekStartDate,
    weekEndAt: raid.weekEndAt,
    goalPoints: raid.goalPoints,
    progressPoints: raid.progressPoints,
    participantsCount: pairRows.length,
    publicChannelId: raid.publicChannelId,
    progressMessageId: raid.progressMessageId ?? null,
    todayOffers,
    topPairs,
    updatedAt: new Date()
  } satisfies RaidProgressSnapshot;
}

export async function getRaidContributionForUser(input: {
  guildId: string;
  userId: string;
  now?: Date;
}): Promise<{
  raidId: string;
  pairId: string;
  todayPoints: number;
  weekPoints: number;
  dayDate: string;
} | null> {
  ensureRaidEnabled();
  const now = input.now ?? new Date();
  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    return null;
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    return null;
  }

  const dayDate = dateOnly(now);
  const todayRows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, raid.id),
        eq(raidPairDailyTotals.pairId, pair.id),
        eq(raidPairDailyTotals.dayDate, dayDate),
      ),
    )
    .limit(1);

  const weekRows = await db
    .select({
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(and(eq(raidPairDailyTotals.raidId, raid.id), eq(raidPairDailyTotals.pairId, pair.id)));

  return {
    raidId: raid.id,
    pairId: pair.id,
    dayDate,
    todayPoints: todayRows[0]?.pointsTotal ?? 0,
    weekPoints: Number(weekRows[0]?.points ?? 0)
  };
}

export async function getRaidTodayPointsForPair(input: {
  raidId: string;
  pairId: string;
  dayDate: string;
}): Promise<number> {
  const rows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, input.raidId),
        eq(raidPairDailyTotals.pairId, input.pairId),
        eq(raidPairDailyTotals.dayDate, input.dayDate),
      ),
    )
    .limit(1);

  return rows[0]?.pointsTotal ?? 0;
}
