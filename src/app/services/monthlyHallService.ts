import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../infra/db/drizzle';
import {
  checkins,
  duelRounds,
  duelSubmissions,
  duels,
  guildSettings,
  monthlyHallCards,
  monthlyHallOptIns,
  pairs,
  raidClaims,
  raidPairDailyTotals,
  raids
} from '../../infra/db/schema';

export const MONTHLY_HALL_CATEGORIES = ['checkin', 'raid', 'duel'] as const;
export type MonthlyHallCategory = (typeof MONTHLY_HALL_CATEGORIES)[number];

export type MonthlyHallPeriod = {
  monthKey: string;
  monthLabel: string;
  startAt: Date;
  endAt: Date;
  startDay: string;
  endDay: string;
};

export type MonthlyHallTopPairRow = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  value: number;
};

export type MonthlyHallSnapshot = {
  guildId: string;
  monthKey: string;
  monthLabel: string;
  activePairs: number;
  checkinsDone: number;
  raidParticipation: number;
  duelParticipation: number;
  topCheckinPairs: MonthlyHallTopPairRow[];
  topRaidPairs: MonthlyHallTopPairRow[];
  topDuelPairs: MonthlyHallTopPairRow[];
  generatedAt: Date;
};

export type MonthlyHallOptInStatus = Record<MonthlyHallCategory, boolean>;

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

function monthKeyOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function firstDayOfMonthUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function parseMonthKey(value: string): { year: number; monthIndex: number } {
  if (!MONTH_KEY_REGEX.test(value)) {
    throw new Error('Invalid month key, expected YYYY-MM');
  }

  const [yearPart, monthPart] = value.split('-');
  const year = Number.parseInt(yearPart ?? '', 10);
  const month = Number.parseInt(monthPart ?? '', 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid month key, expected YYYY-MM');
  }

  return {
    year,
    monthIndex: month - 1
  };
}

export function resolveMonthlyHallPeriod(now: Date = new Date(), monthKey?: string): MonthlyHallPeriod {
  const startAt = monthKey
    ? (() => {
        const parsed = parseMonthKey(monthKey);
        return firstDayOfMonthUtc(parsed.year, parsed.monthIndex);
      })()
    : firstDayOfMonthUtc(now.getUTCFullYear(), now.getUTCMonth() - 1);

  const endAt = firstDayOfMonthUtc(startAt.getUTCFullYear(), startAt.getUTCMonth() + 1);

  return {
    monthKey: monthKeyOf(startAt),
    monthLabel: monthFormatter.format(startAt),
    startAt,
    endAt,
    startDay: startAt.toISOString().slice(0, 10),
    endDay: endAt.toISOString().slice(0, 10)
  };
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function emptyOptInStatus(): MonthlyHallOptInStatus {
  return {
    checkin: false,
    raid: false,
    duel: false
  };
}

export async function listConfiguredMonthlyHallGuilds(): Promise<Array<{
  guildId: string;
  hallChannelId: string;
  hallFeatureEnabled: boolean;
}>> {
  const rows = await db
    .select({
      guildId: guildSettings.guildId,
      hallChannelId: guildSettings.hallChannelId,
      features: guildSettings.features
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.hallChannelId));

  const configured: Array<{ guildId: string; hallChannelId: string; hallFeatureEnabled: boolean }> = [];

  for (const row of rows) {
    if (!row.hallChannelId) {
      continue;
    }

    const hallFeatureEnabled =
      !row.features
      || typeof row.features !== 'object'
      || Array.isArray(row.features)
      || typeof (row.features as Record<string, unknown>).hall !== 'boolean'
      ? true
      : Boolean((row.features as Record<string, unknown>).hall);

    configured.push({
      guildId: row.guildId,
      hallChannelId: row.hallChannelId,
      hallFeatureEnabled
    });
  }

  return configured;
}

export async function ensureMonthlyHallCardRecord(input: {
  guildId: string;
  monthKey: string;
  channelId: string;
}) {
  const inserted = await db
    .insert(monthlyHallCards)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      monthKey: input.monthKey,
      channelId: input.channelId,
      messageId: null,
      updatedAt: new Date()
    })
    .onConflictDoNothing({
      target: [monthlyHallCards.guildId, monthlyHallCards.monthKey]
    })
    .returning();

  if (inserted[0]) {
    return inserted[0];
  }

  const existing = await db
    .select()
    .from(monthlyHallCards)
    .where(and(eq(monthlyHallCards.guildId, input.guildId), eq(monthlyHallCards.monthKey, input.monthKey)))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new Error('Monthly hall card conflict detected but row not found');
  }

  if (row.channelId === input.channelId) {
    return row;
  }

  const moved = await db
    .update(monthlyHallCards)
    .set({
      channelId: input.channelId,
      messageId: null,
      updatedAt: new Date()
    })
    .where(eq(monthlyHallCards.id, row.id))
    .returning();

  return moved[0] ?? row;
}

