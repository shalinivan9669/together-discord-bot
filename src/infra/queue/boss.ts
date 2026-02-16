import { randomUUID } from 'node:crypto';
import PgBoss from 'pg-boss';
import {
  AllJobNames,
  duelRoundClosePayloadSchema,
  duelScoreboardRefreshPayloadSchema,
  genericScheduledPayloadSchema,
  type JobName,
  JobNames,
  publicPostPublishPayloadSchema,
  raidProgressRefreshPayloadSchema
} from './jobs';
import { JOB_RETRY_DELAY_SECONDS, JOB_RETRY_LIMIT } from '../../config/constants';
import { logger } from '../../lib/logger';
import { captureException } from '../sentry/sentry';
import { duelCloseRoundUsecase } from '../../app/usecases/duelUsecases';
import { refreshDuelScoreboardProjection } from '../../discord/projections/scoreboard';
import type { ThrottledMessageEditor } from '../../discord/projections/messageEditor';
import { refreshRaidProgressProjection } from '../../discord/projections/raidProgress';
import { configureRecurringSchedules } from './scheduler';

type QueueRuntimeParams = {
  databaseUrl: string;
};

export type QueueRuntime = {
  boss: PgBoss;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: () => boolean;
  setMessageEditor: (editor: ThrottledMessageEditor) => void;
};

type PgErrorLike = {
  code?: string;
  message?: string;
};

function isQueueExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const parsed = error as PgErrorLike;

  if (parsed.code === '23505') {
    return true;
  }

  const message = parsed.message?.toLowerCase() ?? '';
  return message.includes('queue') && message.includes('already exists');
}

export async function ensureQueues(boss: PgBoss, jobNames: readonly JobName[]): Promise<void> {
  logger.info(
    { feature: 'queue', action: 'ensureQueues', queue_count: jobNames.length },
    'Ensuring pg-boss queues',
  );

  for (const name of jobNames) {
    try {
      await boss.createQueue(name);
    } catch (error) {
      if (isQueueExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  logger.info({ feature: 'queue', action: 'ensureQueues' }, 'pg-boss queues ensured');
}

export function createQueueRuntime(params: QueueRuntimeParams): QueueRuntime {
  const boss = new PgBoss({
    connectionString: params.databaseUrl,
    schema: 'public',
    migrate: true,
    retryLimit: JOB_RETRY_LIMIT,
    retryDelay: JOB_RETRY_DELAY_SECONDS,
    monitorStateIntervalSeconds: 15,
    maintenanceIntervalSeconds: 60
  });

  let ready = false;
  let messageEditor: ThrottledMessageEditor | null = null;

  async function registerHandlers(): Promise<void> {
    await boss.work(JobNames.DuelRoundClose, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelRoundClosePayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        await duelCloseRoundUsecase({
          guildId: parsed.guildId,
          duelId: parsed.duelId,
          roundId: parsed.roundId,
          correlationId: parsed.correlationId,
          interactionId: parsed.interactionId,
          userId: parsed.userId,
          boss,
        });

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.DuelScoreboardRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelScoreboardRefreshPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshDuelScoreboardProjection(parsed.duelId, messageEditor);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.RaidProgressRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = raidProgressRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        await refreshRaidProgressProjection();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PublicPostPublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = publicPostPublishPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'public post publish stub');
      }
    });

    const scheduledJobs = [
      JobNames.WeeklyHoroscopePublish,
      JobNames.WeeklyCheckinNudge,
      JobNames.WeeklyRaidStart,
      JobNames.WeeklyRaidEnd,
      JobNames.DailyRaidOffersGenerate
    ] as const;

    for (const name of scheduledJobs) {
      await boss.work(name, async (jobs) => {
        for (const job of jobs) {
          const parsed = genericScheduledPayloadSchema.parse(
            job.data ?? {
              correlationId: randomUUID(),
              guildId: 'scheduler',
              feature: name,
              action: 'tick'
            },
          );
          logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'scheduled job stub');
        }
      });
    }
  }

  boss.on('error', (error) => {
    logger.error({ error, feature: 'queue' }, 'pg-boss error');
    captureException(error, { feature: 'queue' });
  });

  return {
    boss,
    setMessageEditor(editor) {
      messageEditor = editor;
    },
    async start() {
      try {
        await boss.start();
        await ensureQueues(boss, AllJobNames);
        await registerHandlers();
        await configureRecurringSchedules(boss);
        ready = true;
        logger.info({ feature: 'queue' }, 'pg-boss started');
      } catch (error) {
        ready = false;
        captureException(error, { feature: 'queue.start' });
        throw error;
      }
    },
    async stop() {
      ready = false;
      await boss.stop();
      logger.info({ feature: 'queue' }, 'pg-boss stopped');
    },
    isReady() {
      return ready;
    }
  };
}
