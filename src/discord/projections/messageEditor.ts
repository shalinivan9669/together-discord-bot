import { setTimeout as sleep } from 'node:timers/promises';
import type { Client } from 'discord.js';
import {
  Routes,
  type APIMessageTopLevelComponent,
  type RESTPatchAPIChannelMessageJSONBody,
} from '../ui-v2/api';
import { logger } from '../../lib/logger';

export type EditPayload = {
  channelId: string;
  messageId: string;
  content?: string | null;
  components?: APIMessageTopLevelComponent[];
  flags?: number;
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
    const maxAttempts = 4;

    const body: RESTPatchAPIChannelMessageJSONBody = {};
    if (payload.content !== undefined) {
      body.content = payload.content;
    }
    if (payload.components !== undefined) {
      body.components = payload.components;
    }
    if (payload.flags !== undefined) {
      body.flags = payload.flags;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.client.rest.patch(Routes.channelMessage(payload.channelId, payload.messageId), {
          body
        });
        return;
      } catch (error) {
        const anyError = error as { status?: number; data?: { retry_after?: number } };
        const retryAfterSeconds = anyError.data?.retry_after;

        if ((anyError.status === 429 || retryAfterSeconds) && attempt < maxAttempts) {
          const backoff = retryAfterSeconds ? retryAfterSeconds * 1000 : 500 * 2 ** attempt;
          logger.warn(
            {
              feature: 'projection.message_editor',
              channel_id: payload.channelId,
              message_id: payload.messageId,
              attempt,
              backoff_ms: backoff
            },
            'Rate limited while editing message, retrying',
          );
          await sleep(backoff);
          continue;
        }

        logger.error(
          {
            feature: 'projection.message_editor',
            channel_id: payload.channelId,
            message_id: payload.messageId,
            attempt,
            error
          },
          'Failed to edit message',
        );
        throw error;
      }
    }
  }
}
