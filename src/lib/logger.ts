import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['token', 'database_url', 'DATABASE_URL', 'authorization', 'headers.authorization'],
    censor: '[REDACTED]'
  }
});

export type Logger = typeof logger;