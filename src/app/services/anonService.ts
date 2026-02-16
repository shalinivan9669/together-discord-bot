import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { ANON_DAILY_PENDING_LIMIT, ANON_MAX_LENGTH } from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { db } from '../../infra/db/drizzle';
import { anonQuestions, guildSettings } from '../../infra/db/schema';
import { createScheduledPost } from './publicPostService';

export function ensureAnonEnabled(): void {
  if (!isFeatureEnabled('anon')) {
    throw new Error('Anonymous questions feature is disabled');
  }
}

export async function createAnonQuestion(input: {
  guildId: string;
  authorUserId: string;
  questionText: string;
  now?: Date;
}) {
  ensureAnonEnabled();

  const normalized = input.questionText.trim();
  if (normalized.length < 2 || normalized.length > ANON_MAX_LENGTH) {
    throw new Error(`Question length must be between 2 and ${ANON_MAX_LENGTH} characters`);
  }

  const now = input.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const pendingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(anonQuestions)
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.authorUserId, input.authorUserId),
        eq(anonQuestions.status, 'pending'),
        gte(anonQuestions.createdAt, dayAgo),
      ),
    );

  if (Number(pendingCount[0]?.count ?? 0) >= ANON_DAILY_PENDING_LIMIT) {
    throw new Error(`Daily pending limit reached (${ANON_DAILY_PENDING_LIMIT})`);
  }

  const [created] = await db
    .insert(anonQuestions)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      authorUserId: input.authorUserId,
      questionText: normalized,
      status: 'pending'
    })
    .returning();

  if (!created) {
    throw new Error('Failed to save anonymous question');
  }

  return created;
}

export async function listPendingAnonQuestions(guildId: string, limit = 5) {
  return db
    .select()
    .from(anonQuestions)
    .where(and(eq(anonQuestions.guildId, guildId), eq(anonQuestions.status, 'pending')))
    .orderBy(desc(anonQuestions.createdAt))
    .limit(limit);
}

export async function rejectAnonQuestion(input: {
  guildId: string;
  questionId: string;
  moderatorUserId: string;
}) {
  ensureAnonEnabled();

  const updated = await db
    .update(anonQuestions)
    .set({
      status: 'rejected',
      approvedBy: input.moderatorUserId,
      approvedAt: new Date()
    })
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.id, input.questionId),
        eq(anonQuestions.status, 'pending'),
      ),
    )
    .returning();

  return { changed: Boolean(updated[0]), row: updated[0] ?? null };
}

export async function approveAnonQuestion(input: {
  guildId: string;
  questionId: string;
  moderatorUserId: string;
}) {
  ensureAnonEnabled();

  const settingsRows = await db
    .select({
      questionsChannelId: guildSettings.questionsChannelId
    })
    .from(guildSettings)
    .where(and(eq(guildSettings.guildId, input.guildId), isNotNull(guildSettings.questionsChannelId)))
    .limit(1);
  const questionsChannelId = settingsRows[0]?.questionsChannelId;
  if (!questionsChannelId) {
    throw new Error('Questions channel is not configured');
  }

  const updated = await db
    .update(anonQuestions)
    .set({
      status: 'approved',
      approvedBy: input.moderatorUserId,
      approvedAt: new Date()
    })
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.id, input.questionId),
        eq(anonQuestions.status, 'pending'),
      ),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select()
      .from(anonQuestions)
      .where(and(eq(anonQuestions.guildId, input.guildId), eq(anonQuestions.id, input.questionId)))
      .limit(1);

    return {
      changed: false,
      scheduledPostId: null as string | null,
      row: existing[0] ?? null
    };
  }

  const scheduled = await createScheduledPost({
    guildId: input.guildId,
    type: 'anon_question',
    targetChannelId: questionsChannelId,
    payloadJson: {
      questionId: row.id,
      questionText: row.questionText,
      guildId: row.guildId,
      authorUserId: row.authorUserId
    },
    idempotencyKey: `anon:publish:${row.id}`,
    scheduledFor: new Date()
  });

  return {
    changed: true,
    scheduledPostId: scheduled.id,
    row
  };
}
