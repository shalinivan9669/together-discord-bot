import type PgBoss from 'pg-boss';
import type { JobName } from '../../infra/queue/jobs';
import { JobNames } from '../../infra/queue/jobs';

type ProjectionRefreshKind = 'duel_scoreboard' | 'raid_progress' | 'pair_home';

type ProjectionPayloadByKind = {
  duel_scoreboard: { guildId: string; duelId: string };
  raid_progress: { guildId: string; raidId?: string };
  pair_home: { guildId: string; pairId: string };
};

type ProjectionRefreshConfig<TPayload> = {
  jobName: JobName;
  singletonSeconds: number;
  retryLimit: number;
  singletonKey: (payload: TPayload) => string;
};

const projectionRefreshConfig: {
  [K in ProjectionRefreshKind]: ProjectionRefreshConfig<ProjectionPayloadByKind[K]>;
} = {
  duel_scoreboard: {
    jobName: JobNames.DuelScoreboardRefresh,
    singletonSeconds: 8,
    retryLimit: 3,
    singletonKey: (payload) => `projection:duel_scoreboard:${payload.guildId}:${payload.duelId}`
  },
  raid_progress: {
    jobName: JobNames.RaidProgressRefresh,
    singletonSeconds: 12,
    retryLimit: 3,
    singletonKey: (payload) => `projection:raid_progress:${payload.guildId}:${payload.raidId ?? 'active'}`
  },
  pair_home: {
    jobName: JobNames.PairHomeRefresh,
    singletonSeconds: 8,
    retryLimit: 3,
    singletonKey: (payload) => `projection:pair_home:${payload.guildId}:${payload.pairId}`
  }
};

export function getProjectionRefreshConfig(kind: ProjectionRefreshKind) {
  return projectionRefreshConfig[kind];
}

export async function enqueueProjectionRefresh<K extends ProjectionRefreshKind>(
  boss: PgBoss,
  kind: K,
  payload: ProjectionPayloadByKind[K] & Record<string, unknown>,
): Promise<string | null> {
  const config = projectionRefreshConfig[kind];
  return boss.send(
    config.jobName,
    payload,
    {
      singletonKey: config.singletonKey(payload),
      singletonSeconds: config.singletonSeconds,
      retryLimit: config.retryLimit
    },
  );
}
