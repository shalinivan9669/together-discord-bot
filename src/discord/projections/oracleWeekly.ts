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
    const state = await getGuildFeatureState(row.guildId, 'oracle');
    if (!state.enabled || !state.configured) {
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_skipped',
          guild_id: row.guildId,
          reason: state.reason,
        },
        'skipped: missing channel config',
      );
      continue;
    }

    const channelId = row.oracleChannelId;
    if (!channelId) {
      logger.info(
        {
          feature: 'oracle_weekly',
          action: 'refresh_skipped',
          guild_id: row.guildId,
          reason: 'oracle channel not configured',
        },
        'skipped: missing channel config',
      );
      continue;
    }

    processed += 1;

    try {
      await ensureOracleWeek(row.guildId, weekStartDate);
      const view = renderWeeklyOraclePost({
        guildId: row.guildId,
        weekStartDate,
      });

      if (row.oracleMessageId) {
        try {
          await input.messageEditor.queueEdit({
            channelId,
            messageId: row.oracleMessageId,
            components: view.components,
            flags: COMPONENTS_V2_FLAGS,
          });
          updated += 1;
          continue;
        } catch (error) {
          if (getDiscordErrorStatus(error) !== 404) {
            throw error;
          }

          await clearOracleMessageId(row.guildId);
        }
      }

      const createdMessage = await sendComponentsV2Message(input.client, channelId, view);
      const claimed = await setOracleMessageIdIfUnset({
        guildId: row.guildId,
        messageId: createdMessage.id,
      });

      if (claimed) {
        created += 1;
        continue;
      }

      const latestRows = await db
        .select({
          oracleMessageId: sql<string | null>`oracle_message_id`,
          oracleChannelId: guildSettings.oracleChannelId,
        })
        .from(guildSettings)
        .where(eq(guildSettings.guildId, row.guildId))
        .limit(1);

      const latest = latestRows[0];
      if (latest?.oracleMessageId) {
        await input.messageEditor.queueEdit({
          channelId: latest.oracleChannelId ?? channelId,
          messageId: latest.oracleMessageId,
          components: view.components,
          flags: COMPONENTS_V2_FLAGS,
        });
        updated += 1;
      } else {
        created += 1;
      }

      if (latest?.oracleMessageId !== createdMessage.id) {
        await deleteMessageBestEffort(input.client, channelId, createdMessage.id);
      }
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'oracle_weekly',
          guild_id: row.guildId,
          week_start_date: weekStartDate,
          error,
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
