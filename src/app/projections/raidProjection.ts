import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { JobNames } from '../../infra/queue/jobs';

export async function requestRaidProgressRefresh(
  boss: PgBoss,
  params: { guildId: string; raidId?: string; reason: string; correlationId?: string },
): Promise<string | null> {
  const correlationId = params.correlationId ?? createCorrelationId();

  return boss.send(
    JobNames.RaidProgressRefresh,
    {
      correlationId,
      guildId: params.guildId,
      feature: 'raid',
      action: 'progress.refresh',
      raidId: params.raidId
    },
    {
      singletonKey: `raid-progress:${params.guildId}:${params.raidId ?? 'active'}`,
      singletonSeconds: 12,
      retryLimit: 2
    },
  );
}