export async function getMonthlyHallCardByGuildMonth(guildId: string, monthKey: string) {
  const rows = await db
    .select()
    .from(monthlyHallCards)
    .where(and(eq(monthlyHallCards.guildId, guildId), eq(monthlyHallCards.monthKey, monthKey)))
    .limit(1);

  return rows[0] ?? null;
}

export async function setMonthlyHallMessageIdIfUnset(input: {
  cardId: string;
  channelId: string;
  messageId: string;
}): Promise<boolean> {
  const updated = await db
    .update(monthlyHallCards)
    .set({
      channelId: input.channelId,
      messageId: input.messageId,
      updatedAt: new Date()
    })
    .where(and(eq(monthlyHallCards.id, input.cardId), isNull(monthlyHallCards.messageId)))
    .returning({ id: monthlyHallCards.id });

  return Boolean(updated[0]);
}

export async function clearMonthlyHallMessageId(cardId: string): Promise<void> {
  await db
    .update(monthlyHallCards)
    .set({
      messageId: null,
      updatedAt: new Date()
    })
    .where(eq(monthlyHallCards.id, cardId));
}

export async function touchMonthlyHallCard(cardId: string): Promise<void> {
  await db
    .update(monthlyHallCards)
    .set({
      updatedAt: new Date()
    })
    .where(eq(monthlyHallCards.id, cardId));
}

export async function setMonthlyHallOptIn(input: {
  guildId: string;
  userId: string;
  categories: MonthlyHallCategory[];
  enabled: boolean;
}): Promise<void> {
  if (input.categories.length === 0) {
    return;
  }

  if (input.enabled) {
    for (const category of input.categories) {
      await db
        .insert(monthlyHallOptIns)
        .values({
          guildId: input.guildId,
          userId: input.userId,
          category,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [monthlyHallOptIns.guildId, monthlyHallOptIns.userId, monthlyHallOptIns.category],
          set: {
            updatedAt: new Date()
          }
        });
    }

    return;
  }

  await db
    .delete(monthlyHallOptIns)
    .where(
      and(
        eq(monthlyHallOptIns.guildId, input.guildId),
        eq(monthlyHallOptIns.userId, input.userId),
        inArray(monthlyHallOptIns.category, input.categories),
      ),
    );
}

export async function getMonthlyHallOptInStatus(guildId: string, userId: string): Promise<MonthlyHallOptInStatus> {
  const rows = await db
    .select({
      category: monthlyHallOptIns.category
    })
    .from(monthlyHallOptIns)
    .where(and(eq(monthlyHallOptIns.guildId, guildId), eq(monthlyHallOptIns.userId, userId)));

  const status = emptyOptInStatus();
  for (const row of rows) {
    if (MONTHLY_HALL_CATEGORIES.includes(row.category as MonthlyHallCategory)) {
      status[row.category as MonthlyHallCategory] = true;
    }
  }

  return status;
}

type RawTopValue = { pairId: string; value: number };
type PairLite = {
  id: string;
  user1Id: string;
  user2Id: string;
  status: string;
};

function buildOptInSets(rows: Array<{ category: string; userId: string }>): Record<MonthlyHallCategory, Set<string>> {
  const sets: Record<MonthlyHallCategory, Set<string>> = {
    checkin: new Set<string>(),
    raid: new Set<string>(),
    duel: new Set<string>()
  };

  for (const row of rows) {
    if (row.category === 'checkin' || row.category === 'raid' || row.category === 'duel') {
      sets[row.category].add(row.userId);
    }
  }

  return sets;
}

function toTopRows(
  raw: RawTopValue[],
  pairMap: Map<string, PairLite>,
  allowedUsers: Set<string>,
  limit: number,
): MonthlyHallTopPairRow[] {
  if (allowedUsers.size === 0) {
    return [];
  }

  return raw
    .map((row) => {
      const pair = pairMap.get(row.pairId);
      if (!pair) {
        return null;
      }

      if (!allowedUsers.has(pair.user1Id) || !allowedUsers.has(pair.user2Id)) {
        return null;
      }

      return {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        value: row.value
      } satisfies MonthlyHallTopPairRow;
    })
    .filter((row): row is MonthlyHallTopPairRow => Boolean(row))
    .sort((a, b) => {
      if (b.value !== a.value) {
        return b.value - a.value;
      }
      return a.pairId.localeCompare(b.pairId);
    })
    .slice(0, limit);
}

