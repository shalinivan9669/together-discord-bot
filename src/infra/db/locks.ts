import type { PoolClient } from 'pg';

export async function withAdvisoryXactLock(
  client: PoolClient,
  guildId: string,
  feature: string,
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) as locked',
    [guildId, feature],
  );
  return result.rows[0]?.locked ?? false;
}

export function featureLockKey(guildId: string, feature: string): string {
  return `lock:${guildId}:${feature}`;
}