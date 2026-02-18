import { and, eq, isNull } from 'drizzle-orm';
import type { Client } from 'discord.js';
import { db } from '../../infra/db/drizzle';
import { guildSettings } from '../../infra/db/schema';
import {
  getAstroFeatureState,
  getAstroPublicSnapshot,
  listAstroTickGuilds
} from '../../app/services/astroHoroscopeService';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderAstroHoroscopeCard } from './astroHoroscopeRenderer';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import { getDiscordErrorStatus, withDiscordApiRetry } from './discordApiRetry';
import { Routes } from '../ui-v2/api';

export type AstroProjectionRefreshStats = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

async function clearAstroMessageId(guildId: string): Promise<void> {
  await db
    .update(guildSettings)
    .set({
      astroHoroscopeMessageId: null,
      updatedAt: new Date()
    })
    .where(eq(guildSettings.guildId, guildId));
}

async function setAstroMessageIdIfUnset(input: {
  guildId: string;
  messageId: string;
}): Promise<boolean> {
  const updated = await db
    .update(guildSettings)
    .set({
      astroHoroscopeMessageId: input.messageId,
      updatedAt: new Date()
    })
    .where(and(eq(guildSettings.guildId, input.guildId), isNull(guildSettings.astroHoroscopeMessageId)))
    .returning({
      messageId: guildSettings.astroHoroscopeMessageId
    });

  return Boolean(updated[0]);
}

async function deleteMessageBestEffort(client: Client, channelId: string, messageId: string): Promise<void> {
  try {
    await withDiscordApiRetry({
      feature: 'astro',
      action: 'delete_duplicate_message',
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
        feature: 'astro',
        channel_id: channelId,
        message_id: messageId
      },
      'Failed to delete duplicate astro message',
    );
  }
}

async function loadTargetGuilds(guildId?: string): Promise<Array<{
  guildId: string;
  channelId: string;
  messageId: string | null;
}>> {
  if (guildId) {
    const state = await getAstroFeatureState(guildId);
    if (!state.enabled || !state.configured || !state.channelId) {
      return [];
    }

    return [
      {
        guildId,
        channelId: state.channelId,
        messageId: state.messageId
      }
    ];
  }

  const rows = await listAstroTickGuilds();
  return rows.map((row) => ({
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId
  }));
}

export async function refreshAstroHoroscopeProjection(input: {
  client: Client;
  messageEditor: ThrottledMessageEditor;
  guildId?: string;
  now?: Date;
}, deps?: {
  loadTargetGuilds?: typeof loadTargetGuilds;
  getPublicSnapshot?: typeof getAstroPublicSnapshot;
  renderCard?: typeof renderAstroHoroscopeCard;
  sendMessage?: typeof sendComponentsV2Message;
  clearMessageId?: typeof clearAstroMessageId;
  setMessageIdIfUnset?: typeof setAstroMessageIdIfUnset;
  getFeatureState?: typeof getAstroFeatureState;
  deleteDuplicate?: typeof deleteMessageBestEffort;
}): Promise<AstroProjectionRefreshStats> {
  const loadTargets = deps?.loadTargetGuilds ?? loadTargetGuilds;
  const getPublicSnapshot = deps?.getPublicSnapshot ?? getAstroPublicSnapshot;
  const renderCard = deps?.renderCard ?? renderAstroHoroscopeCard;
  const sendMessage = deps?.sendMessage ?? sendComponentsV2Message;
  const clearMessageId = deps?.clearMessageId ?? clearAstroMessageId;
  const setMessageIdIfUnset = deps?.setMessageIdIfUnset ?? setAstroMessageIdIfUnset;
  const getFeatureState = deps?.getFeatureState ?? getAstroFeatureState;
  const deleteDuplicate = deps?.deleteDuplicate ?? deleteMessageBestEffort;

  const targets = await loadTargets(input.guildId);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const guild of targets) {
    processed += 1;

    try {
      const snapshot = await getPublicSnapshot(guild.guildId, input.now);
      const view = renderCard({
        cycleStartDate: snapshot.cycleStartDate,
        cycleEndDate: snapshot.cycleEndDate,
        skyTheme: snapshot.skyTheme,
        aboutLine: snapshot.aboutLine
      });

      if (guild.messageId) {
        try {
          await input.messageEditor.queueEdit({
            channelId: guild.channelId,
            messageId: guild.messageId,
            components: view.components,
            flags: COMPONENTS_V2_FLAGS
          });
          updated += 1;
          continue;
        } catch (error) {
          if (getDiscordErrorStatus(error) !== 404) {
            throw error;
          }

          await clearMessageId(guild.guildId);
        }
      }

      const createdMessage = await sendMessage(input.client, guild.channelId, view);
      const claimed = await setMessageIdIfUnset({
        guildId: guild.guildId,
        messageId: createdMessage.id
      });

      if (claimed) {
        created += 1;
        continue;
      }

      const latest = await getFeatureState(guild.guildId);
      if (latest.messageId && latest.channelId) {
        await input.messageEditor.queueEdit({
          channelId: latest.channelId,
          messageId: latest.messageId,
          components: view.components,
          flags: COMPONENTS_V2_FLAGS
        });
        updated += 1;
      } else {
        created += 1;
      }

      if (latest.messageId !== createdMessage.id) {
        await deleteDuplicate(input.client, guild.channelId, createdMessage.id);
      }
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'astro',
          action: 'projection_refresh_failed',
          guild_id: guild.guildId,
          error
        },
        'Astro projection refresh failed',
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