export async function buildMonthlyHallSnapshot(input: {
  guildId: string;
  now?: Date;
  monthKey?: string;
  topLimit?: number;
}): Promise<MonthlyHallSnapshot> {
  const period = resolveMonthlyHallPeriod(input.now ?? new Date(), input.monthKey);
  const topLimit = input.topLimit ?? 5;

  const pairRows = await db
    .select({
      id: pairs.id,
      user1Id: pairs.user1Id,
      user2Id: pairs.user2Id,
      status: pairs.status
    })
    .from(pairs)
    .where(eq(pairs.guildId, input.guildId));

  const pairMap = new Map(pairRows.map((row) => [row.id, row]));
  const activePairs = pairRows.reduce((count, row) => count + (row.status === 'active' ? 1 : 0), 0);

  const optInRows = await db
    .select({
      category: monthlyHallOptIns.category,
      userId: monthlyHallOptIns.userId
    })
    .from(monthlyHallOptIns)
    .where(eq(monthlyHallOptIns.guildId, input.guildId));

  const optInSets = buildOptInSets(optInRows);

  const checkinsDoneResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkins)
    .where(
      and(eq(checkins.guildId, input.guildId), gte(checkins.createdAt, period.startAt), lt(checkins.createdAt, period.endAt)),
    );

  const checkinTopResult = await db
    .select({
      pairId: checkins.pairId,
      value: sql<number>`count(*)`
    })
    .from(checkins)
    .where(
      and(eq(checkins.guildId, input.guildId), gte(checkins.createdAt, period.startAt), lt(checkins.createdAt, period.endAt)),
    )
    .groupBy(checkins.pairId);

  const raidParticipationResult = await db
    .select({
      count: sql<number>`count(distinct ${raidClaims.pairId})`
    })
    .from(raidClaims)
    .innerJoin(raids, eq(raids.id, raidClaims.raidId))
    .where(
      and(
        eq(raids.guildId, input.guildId),
        gte(raidClaims.createdAt, period.startAt),
        lt(raidClaims.createdAt, period.endAt),
        inArray(raidClaims.status, ['confirmed', 'capped']),
      ),
    );

  const raidTopResult = await db
    .select({
      pairId: raidPairDailyTotals.pairId,
      value: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .innerJoin(raids, eq(raids.id, raidPairDailyTotals.raidId))
    .where(
      and(
        eq(raids.guildId, input.guildId),
        gte(raidPairDailyTotals.dayDate, period.startDay),
        lt(raidPairDailyTotals.dayDate, period.endDay),
      ),
    )
    .groupBy(raidPairDailyTotals.pairId);

  const duelParticipationResult = await db
    .select({
      count: sql<number>`count(distinct ${duelSubmissions.pairId})`
    })
    .from(duelSubmissions)
    .innerJoin(duelRounds, eq(duelRounds.id, duelSubmissions.roundId))
    .innerJoin(duels, eq(duels.id, duelRounds.duelId))
    .where(
      and(
        eq(duels.guildId, input.guildId),
        gte(duelSubmissions.createdAt, period.startAt),
        lt(duelSubmissions.createdAt, period.endAt),
      ),
    );

  const duelTopResult = await db
    .select({
      pairId: duelSubmissions.pairId,
      value: sql<number>`count(*)`
    })
    .from(duelSubmissions)
    .innerJoin(duelRounds, eq(duelRounds.id, duelSubmissions.roundId))
    .innerJoin(duels, eq(duels.id, duelRounds.duelId))
    .where(
      and(
        eq(duels.guildId, input.guildId),
        gte(duelSubmissions.createdAt, period.startAt),
        lt(duelSubmissions.createdAt, period.endAt),
      ),
    )
    .groupBy(duelSubmissions.pairId);

  const checkinTopRaw = checkinTopResult.map((row) => ({
    pairId: row.pairId,
    value: toNumber(row.value)
  }));

  const raidTopRaw = raidTopResult.map((row) => ({
    pairId: row.pairId,
    value: toNumber(row.value)
  }));

  const duelTopRaw = duelTopResult.map((row) => ({
    pairId: row.pairId,
    value: toNumber(row.value)
  }));

  return {
    guildId: input.guildId,
    monthKey: period.monthKey,
    monthLabel: period.monthLabel,
    activePairs,
    checkinsDone: toNumber(checkinsDoneResult[0]?.count),
    raidParticipation: toNumber(raidParticipationResult[0]?.count),
    duelParticipation: toNumber(duelParticipationResult[0]?.count),
    topCheckinPairs: toTopRows(checkinTopRaw, pairMap, optInSets.checkin, topLimit),
    topRaidPairs: toTopRows(raidTopRaw, pairMap, optInSets.raid, topLimit),
    topDuelPairs: toTopRows(duelTopRaw, pairMap, optInSets.duel, topLimit),
    generatedAt: new Date()
  };
}
