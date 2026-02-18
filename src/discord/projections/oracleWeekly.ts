import { eq, sql } from 'drizzle-orm';
import type { Client } from 'discord.js';
import { ensureOracleWeek } from '../../app/services/oracleService';
import { getGuildFeatureState } from '../../app/services/guildConfigService';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { guildSettings } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { renderWeeklyOraclePost } from './oracleWeeklyRenderer';
import type { ThrottledMessageEditor } from './messageEditor';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import { getDiscordErrorStatus, withDiscordApiRetry } from './discordApiRetry';
import { Routes } from '../ui-v2/api';

export type WeeklyOracleRefreshStats = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

type SerializedError = {
  error_name: string;
  error_message: string;
  error_stack?: string;
  error_code?: string;
  error_routine?: string;
  error_detail?: string;
  error_hint?: string;
};

async function clearOracleMessageId(guildId: string): Promise<void> {
  await db.execute(sql`
    update guild_settings
    set oracle_message_id = null, updated_at = now()
    where guild_id = ${guildId}
  `);
}

async function setOracleMessageIdIfUnset(input: {
  guildId: string;
  messageId: string;
}): Promise<boolean> {
  const updated = await db.execute<{ guild_id: string }>(sql`
    update guild_settings
    set oracle_message_id = ${input.messageId}, updated_at = now()
    where guild_id = ${input.guildId}
      and oracle_message_id is null
    returning guild_id
  `);

  return updated.rows.length > 0;
}

async function deleteMessageBestEffort(client: Client, channelId: string, messageId: string): Promise<void> {
  try {
    await withDiscordApiRetry({
      feature: 'oracle_weekly',
      action: 'delete_duplicate',
      maxAttempts: 3,
      baseDelayMs: 300,
      context: {
        channel_id: channelId,
        message_id: messageId,
      },
      execute: async () => {
        await client.rest.delete(Routes.channelMessage(channelId, messageId));
      },
    });
  } catch {
    logger.warn(
      {
        feature: 'oracle_weekly',
        channel_id: channelId,
        message_id: messageId,
      },
      'Failed to delete duplicate weekly oracle message',
    );
  }
}

export async function refreshWeeklyOracleProjection(input: {
  client: Client;
  messageEditor: ThrottledMessageEditor;
  weekStartDate?: string;
  guildId?: string;
  correlationId?: string;
  now?: Date;
}): Promise<WeeklyOracleRefreshStats> {
  const weekStartDate = input.weekStartDate ?? startOfWeekIso(input.now ?? new Date());

  const rows = input.guildId
    ? await db
        .select({
          guildId: guildSettings.guildId,
          oracleChannelId: guildSettings.oracleChannelId,
          oracleMessageId: sql<string | null>`oracle_message_id`,
        })
        .from(guildSettings)
        .where(eq(guildSettings.guildId, input.guildId))
    : await db
        .select({
          guildId: guildSettings.guildId,
          oracleChannelId: guildSettings.oracleChannelId,
          oracleMessageId: sql<string | null>`oracle_message_id`,
        })
        .from(guildSettings);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const guildId = String(row.guildId);
    const state = await getGuildFeatureState(guildId, 'oracle');
    if (!state.enabled || !state.configured) {
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_skipped',
          guild_id: guildId,
          correlation_id: input.correlationId,
          reason: state.reason,
        },
        'skipped: missing channel config',
      );
      continue;
    }

    const channelId = normalizeSnowflake(row.oracleChannelId);
    if (!channelId) {
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_skipped',
          guild_id: guildId,
          correlation_id: input.correlationId,
          reason: 'oracle channel not configured',
        },
        'skipped: missing channel config',
      );
      continue;
    }

    processed += 1;
    let step = 'ensure_oracle_week';
    const existingMessageId = normalizeSnowflake(row.oracleMessageId);

    try {
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_started',
          guild_id: guildId,
          week_start_date: weekStartDate,
          correlation_id: input.correlationId,
        },
        'Weekly oracle projection refresh started',
      );
      await ensureOracleWeek(guildId, weekStartDate);
      step = 'render_view';
      const view = renderWeeklyOraclePost({
        weekStartDate,
      });

      if (existingMessageId) {
        step = 'edit_existing_message';
        try {
          await input.messageEditor.queueEdit({
            channelId,
            messageId: existingMessageId,
            components: view.components,
            flags: COMPONENTS_V2_FLAGS,
          });
          updated += 1;
          logger.info(
            {
              feature: 'oracle_weekly',
              action: 'refresh_updated',
              guild_id: guildId,
              week_start_date: weekStartDate,
              correlation_id: input.correlationId,
            },
            'Weekly oracle projection refresh updated existing message',
          );
          continue;
        } catch (error) {
          if (getDiscordErrorStatus(error) !== 404) {
            throw error;
          }

          step = 'clear_missing_message_id';
          await clearOracleMessageId(guildId);
        }
      }

      step = 'create_message';
      const createdMessage = await sendComponentsV2Message(input.client, channelId, view);
      step = 'claim_message_id';
      const claimed = await setOracleMessageIdIfUnset({
        guildId,
        messageId: createdMessage.id,
      });

      if (claimed) {
        created += 1;
        logger.info(
          {
            feature: 'oracle_weekly',
            action: 'refresh_created',
            guild_id: guildId,
            week_start_date: weekStartDate,
            correlation_id: input.correlationId,
            message_id: createdMessage.id,
          },
          'Weekly oracle projection refresh created message',
        );
        continue;
      }

      step = 'sync_latest_message';
      const latestRows = await db
        .select({
          oracleMessageId: sql<string | null>`oracle_message_id`,
          oracleChannelId: guildSettings.oracleChannelId,
        })
        .from(guildSettings)
        .where(eq(guildSettings.guildId, guildId))
        .limit(1);

      const latest = latestRows[0];
      const latestMessageId = normalizeSnowflake(latest?.oracleMessageId ?? null);
      const latestChannelId = normalizeSnowflake(latest?.oracleChannelId ?? null) ?? channelId;
      if (latestMessageId) {
        await input.messageEditor.queueEdit({
          channelId: latestChannelId,
          messageId: latestMessageId,
          components: view.components,
          flags: COMPONENTS_V2_FLAGS,
        });
        updated += 1;
      } else {
        created += 1;
      }

      if (latestMessageId !== createdMessage.id) {
        step = 'delete_duplicate_message';
        await deleteMessageBestEffort(input.client, channelId, createdMessage.id);
      }
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_completed',
          guild_id: guildId,
          week_start_date: weekStartDate,
          correlation_id: input.correlationId,
          created,
          updated,
        },
        'Weekly oracle projection refresh completed',
      );
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'oracle_weekly',
          guild_id: guildId,
          week_start_date: weekStartDate,
          step,
          correlation_id: input.correlationId,
          ...serializeError(error),
        },
        'Weekly oracle projection refresh failed',
      );
    }
  }

  return {
    processed,
    created,
    updated,
    failed,
  };
}

function normalizeSnowflake(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'bigint' && value >= 0n) {
    return value.toString();
  }
  return null;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const extra = error as Error & Record<string, unknown>;
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      error_code: typeof extra.code === 'string' ? extra.code : undefined,
      error_routine: typeof extra.routine === 'string' ? extra.routine : undefined,
      error_detail: typeof extra.detail === 'string' ? extra.detail : undefined,
      error_hint: typeof extra.hint === 'string' ? extra.hint : undefined,
    };
  }

  return {
    error_name: 'NonError',
    error_message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}
