import type PgBoss from 'pg-boss';
import { featureFlags } from '../../config/featureFlags';
import { logger } from '../../lib/logger';
import { JobNames } from './jobs';

function schedulerPayload(feature: string, action: string) {
  return {
    correlationId: '00000000-0000-0000-0000-000000000000',
    guildId: 'scheduler',
    feature,
    action
  };
}

export async function configureRecurringSchedules(boss: PgBoss): Promise<void> {
  if (featureFlags.horoscope) {
    await boss.schedule(
      JobNames.WeeklyHoroscopePublish,
      '0 10 * * 1',
      schedulerPayload('horoscope', 'weekly_publish'),
    );
  }

  if (featureFlags.checkin) {
    await boss.schedule(
      JobNames.WeeklyCheckinNudge,
      '0 12 * * 3',
      schedulerPayload('checkin', 'weekly_nudge'),
    );
  }

  if (featureFlags.raid) {
    await boss.schedule(JobNames.WeeklyRaidStart, '0 9 * * 1', schedulerPayload('raid', 'weekly_start'));
    await boss.schedule(JobNames.WeeklyRaidEnd, '5 9 * * 1', schedulerPayload('raid', 'weekly_end'));
    await boss.schedule(
      JobNames.DailyRaidOffersGenerate,
      '0 9 * * *',
      schedulerPayload('raid', 'daily_offers_generate'),
    );
    await boss.schedule(
      JobNames.RaidProgressRefresh,
      '*/10 * * * *',
      schedulerPayload('raid', 'progress_refresh'),
    );
  }

  await boss.schedule(
    JobNames.PublicPostPublish,
    '*/2 * * * *',
    schedulerPayload('public_post', 'publish_pending'),
  );

  logger.info({ feature: 'queue.scheduler' }, 'Recurring schedules configured');
}