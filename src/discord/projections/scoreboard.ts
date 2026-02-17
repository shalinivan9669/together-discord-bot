import { duelScoreboardSnapshotUsecase } from '../../app/usecases/duelUsecases';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderDuelScoreboard } from './scoreboardRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';

export { renderDuelScoreboard } from './scoreboardRenderer';

export async function refreshDuelScoreboardProjection(
  duelId: string,
  messageEditor: ThrottledMessageEditor,
): Promise<void> {
  const snapshot = await duelScoreboardSnapshotUsecase(duelId);
  if (!snapshot.scoreboardMessageId) {
    logger.warn({ feature: 'duel', duel_id: duelId }, 'Missing scoreboard message id');
    return;
  }

  const view = renderDuelScoreboard(snapshot);

  await messageEditor.queueEdit({
    channelId: snapshot.publicChannelId,
    messageId: snapshot.scoreboardMessageId,
    components: view.components,
    flags: COMPONENTS_V2_FLAGS
  });
}
