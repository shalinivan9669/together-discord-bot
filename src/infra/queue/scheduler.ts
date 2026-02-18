import type PgBoss from 'pg-boss';
import { logger } from '../../lib/logger';
import { listSchedulerSettings, upsertSchedulerSetting } from '../db/queries/schedulerSettings';
import { type JobName, JobNames } from './jobs';

function schedulerPayload(feature: string, action: string) {
  return {
    correlationId: '00000000-0000-0000-0000-000000000000',
    guildId: 'scheduler',
    feature,
    action
  };
}

export type RecurringScheduleDefinition = {
  name: JobName;
  cron: string;
  payloadFeature: string;
  payloadAction: string;
};

export type RecurringScheduleStatus = {
  name: JobName;
  cron: string;
  enabled: boolean;
};

const recurringScheduleDefinitions: readonly RecurringScheduleDefinition[] = [
  {
    name: JobNames.OracleWeeklyPublish,
    cron: '0 10 * * 1',
    payloadFeature: 'oracle',
    payloadAction: 'weekly_publish'
  },
  {
    name: JobNames.AstroTickDaily,
    cron: '0 9 * * *',
    payloadFeature: 'astro',
    payloadAction: 'tick_daily'
  },
  {
    name: JobNames.WeeklyCheckinNudge,
    cron: '0 12 * * 3',
    payloadFeature: 'checkin',
    payloadAction: 'weekly_nudge'
  },
  {
    name: JobNames.WeeklyRaidStart,
    cron: '0 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_start'
  },
  {
    name: JobNames.WeeklyRaidEnd,
    cron: '5 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_end'
  },
  {
    name: JobNames.DailyRaidOffersGenerate,
    cron: '0 9 * * *',
    payloadFeature: 'raid',
    payloadAction: 'daily_offers_generate'
  },
  {
    name: JobNames.RaidProgressRefresh,
    cron: '*/10 * * * *',
    payloadFeature: 'raid',
    payloadAction: 'progress_refresh'
  },
  {
    name: JobNames.MonthlyHallRefresh,
    cron: '0 10 1 * *',
    payloadFeature: 'monthly_hall',
    payloadAction: 'refresh'
  },
  {
    name: JobNames.PublicPostPublish,
    cron: '*/2 * * * *',
    payloadFeature: 'public_post',
    payloadAction: 'publish_pending'
  }
] as const;

function definitionByName(name: JobName): RecurringScheduleDefinition {
  const definition = recurringScheduleDefinitions.find((item) => item.name === name);
  if (!definition) {
    throw new Error(`Unknown schedule: ${name}`);
  }

  return definition;
}

export function listRecurringScheduleDefinitions(): readonly RecurringScheduleDefinition[] {
  return recurringScheduleDefinitions;
}

export async function listRecurringScheduleStatus(): Promise<RecurringScheduleStatus[]> {
  const rows = await listSchedulerSettings();
  const rowMap = new Map(rows.map((row) => [row.scheduleName, row.enabled]));

  return recurringScheduleDefinitions.map((definition) => ({
    name: definition.name,
    cron: definition.cron,
    enabled: rowMap.get(definition.name) ?? true
  }));
}

async function applyScheduleState(
  boss: PgBoss,
  definition: RecurringScheduleDefinition,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await boss.schedule(
      definition.name,
      definition.cron,
      schedulerPayload(definition.payloadFeature, definition.payloadAction),
    );
    return;
  }

  try {
    await boss.unschedule(definition.name);
  } catch (error) {
    logger.debug(
      {
        feature: 'queue.scheduler',
        schedule: definition.name,
        error
      },
      'Unable to unschedule disabled recurring job',
    );
  }
}

export async function configureRecurringSchedules(boss: PgBoss): Promise<RecurringScheduleStatus[]> {
  const statuses = await listRecurringScheduleStatus();
  const enabledNames: string[] = [];
  const disabledNames: string[] = [];

  for (const status of statuses) {
    const definition = definitionByName(status.name);
    await applyScheduleState(boss, definition, status.enabled);

    if (status.enabled) {
      enabledNames.push(status.name);
    } else {
      disabledNames.push(status.name);
    }
  }

  logger.info(
    {
      feature: 'queue.scheduler',
      enabled_schedules: enabledNames,
      disabled_schedules: disabledNames
    },
    'Recurring schedules configured',
  );

  return statuses;
}

export async function setRecurringScheduleEnabled(
  boss: PgBoss,
  scheduleName: JobName,
  enabled: boolean,
): Promise<RecurringScheduleStatus> {
  const definition = definitionByName(scheduleName);
  await upsertSchedulerSetting(scheduleName, enabled);
  await applyScheduleState(boss, definition, enabled);

  logger.info(
    {
      feature: 'queue.scheduler',
      action: 'schedule.toggled',
      schedule_name: scheduleName,
      enabled
    },
    'Recurring schedule toggled',
  );

  return {
    name: scheduleName,
    cron: definition.cron,
    enabled
  };
}

