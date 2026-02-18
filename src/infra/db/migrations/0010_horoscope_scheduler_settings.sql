ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_channel_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_every_days" integer NOT NULL DEFAULT 4;

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_next_run_at" timestamptz;

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_last_post_at" timestamptz;

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_post_message_id" varchar(32);

UPDATE "guild_settings"
SET "horoscope_enabled" = COALESCE(("features" ->> 'astro')::boolean, true)
WHERE "features" ? 'astro';

UPDATE "guild_settings"
SET "horoscope_channel_id" = COALESCE("horoscope_channel_id", "astro_horoscope_channel_id", "oracle_channel_id")
WHERE "horoscope_channel_id" IS NULL;

UPDATE "guild_settings"
SET "horoscope_post_message_id" = COALESCE("horoscope_post_message_id", "astro_horoscope_message_id")
WHERE "horoscope_post_message_id" IS NULL;

UPDATE "guild_settings"
SET "horoscope_every_days" = 4
WHERE "horoscope_every_days" IS NULL OR "horoscope_every_days" <= 0;

UPDATE "guild_settings"
SET "horoscope_next_run_at" = now()
WHERE "horoscope_enabled" = true
  AND "horoscope_channel_id" IS NOT NULL
  AND "horoscope_next_run_at" IS NULL;
