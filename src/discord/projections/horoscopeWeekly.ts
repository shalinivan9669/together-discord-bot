import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Client } from 'discord.js';
import { ensureHoroscopeWeek } from '../../app/services/horoscopeService';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { guildSettings } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { renderWeeklyHoroscopePost } from './horoscopeWeeklyRenderer';
import type { ThrottledMessageEditor } from './messageEditor';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import { getDiscordErrorStatus, withDiscordApiRetry } from './discordApiRetry';
import { Routes } from '../ui-v2/api';

export type WeeklyHoroscopeRefreshStats = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

async function clearHoroscopeMessageId(guildId: string): Promise<void> {
  await db.execute(sql`
    update guild_settings
    set horoscope_message_id = null, updated_at = now()
    where guild_id = ${guildId}
  `);
}

async function setHoroscopeMessageIdIfUnset(input: {
  guildId: string;
  messageId: string;
}): Promise<boolean> {
  const updated = await db.execute<{ guild_id: string }>(sql`
    update guild_settings
    set horoscope_message_id = ${input.messageId}, updated_at = now()
    where guild_id = ${input.guildId}
      and horoscope_message_id is null
    returning guild_id
  `);

  return updated.rows.length > 0;
}

async function deleteMessageBestEffort(client: Client, channelId: string, messageId: string): Promise<void> {
  try {
    await withDiscordApiRetry({
      feature: 'horoscope_weekly',
      action: 'delete_duplicate',
      maxAttempts: 3,
      baseDelayMs: 300,
      context: {
        channel_id: channelId,
        message_id: messageId
      },
      execute: async () => {
        await client.rest.delete(Routes.channelMessage(channelId, messageId));
      }
    });
  } catch {
    logger.warn(
      {
        feature: 'horoscope_weekly',
        channel_id: channelId,
        message_id: messageId
      },
      'Failed to delete duplicate weekly horoscope message',
    );
  }
}

export async function refreshWeeklyHoroscopeProjection(input: {
  client: Client;
  messageEditor: ThrottledMessageEditor;
  weekStartDate?: string;
  guildId?: string;
  now?: Date;
}): Promise<WeeklyHoroscopeRefreshStats> {
  const weekStartDate = input.weekStartDate ?? startOfWeekIso(input.now ?? new Date());

  const rows = input.guildId
    ? await db
        .select({
          guildId: guildSettings.guildId,
          horoscopeChannelId: guildSettings.horoscopeChannelId,
          horoscopeMessageId: sql<string | null>`horoscope_message_id`
        })
        .from(guildSettings)
        .where(and(eq(guildSettings.guildId, input.guildId), isNotNull(guildSettings.horoscopeChannelId)))
    : await db
        .select({
          guildId: guildSettings.guildId,
          horoscopeChannelId: guildSettings.horoscopeChannelId,
          horoscopeMessageId: sql<string | null>`horoscope_message_id`
        })
        .from(guildSettings)
        .where(isNotNull(guildSettings.horoscopeChannelId));

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const channelId = row.horoscopeChannelId;
    if (!channelId) {
      continue;
    }

    processed += 1;

    try {
      await ensureHoroscopeWeek(row.guildId, weekStartDate);
      const view = renderWeeklyHoroscopePost({
        guildId: row.guildId,
        weekStartDate
      });

      if (row.horoscopeMessageId) {
        try {
          await input.messageEditor.queueEdit({
            channelId,
            messageId: row.horoscopeMessageId,
            content: view.content ?? null,
            components: view.components,
            flags: COMPONENTS_V2_FLAGS
          });
          updated += 1;
          continue;
        } catch (error) {
          if (getDiscordErrorStatus(error) !== 404) {
            throw error;
          }

          await clearHoroscopeMessageId(row.guildId);
        }
      }

      const createdMessage = await sendComponentsV2Message(input.client, channelId, view);
      const claimed = await setHoroscopeMessageIdIfUnset({
        guildId: row.guildId,
        messageId: createdMessage.id
      });

      if (claimed) {
        created += 1;
        continue;
      }

      const latestRows = await db
        .select({
          horoscopeMessageId: sql<string | null>`horoscope_message_id`,
          horoscopeChannelId: guildSettings.horoscopeChannelId
        })
        .from(guildSettings)
        .where(eq(guildSettings.guildId, row.guildId))
        .limit(1);

      const latest = latestRows[0];
      if (latest?.horoscopeMessageId) {
        await input.messageEditor.queueEdit({
          channelId: latest.horoscopeChannelId ?? channelId,
          messageId: latest.horoscopeMessageId,
          content: view.content ?? null,
          components: view.components,
          flags: COMPONENTS_V2_FLAGS
        });
        updated += 1;
      } else {
        created += 1;
      }

      if (latest?.horoscopeMessageId !== createdMessage.id) {
        await deleteMessageBestEffort(input.client, channelId, createdMessage.id);
      }
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'horoscope_weekly',
          guild_id: row.guildId,
          week_start_date: weekStartDate,
          error
        },
        'Weekly horoscope projection refresh failed',
      );
    }
  }

  return {
    processed,
    created,
    updated,
    failed
  };
}
