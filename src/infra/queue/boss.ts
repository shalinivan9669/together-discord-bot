import { randomUUID } from 'node:crypto';
import type { Client } from 'discord.js';
import PgBoss from 'pg-boss';
import {
  AllJobNames,
  duelRoundClosePayloadSchema,
  duelScoreboardRefreshPayloadSchema,
  genericScheduledPayloadSchema,
  type JobName,
  JobNames,
  pairHomeRefreshPayloadSchema,
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
import { refreshPairHomeProjection } from '../../discord/projections/pairHome';
import { sendComponentsV2Message, textBlock, uiCard } from '../../discord/ui-v2';
import { configureRecurringSchedules } from './scheduler';
import { publishDueScheduledPosts } from '../../app/services/publicPostService';
import { scheduleWeeklyHoroscopePosts } from '../../app/services/horoscopeService';
import { scheduleWeeklyCheckinNudges } from '../../app/services/checkinService';
import {
  endExpiredRaids,
  generateDailyRaidOffers,
  startWeeklyRaidsForConfiguredGuilds
} from '../../app/services/raidService';

type QueueRuntimeParams = {
  databaseUrl: string;
};

export type QueueRuntime = {
  boss: PgBoss;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: () => boolean;
  setMessageEditor: (editor: ThrottledMessageEditor) => void;
  setDiscordClient: (client: Client) => void;
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
  let discordClient: Client | null = null;

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
        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshRaidProgressProjection(messageEditor, parsed.raidId);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PairHomeRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = pairHomeRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized');
        }

        await refreshPairHomeProjection({
          pairId: parsed.pairId,
          messageEditor,
          client: discordClient
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PublicPostPublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = publicPostPublishPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            scheduled_post_id: parsed.scheduledPostId ?? null
          },
          'job started',
        );

        if (!discordClient) {
          throw new Error('Discord client not initialized for public post publish');
        }

        const result = await publishDueScheduledPosts({
          client: discordClient,
          scheduledPostId: parsed.scheduledPostId,
          limit: 20
        });

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            processed: result.processed,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.WeeklyHoroscopePublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyHoroscopePublish,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await scheduleWeeklyHoroscopePosts();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyCheckinNudge, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyCheckinNudge,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await scheduleWeeklyCheckinNudges();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidStart, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidStart,
            action: 'tick'
          },
        );

        const readyClient = discordClient;
        if (!readyClient) {
          throw new Error('Discord client not initialized for weekly raid start');
        }

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await startWeeklyRaidsForConfiguredGuilds({
          boss,
          correlationId: parsed.correlationId,
          createProgressMessage: async ({ channelId, content }) => {
            const sent = await sendComponentsV2Message(readyClient, channelId, {
              components: [
                uiCard({
                  title: 'Cooperative Raid Progress',
                  status: 'initializing',
                  accentColor: 0x1e6f9f,
                  components: [textBlock(content)]
                })
              ]
            });
            return sent.id;
          }
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidEnd, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidEnd,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const ended = await endExpiredRaids();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, ended }, 'job completed');
      }
    });

    await boss.work(JobNames.DailyRaidOffersGenerate, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.DailyRaidOffersGenerate,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const generated = await generateDailyRaidOffers();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, generated }, 'job completed');
      }
    });
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
    setDiscordClient(client) {
      discordClient = client;
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
