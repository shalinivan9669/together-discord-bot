import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .default('false');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url(),
  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_APP_ID: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  TZ: z.string().default('Asia/Almaty'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Almaty'),
  PHASE2_HOROSCOPE_ENABLED: booleanFromString,
  PHASE2_CHECKIN_ENABLED: booleanFromString,
  PHASE2_ANON_ENABLED: booleanFromString,
  PHASE2_REWARDS_ENABLED: booleanFromString,
  PHASE2_SEASONS_ENABLED: booleanFromString,
  PHASE2_RAID_ENABLED: booleanFromString,
  SCOREBOARD_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(12),
  RAID_PROGRESS_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(15)
});

const parsed = envSchema.safeParse(process.env);

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