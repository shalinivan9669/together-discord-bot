import PgBoss from 'pg-boss';
import { env } from '../src/config/env';
import { checkDbHealth, pgPool } from '../src/infra/db/client';
import { listRecurringScheduleStatus } from '../src/infra/queue/scheduler';

type ScheduleRow = {
  name: string;
  cron: string;
};

async function loadPersistedSchedules(): Promise<{ table: string; rows: ScheduleRow[] }> {
  const candidates = ['public.schedule', 'pgboss.schedule'];

  for (const table of candidates) {
    try {
      const result = await pgPool.query<ScheduleRow>(`select name, cron from ${table} order by name`);
      return {
        table,
        rows: result.rows
      };
    } catch {
      // Try the next candidate schema.
    }
  }

  return {
    table: 'not_found',
    rows: []
  };
}

async function main(): Promise<void> {
  console.log('1) Environment schema: OK');
  console.log(`   NODE_ENV=${env.NODE_ENV}`);

  const dbOk = await checkDbHealth();
  if (!dbOk) {
    throw new Error('Database health check failed');
  }
  console.log('2) Database connection: OK');

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'public',
    migrate: false
  });

  await boss.start();
  console.log('3) pg-boss ping: OK (start/stop successful)');
  await boss.stop();

  const configured = listRecurringScheduleStatus();
  const persisted = await loadPersistedSchedules();
  const persistedByName = new Map(persisted.rows.map((row) => [row.name, row]));

  console.log('4) Recurring schedule status:');
  console.log(`   persisted_table=${persisted.table}`);

  for (const schedule of configured) {
    const persistedRow = persistedByName.get(schedule.name);
    const runtime = schedule.enabled ? 'enabled' : 'disabled';
    const dbState = persistedRow ? 'present' : 'missing';
    const cron = persistedRow?.cron ?? schedule.cron;
    console.log(`   - ${schedule.name} | runtime=${runtime} | db=${dbState} | cron=${cron}`);
  }

  await pgPool.end();
}

main().catch(async (error) => {
  console.error('Smoke script failed:', error);
  try {
    await pgPool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
