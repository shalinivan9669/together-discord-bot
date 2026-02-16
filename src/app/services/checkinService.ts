import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
  CHECKIN_SCALE_MAX,
  CHECKIN_SCALE_MIN,
} from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { agreementsLibrary, checkins, guildSettings, pairs } from '../../infra/db/schema';
import { createScheduledPost } from './publicPostService';
import { awardPairReward } from './rewardsService';

export function ensureCheckinEnabled(): void {
  if (!isFeatureEnabled('checkin')) {
    throw new Error('Check-in feature is disabled');
  }
}

export async function getPairForCheckinChannel(input: {
  guildId: string;
  channelId: string;
  userId: string;
}) {
  const pairRows = await db
    .select()
    .from(pairs)
    .where(
      and(
        eq(pairs.guildId, input.guildId),
        eq(pairs.privateChannelId, input.channelId),
        eq(pairs.status, 'active'),
      ),
    )
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    return null;
  }

  if (pair.user1Id !== input.userId && pair.user2Id !== input.userId) {
    return null;
  }

  return pair;
}

export async function listActiveAgreements(limit = 25) {
  return db
    .select()
    .from(agreementsLibrary)
    .where(eq(agreementsLibrary.active, true))
    .limit(limit);
}

function validateScores(scores: readonly number[]) {
  if (scores.length !== 5) {
    throw new Error('Check-in requires exactly 5 scores');
  }

  for (const score of scores) {
    if (!Number.isInteger(score) || score < CHECKIN_SCALE_MIN || score > CHECKIN_SCALE_MAX) {
      throw new Error(`Each score must be integer ${CHECKIN_SCALE_MIN}-${CHECKIN_SCALE_MAX}`);
    }
  }
}

export async function submitWeeklyCheckin(input: {
  guildId: string;
  pairId: string;
  userId: string;
  agreementKey: string;
  scores: [number, number, number, number, number];
  now?: Date;
}) {
  ensureCheckinEnabled();
  validateScores(input.scores);

  const now = input.now ?? new Date();
  const weekStartDate = startOfWeekIso(now);

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, input.guildId), eq(pairs.id, input.pairId), eq(pairs.status, 'active')))
    .limit(1);
  const pair = pairRows[0];
  if (!pair) {
    throw new Error('Pair not found');
  }

  if (pair.user1Id !== input.userId && pair.user2Id !== input.userId) {
    throw new Error('Only pair members can submit check-in');
  }

  const agreementRows = await db
    .select()
    .from(agreementsLibrary)
    .where(and(eq(agreementsLibrary.key, input.agreementKey), eq(agreementsLibrary.active, true)))
    .limit(1);
  if (!agreementRows[0]) {
    throw new Error('Selected agreement is not available');
  }

  const inserted = await db
    .insert(checkins)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      pairId: input.pairId,
      weekStartDate,
      scoresJson: {
        q1: input.scores[0],
        q2: input.scores[1],
        q3: input.scores[2],
        q4: input.scores[3],
        q5: input.scores[4]
      },
      agreementKey: input.agreementKey,
      status: 'submitted'
    })
    .onConflictDoNothing({
      target: [checkins.pairId, checkins.weekStartDate]
    })
    .returning();

  const row = inserted[0]
    ? inserted[0]
    : (
        await db
          .select()
          .from(checkins)
          .where(and(eq(checkins.pairId, input.pairId), eq(checkins.weekStartDate, weekStartDate)))
          .limit(1)
      )[0];

  if (!row) {
    throw new Error('Failed to persist check-in');
  }

  if (inserted[0]) {
    await awardPairReward({
      guildId: input.guildId,
      pairId: input.pairId,
      userIds: [pair.user1Id, pair.user2Id],
      kind: 'checkin',
      amount: 5,
      key: `checkin:${row.id}`,
      sourceType: 'checkin',
      sourceId: row.id
    });
  }

  return { checkin: row, created: Boolean(inserted[0]), pair };
}

export async function scheduleCheckinAgreementShare(input: {
  guildId: string;
  checkinId: string;
  requesterUserId: string;
}) {
  ensureCheckinEnabled();

  const checkinRows = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.guildId, input.guildId), eq(checkins.id, input.checkinId)))
    .limit(1);
  const checkin = checkinRows[0];
  if (!checkin) {
    throw new Error('Check-in not found');
  }

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, input.guildId), eq(pairs.id, checkin.pairId), eq(pairs.status, 'active')))
    .limit(1);
  const pair = pairRows[0];
  if (!pair) {
    throw new Error('Pair for check-in not found');
  }

  if (pair.user1Id !== input.requesterUserId && pair.user2Id !== input.requesterUserId) {
    throw new Error('Only pair members can share agreement');
  }

  const settingsRows = await db
    .select({
      duelPublicChannelId: guildSettings.duelPublicChannelId
    })
    .from(guildSettings)
    .where(and(eq(guildSettings.guildId, input.guildId), isNotNull(guildSettings.duelPublicChannelId)))
    .limit(1);
  const publicChannelId = settingsRows[0]?.duelPublicChannelId;
  if (!publicChannelId) {
    throw new Error('Duel public channel is not configured for agreement sharing');
  }

  const agreementRows = await db
    .select()
    .from(agreementsLibrary)
    .where(eq(agreementsLibrary.key, checkin.agreementKey))
    .limit(1);
  const agreement = agreementRows[0];
  if (!agreement) {
    throw new Error('Agreement not found');
  }

  const scheduled = await createScheduledPost({
    guildId: input.guildId,
    type: 'checkin_agreement',
    targetChannelId: publicChannelId,
    payloadJson: {
      checkinId: checkin.id,
      agreementText: agreement.text,
      user1Id: pair.user1Id,
      user2Id: pair.user2Id,
      weekStartDate: checkin.weekStartDate
    },
    idempotencyKey: `checkin:share:${checkin.id}`
  });

  return {
    scheduledPostId: scheduled.id,
    created: scheduled.created
  };
}

export async function scheduleWeeklyCheckinNudges(now: Date = new Date()): Promise<number> {
  ensureCheckinEnabled();
  const weekStartDate = startOfWeekIso(now);

  const guildRows = await db
    .select({
      guildId: guildSettings.guildId,
      duelPublicChannelId: guildSettings.duelPublicChannelId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.duelPublicChannelId));

  let created = 0;

  for (const guild of guildRows) {
    const channelId = guild.duelPublicChannelId;
    if (!channelId) {
      continue;
    }

    const row = await createScheduledPost({
      guildId: guild.guildId,
      type: 'checkin_nudge',
      targetChannelId: channelId,
      payloadJson: { weekStartDate },
      idempotencyKey: `checkin:nudge:${guild.guildId}:${weekStartDate}`,
      scheduledFor: now
    });

    if (row.created) {
      created += 1;
    }
  }

  return created;
}
