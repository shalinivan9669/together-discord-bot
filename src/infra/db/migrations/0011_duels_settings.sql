ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "duels_channel_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "duels_enabled" boolean NOT NULL DEFAULT true;

UPDATE "guild_settings"
SET "duels_channel_id" = "duel_public_channel_id"
WHERE "duels_channel_id" IS NULL
  AND "duel_public_channel_id" IS NOT NULL
  AND (
    "public_post_channel_id" IS NULL
    OR "duel_public_channel_id" <> "public_post_channel_id"
  );
