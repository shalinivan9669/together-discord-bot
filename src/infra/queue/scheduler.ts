import type PgBoss from 'pg-boss';
import type { FeatureFlagKey } from '../../config/featureFlags';
import { isFeatureEnabled } from '../../config/featureFlags';
import { logger } from '../../lib/logger';
import { type JobName, JobNames } from './jobs';

function schedulerPayload(feature: string, action: string) {
  return {
    correlationId: '00000000-0000-0000-0000-000000000000',
    guildId: 'scheduler',
    feature,
    action
  };
}

type RecurringScheduleDefinition = {
  name: JobName;
  cron: string;
  payloadFeature: string;
  payloadAction: string;
  featureFlag?: FeatureFlagKey;
};

export type RecurringScheduleStatus = {
  name: JobName;
  cron: string;
  enabled: boolean;
};

const recurringScheduleDefinitions: readonly RecurringScheduleDefinition[] = [
  {
    name: JobNames.WeeklyHoroscopePublish,
    cron: '0 10 * * 1',
    payloadFeature: 'horoscope',
    payloadAction: 'weekly_publish',
    featureFlag: 'horoscope'
  },
  {
    name: JobNames.WeeklyCheckinNudge,
    cron: '0 12 * * 3',
    payloadFeature: 'checkin',
    payloadAction: 'weekly_nudge',
    featureFlag: 'checkin'
  },
  {
    name: JobNames.WeeklyRaidStart,
    cron: '0 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_start',
    featureFlag: 'raid'
  },
  {
    name: JobNames.WeeklyRaidEnd,
    cron: '5 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_end',
    featureFlag: 'raid'
  },
  {
    name: JobNames.DailyRaidOffersGenerate,
    cron: '0 9 * * *',
    payloadFeature: 'raid',
    payloadAction: 'daily_offers_generate',
    featureFlag: 'raid'
  },
  {
    name: JobNames.RaidProgressRefresh,
    cron: '*/10 * * * *',
    payloadFeature: 'raid',
    payloadAction: 'progress_refresh',
    featureFlag: 'raid'
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

function isScheduleEnabled(definition: RecurringScheduleDefinition): boolean {
  return definition.featureFlag ? isFeatureEnabled(definition.featureFlag) : true;
}

export function listRecurringScheduleStatus(): RecurringScheduleStatus[] {
  return recurringScheduleDefinitions.map((definition) => ({
    name: definition.name,
    cron: definition.cron,
    enabled: isScheduleEnabled(definition)
  }));
}

export async function configureRecurringSchedules(boss: PgBoss): Promise<RecurringScheduleStatus[]> {
  const statuses = listRecurringScheduleStatus();
  const enabledNames: string[] = [];
  const disabledNames: string[] = [];

  for (const definition of recurringScheduleDefinitions) {
    if (isScheduleEnabled(definition)) {
      await boss.schedule(
        definition.name,
        definition.cron,
        schedulerPayload(definition.payloadFeature, definition.payloadAction),
      );
      enabledNames.push(definition.name);
      continue;
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
    disabledNames.push(definition.name);
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
