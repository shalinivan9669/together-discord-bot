import { and, eq, isNull } from 'drizzle-orm';
import { Routes } from '../ui-v2/api';
import type { Client } from 'discord.js';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { db } from '../../infra/db/drizzle';
import { pairs } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderPairHomePanel } from './pairHomeRenderer';

async function attemptSinglePin(params: {
  client: Client;
  pairId: string;
  channelId: string;
  messageId: string;
  pinAttemptedAt: Date | null;
}): Promise<void> {
  if (params.pinAttemptedAt) {
    return;
  }

  let pinnedAt: Date | null = null;
  try {
    const channel = await params.client.channels.fetch(params.channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(params.messageId);
      await message.pin();
      pinnedAt = new Date();
    }
  } catch {
    // Optional pinning is best-effort and should fail silently.
  }

  await db
    .update(pairs)
    .set({
      pairHomePinAttemptedAt: new Date(),
      pairHomePinnedAt: pinnedAt
    })
    .where(eq(pairs.id, params.pairId));
}

export async function refreshPairHomeProjection(input: {
  pairId: string;
  client: Client;
  messageEditor: ThrottledMessageEditor;
}): Promise<void> {
  const snapshot = await getPairHomeSnapshot(input.pairId);
  if (!snapshot) {
    return;
  }

  const view = renderPairHomePanel(snapshot);

  if (snapshot.pairHomeMessageId) {
    await input.messageEditor.queueEdit({
      channelId: snapshot.privateChannelId,
      messageId: snapshot.pairHomeMessageId,
      content: view.content ?? null,
      components: view.components,
      flags: COMPONENTS_V2_FLAGS
    });
    return;
  }

  const created = await sendComponentsV2Message(input.client, snapshot.privateChannelId, view);

  const updated = await db
    .update(pairs)
    .set({
      pairHomeMessageId: created.id
    })
    .where(and(eq(pairs.id, snapshot.pairId), isNull(pairs.pairHomeMessageId), eq(pairs.status, 'active')))
    .returning({ id: pairs.id });

  if (!updated[0]) {
    const latestRows = await db
      .select({ pairHomeMessageId: pairs.pairHomeMessageId })
      .from(pairs)
      .where(eq(pairs.id, snapshot.pairId))
      .limit(1);
    const latestMessageId = latestRows[0]?.pairHomeMessageId ?? null;

    if (latestMessageId && latestMessageId !== created.id) {
      await input.messageEditor.queueEdit({
        channelId: snapshot.privateChannelId,
        messageId: latestMessageId,
        content: view.content ?? null,
        components: view.components,
        flags: COMPONENTS_V2_FLAGS
      });

      try {
        await input.client.rest.delete(Routes.channelMessage(snapshot.privateChannelId, created.id));
      } catch {
        logger.warn(
          {
            feature: 'pair_home',
            pair_id: snapshot.pairId,
            message_id: created.id
          },
          'Failed to delete duplicate pair home message',
        );
      }
    }

    return;
  }

  await attemptSinglePin({
    client: input.client,
    pairId: snapshot.pairId,
    channelId: snapshot.privateChannelId,
    messageId: created.id,
    pinAttemptedAt: snapshot.pairHomePinAttemptedAt
  });
}
