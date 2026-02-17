import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .default('false');

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}, z.string().min(1).optional());

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}, z.string().url().optional());

const optionalGuildIdCsv = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const ids = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ids.length > 0 ? ids : undefined;
}, z.array(z.string().regex(/^\d{17,20}$/)).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url(),
  DISCORD_TOKEN: optionalNonEmptyString,
  DISCORD_APP_ID: optionalNonEmptyString,
  DISCORD_GUILD_ID: optionalNonEmptyString,
  ALLOWED_GUILD_IDS: optionalGuildIdCsv,
  SENTRY_DSN: optionalUrlString,
  TZ: z.string().default('Asia/Almaty'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Almaty'),
  PHASE2_ORACLE_ENABLED: booleanFromString,
  PHASE2_CHECKIN_ENABLED: booleanFromString,
  PHASE2_ANON_ENABLED: booleanFromString,
  PHASE2_REWARDS_ENABLED: booleanFromString,
  PHASE2_SEASONS_ENABLED: booleanFromString,
  PHASE2_RAID_ENABLED: booleanFromString,
  SCOREBOARD_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(12),
  RAID_PROGRESS_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(15)
});

const rawEnv = {
  ...process.env,
  // Backward compatibility for one release:
  // PHASE2_ORACLE_ENABLED <- PHASE2_HOROSCOPE_ENABLED fallback.
  PHASE2_ORACLE_ENABLED:
    process.env.PHASE2_ORACLE_ENABLED
    ?? process.env.PHASE2_HOROSCOPE_ENABLED
    ?? 'false',
};

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const flattened = parsed.error.flatten();
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattened.fieldErrors)}`);
}

export const env = parsed.data;
export type Env = typeof env;

export function assertRuntimeDiscordEnv(config: Env): asserts config is Env & {
  DISCORD_TOKEN: string;
  DISCORD_APP_ID: string;
} {
  if (!config.DISCORD_TOKEN || !config.DISCORD_APP_ID) {
    throw new Error('DISCORD_TOKEN and DISCORD_APP_ID are required for runtime bot process');
  }
}

