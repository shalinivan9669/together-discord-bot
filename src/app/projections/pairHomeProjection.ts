import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { JobNames } from '../../infra/queue/jobs';

export async function requestPairHomeRefresh(
  boss: PgBoss,
  params: {
    guildId: string;
    pairId: string;
    reason: string;
    interactionId?: string;
    userId?: string;
    correlationId?: string;
  },
): Promise<string | null> {
  const correlationId = params.correlationId ?? createCorrelationId();

  return boss.send(
    JobNames.PairHomeRefresh,
    {
      correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'pair_home',
      action: 'refresh',
      pairId: params.pairId,
      reason: params.reason
    },
    {
      singletonKey: `pair-home:${params.guildId}:${params.pairId}`,
      singletonSeconds: 6,
      retryLimit: 2
    },
  );
}
