import type { Client } from 'discord.js';
import { logger } from '../../lib/logger';
import {
  buildMonthlyHallSnapshot,
  clearMonthlyHallMessageId,
  ensureMonthlyHallCardRecord,
  getMonthlyHallCardByGuildMonth,
  listConfiguredMonthlyHallGuilds,
  resolveMonthlyHallPeriod,
  setMonthlyHallMessageIdIfUnset,
  touchMonthlyHallCard,
} from '../../app/services/monthlyHallService';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderMonthlyHallCard } from './monthlyHallRenderer';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import { withDiscordApiRetry, getDiscordErrorStatus } from './discordApiRetry';
import { Routes } from '../ui-v2/api';

type MonthlyHallRefreshKind = 'created' | 'updated' | 'skipped';

export type MonthlyHallRefreshStats = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

async function deleteMessageBestEffort(client: Client, channelId: string, messageId: string): Promise<void> {
  try {
    await withDiscordApiRetry({
      feature: 'monthly_hall',
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
        feature: 'monthly_hall',
        channel_id: channelId,
        message_id: messageId
      },
      'Failed to delete duplicate monthly hall message',
    );
  }
}

async function refreshOneGuild(input: {
  guildId: string;
  hallChannelId: string;
  monthKey?: string;
  now?: Date;
  client: Client;
  messageEditor: ThrottledMessageEditor;
}): Promise<MonthlyHallRefreshKind> {
  const period = resolveMonthlyHallPeriod(input.now ?? new Date(), input.monthKey);
  const snapshot = await buildMonthlyHallSnapshot({
    guildId: input.guildId,
    monthKey: period.monthKey,
    now: input.now
  });

  const card = await ensureMonthlyHallCardRecord({
    guildId: input.guildId,
    monthKey: period.monthKey,
    channelId: input.hallChannelId
  });

  const view = renderMonthlyHallCard(snapshot);
  const channelId = input.hallChannelId;

  if (card.messageId) {
    try {
      await input.messageEditor.queueEdit({
        channelId,
        messageId: card.messageId,
        content: view.content ?? null,
        components: view.components,
        flags: COMPONENTS_V2_FLAGS
      });
      await touchMonthlyHallCard(card.id);
      return 'updated';
    } catch (error) {
      if (getDiscordErrorStatus(error) !== 404) {
        throw error;
      }

      await clearMonthlyHallMessageId(card.id);
      logger.warn(
        {
          feature: 'monthly_hall',
          guild_id: input.guildId,
          month_key: period.monthKey,
          message_id: card.messageId
        },
        'Monthly hall message was missing, recreating',
      );
    }
  }

  const created = await withDiscordApiRetry({
    feature: 'monthly_hall',
    action: 'create',
    maxAttempts: 5,
    baseDelayMs: 400,
    context: {
      guild_id: input.guildId,
      channel_id: channelId,
      month_key: period.monthKey
    },
    execute: async () => sendComponentsV2Message(input.client, channelId, view)
  });

  const claimed = await setMonthlyHallMessageIdIfUnset({
    cardId: card.id,
    channelId,
    messageId: created.id
  });

  if (claimed) {
    return 'created';
  }

  const latest = await getMonthlyHallCardByGuildMonth(input.guildId, period.monthKey);
  if (!latest?.messageId) {
    return 'created';
  }

  if (latest.messageId !== created.id) {
    await input.messageEditor.queueEdit({
      channelId: latest.channelId,
      messageId: latest.messageId,
      content: view.content ?? null,
      components: view.components,
      flags: COMPONENTS_V2_FLAGS
    });

    await deleteMessageBestEffort(input.client, channelId, created.id);
    return 'updated';
  }

  return 'created';
}

export async function refreshMonthlyHallProjection(input: {
  client: Client;
  messageEditor: ThrottledMessageEditor;
  monthKey?: string;
  now?: Date;
}): Promise<MonthlyHallRefreshStats> {
  const configuredGuilds = await listConfiguredMonthlyHallGuilds();

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const guild of configuredGuilds) {
    try {
      if (guild.hallFeatureEnabled === false) {
        logger.info(
          {
            feature: 'monthly_hall',
            action: 'refresh_skipped',
            guild_id: guild.guildId,
            reason: 'hall feature disabled'
          },
          'skipped: missing channel config',
        );
        continue;
      }

      const result = await refreshOneGuild({
        guildId: guild.guildId,
        hallChannelId: guild.hallChannelId,
        monthKey: input.monthKey,
        now: input.now,
        client: input.client,
        messageEditor: input.messageEditor
      });

      processed += 1;
      if (result === 'created') {
        created += 1;
      } else if (result === 'updated') {
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'monthly_hall',
          guild_id: guild.guildId,
          month_key: input.monthKey ?? null,
          error
        },
        'Monthly hall refresh failed for guild',
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
