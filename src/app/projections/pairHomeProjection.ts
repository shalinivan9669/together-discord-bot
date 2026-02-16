import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { enqueueProjectionRefresh } from './refreshQueue';

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

  return enqueueProjectionRefresh(
    boss,
    'pair_home',
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
  );
}
