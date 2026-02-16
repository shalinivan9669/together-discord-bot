import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type PgBoss from 'pg-boss';
import { DUEL_MAX_ROUND_MINUTES, DUEL_MIN_ROUND_MINUTES } from '../../config/constants';
import { DomainError } from '../../domain/errors';
import { computeSubmissionScore, type DuelSubmissionPayload } from '../../domain/duels/scoring';
import { db } from '../../infra/db/drizzle';
import { listActivePairs } from '../../infra/db/queries/duels';
import { duelRounds, duelSubmissions, duels, pairs } from '../../infra/db/schema';
import { JobNames } from '../../infra/queue/jobs';
import { addMinutes } from '../../lib/time';
import { requestScoreboardRefresh } from '../projections/scoreboardProjection';

export type DuelScoreboardPairRow = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  points: number;
  submissions: number;
};

export type DuelScoreboardSnapshot = {
  duelId: string;
  guildId: string;
  status: string;
  publicChannelId: string;
  scoreboardMessageId: string | null;
  roundNo: number | null;
  roundStatus: string;
  roundEndsAt: Date | null;
  topPairs: DuelScoreboardPairRow[];
  totalPairs: number;
  totalSubmissions: number;
  updatedAt: Date;
};

export async function getActiveDuelForGuild(guildId: string) {
  const rows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.guildId, guildId), eq(duels.status, 'active')))
    .orderBy(desc(duels.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function startDuel(params: {
  guildId: string;
  publicChannelId: string;
  createScoreboardMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  const existing = await getActiveDuelForGuild(params.guildId);
  if (existing) {
    return { duel: existing, created: false };
  }

  const duelId = randomUUID();
  const [created] = await db
    .insert(duels)
    .values({
      id: duelId,
      guildId: params.guildId,
      status: 'active',
      publicChannelId: params.publicChannelId
    })
    .returning();

  if (!created) {
    throw new DomainError('Failed to create duel', 'DUEL_CREATE_FAILED');
  }

  const messageId = await params.createScoreboardMessage('Initializing duel scoreboard...');

  await db
    .update(duels)
    .set({ scoreboardMessageId: messageId, updatedAt: new Date() })
    .where(eq(duels.id, duelId));

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'duel_start'
  });

  const duel = await getActiveDuelForGuild(params.guildId);
  if (!duel) {
    throw new DomainError('Duel created but missing', 'DUEL_MISSING');
  }

  return { duel, created: true };
}

export async function endDuel(params: {
  guildId: string;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  const active = await getActiveDuelForGuild(params.guildId);
  if (!active) {
    throw new DomainError('No active duel found', 'DUEL_NOT_FOUND');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(duels)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(duels.id, active.id));

    await tx
      .update(duelRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(and(eq(duelRounds.duelId, active.id), eq(duelRounds.status, 'active')));
  });

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId: active.id,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'duel_end'
  });

  return active;
}

