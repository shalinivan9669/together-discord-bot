import Fastify from 'fastify';
import { APP_VERSION } from '../config/constants';
import { checkDbHealth } from '../infra/db/client';

type ServerDeps = {
  isDiscordReady: () => boolean;
  isBossReady: () => boolean;
};

export type HttpRuntime = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  server: ReturnType<typeof Fastify>;
};

export function createHttpRuntime(deps: ServerDeps): HttpRuntime {
  const server = Fastify({ logger: false });

  server.get('/healthz', async () => {
    const dbOk = await checkDbHealth();

    return {
      ok: dbOk && deps.isDiscordReady() && deps.isBossReady(),
      version: APP_VERSION,
      uptime: process.uptime(),
      db: dbOk ? 'ok' : 'fail',
      discord: deps.isDiscordReady() ? 'ready' : 'not_ready',
      boss: deps.isBossReady() ? 'ok' : 'fail'
    };
  });

  return {
    server,
    async start() {
      const port = Number(process.env.PORT ?? 3000);
      const host = process.env.HOST ?? '0.0.0.0';
      await server.listen({ port, host });
    },
    async stop() {
      await server.close();
    }
  };
}