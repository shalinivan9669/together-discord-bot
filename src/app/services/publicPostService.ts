import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, or } from 'drizzle-orm';
import type { Client, MessageCreateOptions } from 'discord.js';
import { z } from 'zod';
import { renderWeeklyOraclePost } from '../../discord/projections/oracleWeeklyRenderer';
import { sendComponentsV2Message, type ComponentsV2Message } from '../../discord/ui-v2';
import { buildAnonPublishedButtons } from '../../discord/interactions/components';
import { db } from '../../infra/db/drizzle';
import { anonQuestions, scheduledPosts } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { getGuildFeatureState } from './guildConfigService';

const anonPayloadSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  guildId: z.string(),
  authorUserId: z.string().optional()
});

const checkinAgreementPayloadSchema = z.object({
  checkinId: z.string(),
  agreementText: z.string(),
  user1Id: z.string(),
  user2Id: z.string(),
  weekStartDate: z.string()
});

const checkinNudgePayloadSchema = z.object({
  weekStartDate: z.string()
});

const oracleWeeklyPayloadSchema = z.object({
  guildId: z.string(),
  weekStartDate: z.string()
});

export type ScheduledPostType =
  | 'anon_question'
  | 'checkin_agreement'
  | 'checkin_nudge'
  | 'oracle_weekly'
  | 'text';

export async function createScheduledPost(input: {
  guildId: string;
  type: ScheduledPostType;
  targetChannelId: string;
  payloadJson: unknown;
  scheduledFor?: Date;
  idempotencyKey: string;
}): Promise<{ id: string; created: boolean }> {
  const scheduledFor = input.scheduledFor ?? new Date();

  const inserted = await db
    .insert(scheduledPosts)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      type: input.type,
      targetChannelId: input.targetChannelId,
      payloadJson: input.payloadJson,
      scheduledFor,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
      updatedAt: new Date()
    })
    .onConflictDoNothing({ target: scheduledPosts.idempotencyKey })
    .returning({ id: scheduledPosts.id });

  if (inserted[0]) {
    return { id: inserted[0].id, created: true };
  }

  const existing = await db
    .select({ id: scheduledPosts.id })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing[0]) {
    throw new Error('Scheduled post conflict detected but row not found');
  }

  return { id: existing[0].id, created: false };
}

function isSendableChannel(
  channel: unknown,
): channel is { send: (options: string | MessageCreateOptions) => Promise<{ id: string }> } {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'send' in channel && typeof channel.send === 'function';
}

type BuiltMessage =
  | { kind: 'legacy'; options: string | MessageCreateOptions }
  | { kind: 'v2'; message: ComponentsV2Message };

function buildMessageOptions(row: typeof scheduledPosts.$inferSelect): BuiltMessage {
  if (row.type === 'anon_question') {
    const payload = anonPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content: `## Anonymous Question\n${payload.questionText}`,
        components: [buildAnonPublishedButtons(payload.questionId) as never]
      }
    };
  }

  if (row.type === 'checkin_agreement') {
    const payload = checkinAgreementPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content:
          `## Weekly Agreement\n` +
          `Pair: <@${payload.user1Id}> + <@${payload.user2Id}>\n` +
          `Week: \`${payload.weekStartDate}\`\n\n` +
          `> ${payload.agreementText}`
      }
    };
  }

  if (row.type === 'checkin_nudge') {
    const payload = checkinNudgePayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content:
          `## Weekly Check-in Reminder\n` +
          `Week: \`${payload.weekStartDate}\`\n` +
          'Use `/checkin start` in your pair room to submit this week.',
      }
    };
  }

  if (row.type === 'oracle_weekly') {
    const payload = oracleWeeklyPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'v2',
      message: renderWeeklyOraclePost({
        guildId: payload.guildId,
        weekStartDate: payload.weekStartDate
      })
    };
  }

  const payload = z.object({ content: z.string() }).parse(row.payloadJson);
  return { kind: 'legacy', options: payload.content };
}

