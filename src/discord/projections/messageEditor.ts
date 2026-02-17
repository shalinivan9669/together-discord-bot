import { setTimeout as sleep } from 'node:timers/promises';
import type { Client } from 'discord.js';
import {
  Routes,
  type APIMessageTopLevelComponent,
} from '../ui-v2/api';
import { toComponentsV2EditBody } from '../ui-v2';
import { logger } from '../../lib/logger';
import { withDiscordApiRetry } from './discordApiRetry';

export type EditPayload = {
  channelId: string;
  messageId: string;
  components: APIMessageTopLevelComponent[];
  flags?: number | null;
};

type Slot = {
  lastEditedAt: number;
  inFlight: Promise<void> | null;
  pending: EditPayload | null;
};

export class ThrottledMessageEditor {
  private readonly slots = new Map<string, Slot>();

  constructor(
    private readonly client: Client,
    private readonly throttleSeconds: number,
  ) {}

  async queueEdit(payload: EditPayload): Promise<void> {
    const key = `${payload.channelId}:${payload.messageId}`;
    const slot = this.slots.get(key) ?? {
      lastEditedAt: 0,
      inFlight: null,
      pending: null
    };

    slot.pending = payload;

    if (!slot.inFlight) {
      slot.inFlight = this.processKey(key, slot).finally(() => {
        slot.inFlight = null;
        if (!slot.pending) {
          this.slots.delete(key);
        }
      });
    }

    this.slots.set(key, slot);
    await slot.inFlight;
  }

  private async processKey(key: string, slot: Slot): Promise<void> {
    while (slot.pending) {
      const next = slot.pending;
      slot.pending = null;

      const waitMs = Math.max(0, slot.lastEditedAt + this.throttleSeconds * 1000 - Date.now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      await this.editWithRetry(next);
      slot.lastEditedAt = Date.now();
    }

    logger.debug({ feature: 'projection.message_editor', key }, 'Edit queue drained');
  }

  private async editWithRetry(payload: EditPayload): Promise<void> {
    const body = toComponentsV2EditBody({
      components: payload.components,
      flags: payload.flags
    });

    await withDiscordApiRetry({
      feature: 'projection.message_editor',
      action: 'edit',
      maxAttempts: 5,
      baseDelayMs: 400,
      context: {
        channel_id: payload.channelId,
        message_id: payload.messageId
      },
      execute: async () => {
        await this.client.rest.patch(Routes.channelMessage(payload.channelId, payload.messageId), {
          body
        });
      }
    });
  }
}
