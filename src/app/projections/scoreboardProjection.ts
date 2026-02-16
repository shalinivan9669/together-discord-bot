import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { JobNames } from '../../infra/queue/jobs';

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
  const jobId = await boss.send(
    JobNames.DuelScoreboardRefresh,
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
    {
      singletonKey: `duel-scoreboard:${params.guildId}:${params.duelId}`,
      singletonSeconds: 8,
      retryLimit: 3
    },
  );

  return jobId;
}