export async function startRound(params: {
  guildId: string;
  durationMinutes: number;
  notifyPair: (params: {
    pairId: string;
    privateChannelId: string;
    duelId: string;
    roundId: string;
    roundNo: number;
    endsAt: Date;
  }) => Promise<void>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  if (params.durationMinutes < DUEL_MIN_ROUND_MINUTES || params.durationMinutes > DUEL_MAX_ROUND_MINUTES) {
    throw new DomainError(
      `Round duration must be between ${DUEL_MIN_ROUND_MINUTES} and ${DUEL_MAX_ROUND_MINUTES} minutes`,
      'ROUND_DURATION_INVALID',
    );
  }

  const now = new Date();
  const endsAt = addMinutes(now, params.durationMinutes);

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${params.guildId}), hashtext('duel.round.start')) as locked`,
    );

    const locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) {
      throw new DomainError('Round start is already in progress', 'ROUND_START_LOCKED');
    }

    const duelRows = await tx
      .select()
      .from(duels)
      .where(and(eq(duels.guildId, params.guildId), eq(duels.status, 'active')))
      .orderBy(desc(duels.createdAt))
      .limit(1);

    const activeDuel = duelRows[0];
    if (!activeDuel) {
      throw new DomainError('No active duel found', 'DUEL_NOT_FOUND');
    }

    const existingRoundRows = await tx
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.duelId, activeDuel.id), eq(duelRounds.status, 'active')))
      .limit(1);

    if (existingRoundRows[0]) {
      throw new DomainError('An active round already exists', 'ROUND_ALREADY_ACTIVE');
    }

    const countRows = await tx
      .select({ maxRound: sql<number>`coalesce(max(${duelRounds.roundNo}), 0)` })
      .from(duelRounds)
      .where(eq(duelRounds.duelId, activeDuel.id));

    const roundNo = Number(countRows[0]?.maxRound ?? 0) + 1;
    const roundId = randomUUID();

    const [round] = await tx
      .insert(duelRounds)
      .values({
        id: roundId,
        duelId: activeDuel.id,
        roundNo,
        status: 'active',
        startedAt: now,
        endsAt
      })
      .returning();

    if (!round) {
      throw new DomainError('Failed to create round', 'ROUND_CREATE_FAILED');
    }

    return {
      duel: activeDuel,
      round
    };
  });

  const activePairs = await listActivePairs(params.guildId);

  for (const pair of activePairs) {
    await params.notifyPair({
      pairId: pair.id,
      privateChannelId: pair.privateChannelId,
      duelId: txResult.duel.id,
      roundId: txResult.round.id,
      roundNo: txResult.round.roundNo,
      endsAt
    });
  }

  await params.boss.send(
    JobNames.DuelRoundClose,
    {
      correlationId: params.correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'duel',
      action: 'round.close',
      duelId: txResult.duel.id,
      roundId: txResult.round.id,
      roundNo: txResult.round.roundNo
    },
    {
      startAfter: endsAt,
      singletonKey: `duel-round-close:${params.guildId}:${txResult.duel.id}:${txResult.round.roundNo}`,
      singletonSeconds: 60,
      retryLimit: 5
    },
  );

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId: txResult.duel.id,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'round_start'
  });

  return {
    duel: txResult.duel,
    round: txResult.round,
    pairCount: activePairs.length
  };
}

export async function closeRound(params: {
  guildId: string;
  duelId: string;
  roundId: string;
  correlationId: string;
  boss: PgBoss;
  interactionId?: string;
  userId?: string;
}) {
  const result = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${params.guildId}), hashtext('duel.round.close')) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      return { changed: false } as const;
    }

    const roundRows = await tx
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.id, params.roundId), eq(duelRounds.duelId, params.duelId)))
      .limit(1);

    const round = roundRows[0];
    if (!round || round.status === 'closed') {
      return { changed: false } as const;
    }

    await tx
      .update(duelRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(duelRounds.id, params.roundId));

    return { changed: true } as const;
  });

  if (result.changed) {
    await requestScoreboardRefresh(params.boss, {
      guildId: params.guildId,
      duelId: params.duelId,
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId,
      reason: 'round_close'
    });
  }

  return result;
}

export async function submitRoundAnswer(params: {
  guildId: string;
  duelId: string;
  roundId: string;
  pairId: string;
  userId: string;
  answer: string;
  correlationId: string;
  interactionId?: string;
  boss: PgBoss;
}) {
  const normalizedAnswer = params.answer.trim();
  if (normalizedAnswer.length < 2 || normalizedAnswer.length > 400) {
    throw new DomainError('Answer must be between 2 and 400 characters', 'DUEL_SUBMISSION_INVALID');
  }

  const roundRows = await db
    .select({
      id: duelRounds.id,
      duelId: duelRounds.duelId,
      status: duelRounds.status,
      endsAt: duelRounds.endsAt
    })
    .from(duelRounds)
    .where(and(eq(duelRounds.id, params.roundId), eq(duelRounds.duelId, params.duelId)))
    .limit(1);

  const round = roundRows[0];
  if (!round || round.status !== 'active') {
    throw new DomainError('Round is not active', 'ROUND_NOT_ACTIVE');
  }

  if (round.endsAt.getTime() < Date.now()) {
    throw new DomainError('Round has ended', 'ROUND_ENDED');
  }

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.id, params.pairId), eq(pairs.guildId, params.guildId), eq(pairs.status, 'active')))
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    throw new DomainError('Pair not found', 'PAIR_NOT_FOUND');
  }

  if (pair.user1Id !== params.userId && pair.user2Id !== params.userId) {
    throw new DomainError('User is not a member of this pair', 'PAIR_ACCESS_DENIED');
  }

  const payload: DuelSubmissionPayload = {
    answer: normalizedAnswer
  };

  const inserted = await db
    .insert(duelSubmissions)
    .values({
      id: randomUUID(),
      roundId: params.roundId,
      pairId: params.pairId,
      payloadJson: payload
    })
    .onConflictDoNothing({
      target: [duelSubmissions.roundId, duelSubmissions.pairId]
    })
    .returning({ id: duelSubmissions.id });

  if (inserted.length > 0) {
    await requestScoreboardRefresh(params.boss, {
      guildId: params.guildId,
      duelId: params.duelId,
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId,
      reason: 'submission'
    });
  }

  return {
    accepted: inserted.length > 0
  };
}

export async function getScoreboardSnapshot(duelId: string): Promise<DuelScoreboardSnapshot> {
  const duelRows = await db.select().from(duels).where(eq(duels.id, duelId)).limit(1);
  const duel = duelRows[0];

  if (!duel) {
    throw new DomainError('Duel not found', 'DUEL_NOT_FOUND');
  }

  const rounds = await db
    .select()
    .from(duelRounds)
    .where(eq(duelRounds.duelId, duel.id))
    .orderBy(asc(duelRounds.roundNo));

  const activeRound = [...rounds].reverse().find((round) => round.status === 'active') ?? null;

  const submissions = await db
    .select({
      pairId: duelSubmissions.pairId,
      payloadJson: duelSubmissions.payloadJson,
      roundId: duelSubmissions.roundId
    })
    .from(duelSubmissions)
    .innerJoin(duelRounds, eq(duelRounds.id, duelSubmissions.roundId))
    .where(eq(duelRounds.duelId, duel.id));

  const duelPairs = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, duel.guildId), eq(pairs.status, 'active')))
    .orderBy(asc(pairs.createdAt));

  const pairMap = new Map(duelPairs.map((pair) => [pair.id, pair]));
  const scoreMap = new Map<string, DuelScoreboardPairRow>();

  for (const submission of submissions) {
    const pair = pairMap.get(submission.pairId);
    if (!pair) {
      continue;
    }

    const payload = submission.payloadJson as DuelSubmissionPayload;
    const points = computeSubmissionScore(payload);

    const current = scoreMap.get(pair.id) ?? {
      pairId: pair.id,
      user1Id: pair.user1Id,
      user2Id: pair.user2Id,
      points: 0,
      submissions: 0
    };

    current.points += points;
    current.submissions += 1;
    scoreMap.set(pair.id, current);
  }

  for (const pair of duelPairs) {
    if (!scoreMap.has(pair.id)) {
      scoreMap.set(pair.id, {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        points: 0,
        submissions: 0
      });
    }
  }

  const topPairs = [...scoreMap.values()].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return a.pairId.localeCompare(b.pairId);
  });

  const latestRoundNo = rounds[rounds.length - 1]?.roundNo ?? null;

  return {
    duelId: duel.id,
    guildId: duel.guildId,
    status: duel.status,
    publicChannelId: duel.publicChannelId,
    scoreboardMessageId: duel.scoreboardMessageId ?? null,
    roundNo: latestRoundNo,
    roundStatus: activeRound ? 'active' : latestRoundNo ? 'closed' : 'not_started',
    roundEndsAt: activeRound?.endsAt ?? null,
    topPairs,
    totalPairs: duelPairs.length,
    totalSubmissions: submissions.length,
    updatedAt: new Date()
  };
}