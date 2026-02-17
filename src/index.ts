import { env, assertRuntimeDiscordEnv } from './config/env';
import { logger } from './lib/logger';
import { initSentry, captureException } from './infra/sentry/sentry';
import { createQueueRuntime } from './infra/queue/boss';
import { createDiscordRuntime } from './discord/client';
import { ThrottledMessageEditor } from './discord/projections/messageEditor';
import { createHttpRuntime } from './http/server';
import { checkDbHealth, pgPool } from './infra/db/client';

assertRuntimeDiscordEnv(env);

initSentry();

const queueRuntime = createQueueRuntime({
  databaseUrl: env.DATABASE_URL
});

const discordRuntime = createDiscordRuntime({
  token: env.DISCORD_TOKEN,
  boss: queueRuntime.boss,
  allowedGuildIds: env.ALLOWED_GUILD_IDS
});
queueRuntime.setDiscordClient(discordRuntime.client);

const messageEditor = new ThrottledMessageEditor(discordRuntime.client, env.SCOREBOARD_EDIT_THROTTLE_SECONDS);
queueRuntime.setMessageEditor(messageEditor);

const httpRuntime = createHttpRuntime({
  isDiscordReady: discordRuntime.isReady,
  isBossReady: queueRuntime.isReady
});

let shuttingDown = false;

async function runStartupSelfCheck(): Promise<void> {
  const dbOk = await checkDbHealth();
  const bossOk = queueRuntime.isReady();
  const discordConnected = discordRuntime.isReady();
  const schedules = queueRuntime
    .getScheduleStatus()
    .map((schedule) => `${schedule.name}:${schedule.enabled ? 'enabled' : 'disabled'}`);

  logger.info(
    {
      feature: 'boot.self_check',
      discord: {
        connected: discordConnected,
        guild_count: discordRuntime.guildCount()
      },
      db: dbOk ? 'ok' : 'fail',
      boss: bossOk ? 'ok' : 'fail',
      schedules
    },
    'Startup self-check',
  );

  if (!dbOk || !bossOk || !discordConnected) {
    throw new Error('Startup self-check failed');
  }
}

async function start(): Promise<void> {
  await queueRuntime.start();
  await discordRuntime.login();
  await httpRuntime.start();
  await runStartupSelfCheck();

  logger.info({ feature: 'boot', node_env: env.NODE_ENV }, 'Application started');
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ feature: 'shutdown', signal }, 'Shutdown started');

  const failures: Array<{ step: string; error: unknown }> = [];

  const runStep = async (step: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      failures.push({ step, error });
      logger.error({ feature: 'shutdown', signal, step, error }, 'Shutdown step failed');
    }
  };

  await runStep('discord.destroy', async () => {
    await discordRuntime.destroy();
  });
  await runStep('boss.stop', async () => {
    await queueRuntime.stop();
  });
  await runStep('db.pool.end', async () => {
    await pgPool.end();
  });
  await runStep('http.stop', async () => {
    await httpRuntime.stop();
  });

  if (failures.length === 0) {
    logger.info({ feature: 'shutdown', signal }, 'Shutdown complete');
    process.exit(0);
    return;
  }

  logger.error({ feature: 'shutdown', signal, failed_steps: failures.map((failure) => failure.step) }, 'Shutdown failed');
  process.exit(1);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start().catch((error) => {
  captureException(error, { feature: 'boot' });
  logger.error({ error }, 'Boot failure');
  void shutdown('BOOT_FAILURE');
});
