import { pgPool } from '../src/infra/db/client';

const LEGACY_SCHEDULE_NAME = 'weekly.horoscope.publish';
const TARGET_SCHEDULE_NAME = 'weekly.oracle.publish';

type ConsistencyState = {
  queueTableExists: boolean;
  queueHasNameColumn: boolean;
  queueHasTarget: boolean;
  scheduleTableExists: boolean;
  scheduleHasNameColumn: boolean;
  scheduleHasLegacy: boolean;
  scheduleHasTarget: boolean;
};

const REPAIR_SQL = `
DO $$
DECLARE
  queue_has_name boolean := false;
  queue_has_options boolean := false;
BEGIN
  IF to_regclass('public.queue') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'queue'
        AND column_name = 'name'
    ) INTO queue_has_name;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'queue'
        AND column_name = 'options'
    ) INTO queue_has_options;

    IF queue_has_name THEN
      IF queue_has_options THEN
        INSERT INTO public.queue (name, options)
        VALUES ('weekly.oracle.publish', '{}'::jsonb)
        ON CONFLICT (name) DO NOTHING;
      ELSE
        INSERT INTO public.queue (name)
        VALUES ('weekly.oracle.publish')
        ON CONFLICT (name) DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.schedule') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.horoscope.publish'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.oracle.publish'
    ) THEN
      UPDATE public.schedule
      SET name = 'weekly.oracle.publish'
      WHERE name = 'weekly.horoscope.publish';
    ELSIF EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.horoscope.publish'
    ) AND EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.oracle.publish'
    ) THEN
      DELETE FROM public.schedule WHERE name = 'weekly.horoscope.publish';
    END IF;
  END IF;
END
$$;
`;

async function relationExists(relation: string): Promise<boolean> {
  const result = await pgPool.query<{ exists: boolean }>('select to_regclass($1) is not null as exists', [relation]);
  return result.rows[0]?.exists ?? false;
}

async function columnExists(schema: string, table: string, column: string): Promise<boolean> {
  const result = await pgPool.query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and column_name = $3
    ) as exists
    `,
    [schema, table, column],
  );

  return result.rows[0]?.exists ?? false;
}

async function queueHasName(name: string): Promise<boolean> {
  const result = await pgPool.query<{ exists: boolean }>(
    'select exists (select 1 from public.queue where name = $1) as exists',
    [name],
  );
  return result.rows[0]?.exists ?? false;
}

async function scheduleHasName(name: string): Promise<boolean> {
  const result = await pgPool.query<{ exists: boolean }>(
    'select exists (select 1 from public.schedule where name = $1) as exists',
    [name],
  );
  return result.rows[0]?.exists ?? false;
}

async function loadConsistencyState(): Promise<ConsistencyState> {
  const queueTableExists = await relationExists('public.queue');
  const scheduleTableExists = await relationExists('public.schedule');

  const queueHasNameColumn = queueTableExists ? await columnExists('public', 'queue', 'name') : false;
  const scheduleHasNameColumn = scheduleTableExists ? await columnExists('public', 'schedule', 'name') : false;

  const queueHasTarget = queueTableExists && queueHasNameColumn ? await queueHasName(TARGET_SCHEDULE_NAME) : false;
  const scheduleHasLegacy =
    scheduleTableExists && scheduleHasNameColumn ? await scheduleHasName(LEGACY_SCHEDULE_NAME) : false;
  const scheduleHasTarget =
    scheduleTableExists && scheduleHasNameColumn ? await scheduleHasName(TARGET_SCHEDULE_NAME) : false;

  return {
    queueTableExists,
    queueHasNameColumn,
    queueHasTarget,
    scheduleTableExists,
    scheduleHasNameColumn,
    scheduleHasLegacy,
    scheduleHasTarget
  };
}

function printState(label: string, state: ConsistencyState): void {
  console.log(
    `${label}: queue_table=${state.queueTableExists ? 'yes' : 'no'}, queue_target=${state.queueHasTarget ? 'yes' : 'no'}, schedule_table=${state.scheduleTableExists ? 'yes' : 'no'}, schedule_legacy=${state.scheduleHasLegacy ? 'yes' : 'no'}, schedule_target=${state.scheduleHasTarget ? 'yes' : 'no'}`,
  );
}

async function main(): Promise<void> {
  const before = await loadConsistencyState();
  printState('db-preflight before', before);

  await pgPool.query(REPAIR_SQL);

  const after = await loadConsistencyState();
  printState('db-preflight after ', after);

  if (after.scheduleTableExists && !after.scheduleHasNameColumn) {
    throw new Error('public.schedule exists without a name column; cannot verify schedule rename consistency');
  }

  if (after.queueTableExists && !after.queueHasNameColumn) {
    throw new Error('public.queue exists without a name column; cannot verify queue consistency');
  }

  if (after.scheduleHasLegacy) {
    throw new Error('Legacy schedule name still exists after preflight repair');
  }

  if (after.scheduleHasTarget && !after.queueHasTarget) {
    throw new Error('Target schedule exists without target queue row after preflight repair');
  }

  console.log('db-preflight: schedule/queue consistency OK');
}

main()
  .catch((error) => {
    console.error('db-preflight failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
