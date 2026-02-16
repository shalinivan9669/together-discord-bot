import { duelScoreboardSnapshotUsecase } from '../../app/usecases/duelUsecases';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderDuelScoreboard } from './scoreboardRenderer';

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

  const content = renderDuelScoreboard(snapshot);

  await messageEditor.queueEdit({
    channelId: snapshot.publicChannelId,
    messageId: snapshot.scoreboardMessageId,
    content
  });
}