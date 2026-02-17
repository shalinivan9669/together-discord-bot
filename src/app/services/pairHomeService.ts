import { and, desc, eq } from 'drizzle-orm';
import { RAID_DAILY_PAIR_CAP_POINTS } from '../../config/constants';
import { dateOnly, startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  checkins,
  duelRounds,
  duelSubmissions,
  duels,
  pairs,
  raidPairDailyTotals,
  raids,
} from '../../infra/db/schema';

export type PairHomeSnapshot = {
  pairId: string;
  guildId: string;
  privateChannelId: string;
  user1Id: string;
  user2Id: string;
  pairHomeMessageId: string | null;
  pairHomePinnedAt: Date | null;
  pairHomePinAttemptedAt: Date | null;
  weekStartDate: string;
  checkinSubmitted: boolean;
  raid: {
    active: boolean;
    raidId: string | null;
    pointsToday: number;
    dailyCap: number;
  };
  duel: {
    active: boolean;
    duelId: string | null;
    publicChannelId: string | null;
    roundId: string | null;
    roundNo: number | null;
    roundEndsAt: Date | null;
    submittedThisRound: boolean;
  };
  updatedAt: Date;
};

export async function getPairHomeSnapshot(pairId: string, now: Date = new Date()): Promise<PairHomeSnapshot | null> {
  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.id, pairId), eq(pairs.status, 'active')))
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    return null;
  }

  const weekStartDate = startOfWeekIso(now);
  const dayDate = dateOnly(now);

  const checkinRows = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.pairId, pair.id), eq(checkins.weekStartDate, weekStartDate)))
    .limit(1);

  const raidRows = await db
    .select()
    .from(raids)
    .where(and(eq(raids.guildId, pair.guildId), eq(raids.status, 'active')))
    .orderBy(desc(raids.createdAt))
    .limit(1);
  const raid = raidRows[0] ?? null;

  let raidPointsToday = 0;
  if (raid) {
    const raidTodayRows = await db
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

    raidPointsToday = raidTodayRows[0]?.pointsTotal ?? 0;
  }

  const duelRows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.guildId, pair.guildId), eq(duels.status, 'active')))
    .orderBy(desc(duels.createdAt))
    .limit(1);
  const duel = duelRows[0] ?? null;

  let roundId: string | null = null;
  let roundNo: number | null = null;
  let roundEndsAt: Date | null = null;
  let submittedThisRound = false;

  if (duel) {
    const roundRows = await db
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.duelId, duel.id), eq(duelRounds.status, 'active')))
      .orderBy(desc(duelRounds.roundNo))
      .limit(1);

    const round = roundRows[0] ?? null;
    if (round) {
      roundId = round.id;
      roundNo = round.roundNo;
      roundEndsAt = round.endsAt;

      const submissionRows = await db
        .select({ id: duelSubmissions.id })
        .from(duelSubmissions)
        .where(and(eq(duelSubmissions.roundId, round.id), eq(duelSubmissions.pairId, pair.id)))
        .limit(1);

      submittedThisRound = Boolean(submissionRows[0]);
    }
  }

  return {
    pairId: pair.id,
    guildId: pair.guildId,
    privateChannelId: pair.privateChannelId,
    user1Id: pair.user1Id,
    user2Id: pair.user2Id,
    pairHomeMessageId: pair.pairHomeMessageId ?? null,
    pairHomePinnedAt: pair.pairHomePinnedAt ?? null,
    pairHomePinAttemptedAt: pair.pairHomePinAttemptedAt ?? null,
    weekStartDate,
    checkinSubmitted: Boolean(checkinRows[0]),
    raid: {
      active: Boolean(raid),
      raidId: raid?.id ?? null,
      pointsToday: raidPointsToday,
      dailyCap: RAID_DAILY_PAIR_CAP_POINTS
    },
    duel: {
      active: Boolean(duel),
      duelId: duel?.id ?? null,
      publicChannelId: duel?.publicChannelId ?? null,
      roundId,
      roundNo,
      roundEndsAt,
      submittedThisRound,
    },
    updatedAt: now
  };
}
