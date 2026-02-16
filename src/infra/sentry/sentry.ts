import * as Sentry from '@sentry/node';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

let initialized = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN || initialized) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0
  });

  initialized = true;
  logger.info({ feature: 'sentry' }, 'Sentry initialized');
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, { extra: context });
}