import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { enqueueProjectionRefresh } from './refreshQueue';

export async function requestRaidProgressRefresh(
  boss: PgBoss,
  params: { guildId: string; raidId?: string; reason: string; correlationId?: string },
): Promise<string | null> {
  const correlationId = params.correlationId ?? createCorrelationId();

  return enqueueProjectionRefresh(
    boss,
    'raid_progress',
    {
      correlationId,
      guildId: params.guildId,
      feature: 'raid',
      action: 'progress.refresh',
      raidId: params.raidId
    },
  );
}