function truncateError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 800);
}

async function finalizeScheduledPost(
  row: typeof scheduledPosts.$inferSelect,
  publishedMessageId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledPosts)
      .set({
        status: 'sent',
        sentAt: new Date(),
        publishedMessageId,
        lastError: null,
        updatedAt: new Date()
      })
      .where(eq(scheduledPosts.id, row.id));

    if (row.type === 'anon_question') {
      const payload = anonPayloadSchema.parse(row.payloadJson);
      await tx
        .update(anonQuestions)
        .set({
          status: 'published',
          publishedMessageId,
          approvedAt: new Date()
        })
        .where(eq(anonQuestions.id, payload.questionId));
    }
  });
}

async function failScheduledPost(rowId: string, error: unknown): Promise<void> {
  await db
    .update(scheduledPosts)
    .set({
      status: 'failed',
      lastError: truncateError(error),
      updatedAt: new Date()
    })
    .where(eq(scheduledPosts.id, rowId));
}

async function claimScheduledPost(
  rowId: string,
  staleBefore: Date,
): Promise<typeof scheduledPosts.$inferSelect | null> {
  const claimed = await db
    .update(scheduledPosts)
    .set({
      status: 'processing',
      lastError: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(scheduledPosts.id, rowId),
        or(
          eq(scheduledPosts.status, 'pending'),
          and(eq(scheduledPosts.status, 'processing'), lte(scheduledPosts.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning();

  return claimed[0] ?? null;
}

export async function publishDueScheduledPosts(input: {
  client: Client;
  scheduledPostId?: string;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  if (!input.client.isReady()) {
    throw new Error('Discord client is not ready');
  }

  const limit = input.limit ?? 20;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);

  const rows = input.scheduledPostId
    ? await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, input.scheduledPostId)).limit(1)
    : await db
        .select()
        .from(scheduledPosts)
        .where(
          and(
            lte(scheduledPosts.scheduledFor, now),
            or(
              eq(scheduledPosts.status, 'pending'),
              and(eq(scheduledPosts.status, 'processing'), lte(scheduledPosts.updatedAt, staleBefore)),
            ),
          ),
        )
        .orderBy(asc(scheduledPosts.scheduledFor), asc(scheduledPosts.createdAt))
        .limit(limit);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const claimed = await claimScheduledPost(row.id, staleBefore);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    processed += 1;

    try {
      const featureState = await getGuildFeatureState(claimed.guildId, 'public_post');
      if (!featureState.enabled || !featureState.configured) {
        skipped += 1;

        await db
          .update(scheduledPosts)
          .set({
            status: 'pending',
            lastError: `public_post skipped: ${featureState.reason}`.slice(0, 800),
            updatedAt: new Date()
          })
          .where(eq(scheduledPosts.id, claimed.id));

        logger.info(
          {
            feature: 'public_post',
            action: 'publish_skipped',
            scheduled_post_id: claimed.id,
            guild_id: claimed.guildId,
            reason: featureState.reason
          },
          'skipped: missing channel config',
        );
        continue;
      }

      const messageOptions = buildMessageOptions(claimed);
      let sentMessage: { id: string };

      if (messageOptions.kind === 'v2') {
        sentMessage = await sendComponentsV2Message(input.client, claimed.targetChannelId, messageOptions.message);
      } else {
        const channel = await input.client.channels.fetch(claimed.targetChannelId);
        if (!isSendableChannel(channel)) {
          throw new Error(`Channel ${claimed.targetChannelId} is not sendable`);
        }

        sentMessage = await channel.send(messageOptions.options);
      }

      await finalizeScheduledPost(claimed, sentMessage.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      await failScheduledPost(claimed.id, error);
      logger.error(
        {
          feature: 'public_post',
          action: 'publish_failed',
          scheduled_post_id: claimed.id,
          error
        },
        'Failed to publish scheduled post',
      );
    }
  }

  return { processed, sent, failed, skipped };
}

