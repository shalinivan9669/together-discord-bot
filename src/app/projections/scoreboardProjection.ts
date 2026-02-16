import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { enqueueProjectionRefresh } from './refreshQueue';

export async function requestScoreboardRefresh(
  boss: PgBoss,
  params: {
    guildId: string;
    duelId: string;
    interactionId?: string;
    userId?: string;
    reason: string;
    correlationId?: string;
  },
): Promise<string | null> {
  const correlationId = params.correlationId ?? createCorrelationId();
  const jobId = await enqueueProjectionRefresh(
    boss,
    'duel_scoreboard',
    {
      correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'duel',
      action: 'scoreboard.refresh',
      duelId: params.duelId,
      reason: params.reason
    },
  );

  return jobId;
}
