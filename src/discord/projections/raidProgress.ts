import { and, eq } from 'drizzle-orm';
import { isFeatureEnabled } from '../../config/featureFlags';
import { getRaidProgressSnapshot } from '../../app/services/raidService';
import { db } from '../../infra/db/drizzle';
import { raids } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderRaidProgress } from './raidProgressRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';

async function refreshOneRaid(raidId: string, messageEditor: ThrottledMessageEditor): Promise<void> {
  const snapshot = await getRaidProgressSnapshot({ raidId });
  if (!snapshot || !snapshot.progressMessageId) {
    return;
  }

  const view = renderRaidProgress(snapshot);
  await messageEditor.queueEdit({
    channelId: snapshot.publicChannelId,
    messageId: snapshot.progressMessageId,
    content: view.content ?? null,
    components: view.components,
    flags: COMPONENTS_V2_FLAGS
  });
}

export async function refreshRaidProgressProjection(
  messageEditor: ThrottledMessageEditor,
  raidId?: string,
): Promise<void> {
  if (!isFeatureEnabled('raid')) {
    logger.debug({ feature: 'raid' }, 'Raid projection skipped because feature is disabled');
    return;
  }

  if (raidId) {
    await refreshOneRaid(raidId, messageEditor);
    return;
  }

  const activeRaids = await db
    .select({ id: raids.id })
    .from(raids)
    .where(and(eq(raids.status, 'active')));

  for (const row of activeRaids) {
    await refreshOneRaid(row.id, messageEditor);
  }
}
