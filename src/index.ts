import { env, assertRuntimeDiscordEnv } from './config/env';
import { logger } from './lib/logger';
import { initSentry, captureException } from './infra/sentry/sentry';
import { createQueueRuntime } from './infra/queue/boss';
import { createDiscordRuntime } from './discord/client';
import { ThrottledMessageEditor } from './discord/projections/messageEditor';
import { createHttpRuntime } from './http/server';
import { pgPool } from './infra/db/client';

assertRuntimeDiscordEnv(env);

initSentry();

const queueRuntime = createQueueRuntime({
  databaseUrl: env.DATABASE_URL
});

const discordRuntime = createDiscordRuntime({
  token: env.DISCORD_TOKEN,
  boss: queueRuntime.boss
});
queueRuntime.setDiscordClient(discordRuntime.client);

const messageEditor = new ThrottledMessageEditor(discordRuntime.client, env.SCOREBOARD_EDIT_THROTTLE_SECONDS);
queueRuntime.setMessageEditor(messageEditor);

const httpRuntime = createHttpRuntime({
  isDiscordReady: discordRuntime.isReady,
  isBossReady: queueRuntime.isReady
});

let shuttingDown = false;

async function start(): Promise<void> {
  await queueRuntime.start();
  await discordRuntime.login();
  await httpRuntime.start();

  logger.info({ feature: 'boot', node_env: env.NODE_ENV }, 'Application started');
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ feature: 'shutdown', signal }, 'Shutdown started');

  try {
    await queueRuntime.stop();
    await pgPool.end();
    await discordRuntime.destroy();
    await httpRuntime.stop();
    logger.info({ feature: 'shutdown', signal }, 'Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error, signal }, 'Shutdown failed');
    process.exit(1);
  }
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
