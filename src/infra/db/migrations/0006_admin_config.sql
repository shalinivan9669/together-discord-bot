ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "pair_category_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "public_post_channel_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "anon_inbox_channel_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "anon_mod_role_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "features" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "scheduler_settings" (
  "schedule_name" varchar(128) PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

UPDATE "guild_settings"
SET "public_post_channel_id" = COALESCE("public_post_channel_id", "duel_public_channel_id")
WHERE "public_post_channel_id" IS NULL
  AND "duel_public_channel_id" IS NOT NULL;

UPDATE "guild_settings"
SET "anon_inbox_channel_id" = COALESCE("anon_inbox_channel_id", "questions_channel_id")
WHERE "anon_inbox_channel_id" IS NULL
  AND "questions_channel_id" IS NOT NULL;

UPDATE "guild_settings"
SET "anon_mod_role_id" = COALESCE("anon_mod_role_id", "moderator_role_id")
WHERE "anon_mod_role_id" IS NULL
  AND "moderator_role_id" IS NOT NULL;
