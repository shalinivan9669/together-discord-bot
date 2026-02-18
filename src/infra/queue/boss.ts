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
  mediatorRepairTickPayloadSchema,
  monthlyHallRefreshPayloadSchema,
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
import { refreshWeeklyOracleProjection } from '../../discord/projections/oracleWeekly';
import { refreshAstroHoroscopeProjection } from '../../discord/projections/astroHoroscope';
import { refreshMonthlyHallProjection } from '../../discord/projections/monthlyHall';
import { sendComponentsV2Message, textBlock, uiCard } from '../../discord/ui-v2';
import { configureRecurringSchedules, type RecurringScheduleStatus } from './scheduler';
import { publishDueScheduledPosts } from '../../app/services/publicPostService';
import { scheduleWeeklyCheckinNudges } from '../../app/services/checkinService';
import { markHoroscopePublished, queueAstroPublishForTick } from '../../app/services/astroHoroscopeService';
import {
  endExpiredRaids,
  generateDailyRaidOffers,
  startWeeklyRaidsForConfiguredGuilds
} from '../../app/services/raidService';
import { runMediatorRepairTick } from '../../app/services/mediatorService';

type QueueRuntimeParams = {
  databaseUrl: string;
};

export type QueueRuntime = {
  boss: PgBoss;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: () => boolean;
  getScheduleStatus: () => RecurringScheduleStatus[];
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
  let scheduleStatus: RecurringScheduleStatus[] = [];
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

    await boss.work(JobNames.MonthlyHallRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = monthlyHallRefreshPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.MonthlyHallRefresh,
            action: 'tick'
          },
        );

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            month_key: parsed.monthKey ?? null
          },
          'job started',
        );

        if (!messageEditor) {
          throw new Error('Message editor not initialized for monthly hall refresh');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized for monthly hall refresh');
        }

        const refreshed = await refreshMonthlyHallProjection({
          client: discordClient,
          messageEditor,
          monthKey: parsed.monthKey
        });

        if (refreshed.failed > 0) {
          logger.warn(
            {
              feature: parsed.feature,
              action: parsed.action,
              job_id: job.id,
              processed: refreshed.processed,
              created: refreshed.created,
              updated: refreshed.updated,
              failed: refreshed.failed
            },
            'monthly hall refresh had failures',
          );
          throw new Error(`Monthly hall refresh failed for ${refreshed.failed} guild(s)`);
        }

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            processed: refreshed.processed,
            created: refreshed.created,
            updated: refreshed.updated,
            failed: refreshed.failed
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.MediatorRepairTick, async (jobs) => {
      for (const job of jobs) {
        const parsed = mediatorRepairTickPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!discordClient) {
          throw new Error('Discord client not initialized for mediator repair tick');
        }

        await runMediatorRepairTick({
          guildId: parsed.guildId,
          sessionId: parsed.sessionId,
          stepNumber: parsed.stepNumber,
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

    for (const oracleJobName of [JobNames.OracleWeeklyPublish, JobNames.OraclePublish] as const) {
      await boss.work(oracleJobName, async (jobs) => {
        for (const job of jobs) {
          const parsed = genericScheduledPayloadSchema.parse(
            job.data ?? {
              correlationId: randomUUID(),
              guildId: 'scheduler',
              feature: oracleJobName,
              action: 'tick'
            },
          );

          logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

          if (!messageEditor) {
            throw new Error('Message editor not initialized for oracle publish');
          }

          if (!discordClient) {
            throw new Error('Discord client not initialized for oracle publish');
          }

          const refreshed = await refreshWeeklyOracleProjection({
            client: discordClient,
            messageEditor,
            weekStartDate: parsed.weekStartDate,
            guildId: parsed.guildId === 'scheduler' ? undefined : parsed.guildId
          });

          if (refreshed.failed > 0) {
            throw new Error(`Oracle refresh failed for ${refreshed.failed} guild(s)`);
          }

          logger.info(
            {
              feature: parsed.feature,
              action: parsed.action,
              job_id: job.id,
              processed: refreshed.processed,
              created: refreshed.created,
              updated: refreshed.updated,
              failed: refreshed.failed
            },
            'job completed',
          );
        }
      });
    }

    await boss.work(JobNames.AstroTickDaily, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.AstroTickDaily,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        const ticked = await queueAstroPublishForTick({
          now: new Date(),
          enqueue: async ({ guildId, reason, runAt, dedupeKey }) => {
            await boss.send(
              JobNames.AstroPublish,
              {
                correlationId: parsed.correlationId,
                guildId,
                runAtIso: runAt.toISOString(),
                dedupeKey,
                feature: 'astro',
                action: reason
              },
              {
                singletonKey: dedupeKey,
                singletonSeconds: 86_400,
                retryLimit: 3
              },
            );
          }
        });

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            processed: ticked.processed,
            queued: ticked.queued
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.AstroPublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.AstroPublish,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!messageEditor) {
          throw new Error('Message editor not initialized for astro publish');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized for astro publish');
        }

        const refreshed = await refreshAstroHoroscopeProjection({
          client: discordClient,
          messageEditor,
          guildId: parsed.guildId === 'scheduler' ? undefined : parsed.guildId,
          isTest: parsed.isTest === true
        });

        if (refreshed.failed > 0) {
          throw new Error(`Astro projection refresh failed for ${refreshed.failed} guild(s)`);
        }

        if (parsed.guildId !== 'scheduler' && refreshed.processed > 0) {
          await markHoroscopePublished({
            guildId: parsed.guildId,
            isTest: parsed.isTest === true
          });
        }

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            processed: refreshed.processed,
            created: refreshed.created,
            updated: refreshed.updated,
            failed: refreshed.failed
          },
          'job completed',
        );
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
        const ended = await endExpiredRaids(new Date(), {
          boss,
          correlationId: parsed.correlationId
        });
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
        scheduleStatus = await configureRecurringSchedules(boss);
        ready = true;
        logger.info({ feature: 'queue' }, 'pg-boss started');
      } catch (error) {
        ready = false;
        scheduleStatus = [];
        captureException(error, { feature: 'queue.start' });
        throw error;
      }
    },
    async stop() {
      ready = false;
      scheduleStatus = [];
      await boss.stop();
      logger.info({ feature: 'queue' }, 'pg-boss stopped');
    },
    isReady() {
      return ready;
    },
    getScheduleStatus() {
      return [...scheduleStatus];
    }
  };
}

