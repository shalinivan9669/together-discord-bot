import { setTimeout as sleep } from 'node:timers/promises';
import { logger } from '../../lib/logger';

type DiscordApiErrorLike = {
  status?: number;
  code?: string;
  data?: {
    retry_after?: number;
    message?: string;
  };
  message?: string;
};

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT'
]);

function toDiscordApiError(error: unknown): DiscordApiErrorLike {
  return (error ?? {}) as DiscordApiErrorLike;
}

export function getDiscordErrorStatus(error: unknown): number | null {
  const parsed = toDiscordApiError(error);
  return typeof parsed.status === 'number' ? parsed.status : null;
}

export function isRetryableDiscordError(error: unknown): boolean {
  const parsed = toDiscordApiError(error);
  const status = parsed.status;

  if (status === 429) {
    return true;
  }

  if (typeof status === 'number' && status >= 500) {
    return true;
  }

  if (parsed.code && RETRYABLE_NETWORK_CODES.has(parsed.code)) {
    return true;
  }

  return false;
}

function retryAfterMs(error: unknown): number | null {
  const parsed = toDiscordApiError(error);
  const seconds = parsed.data?.retry_after;
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return null;
  }

  return Math.ceil(seconds * 1000);
}

function nextBackoffMs(attempt: number, baseDelayMs: number, error: unknown): number {
  const explicitRetryAfterMs = retryAfterMs(error);
  if (explicitRetryAfterMs !== null) {
    return explicitRetryAfterMs;
  }

  const jitter = Math.floor(Math.random() * 180);
  return Math.min(15_000, baseDelayMs * 2 ** Math.max(0, attempt - 1) + jitter);
}

export async function withDiscordApiRetry<T>(input: {
  feature: string;
  action: string;
  context?: Record<string, unknown>;
  maxAttempts?: number;
  baseDelayMs?: number;
  execute: () => Promise<T>;
}): Promise<T> {
  const maxAttempts = input.maxAttempts ?? 5;
  const baseDelayMs = input.baseDelayMs ?? 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await input.execute();
    } catch (error) {
      const retryable = isRetryableDiscordError(error);

      if (!retryable || attempt >= maxAttempts) {
        logger.error(
          {
            feature: input.feature,
            action: input.action,
            attempt,
            status: getDiscordErrorStatus(error),
            error,
            ...input.context
          },
          'Discord API request failed',
        );
        throw error;
      }

      const waitMs = nextBackoffMs(attempt, baseDelayMs, error);
      logger.warn(
        {
          feature: input.feature,
          action: input.action,
          attempt,
          max_attempts: maxAttempts,
          status: getDiscordErrorStatus(error),
          backoff_ms: waitMs,
          ...input.context
        },
        'Discord API request retry scheduled',
      );

      await sleep(waitMs);
    }
  }

  throw new Error('Discord API retry exhausted unexpectedly');
}
