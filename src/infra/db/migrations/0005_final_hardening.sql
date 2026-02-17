ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "horoscope_message_id" varchar(32);

CREATE INDEX IF NOT EXISTS "pairs_guild_created_idx"
  ON "pairs" ("guild_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "raid_claims_raid_day_status_idx"
  ON "raid_claims" ("raid_id", "day_date", "status");

CREATE INDEX IF NOT EXISTS "checkins_week_pair_idx"
  ON "checkins" ("week_start_date", "pair_id");

CREATE INDEX IF NOT EXISTS "scheduled_posts_due_status_idx"
  ON "scheduled_posts" ("status", "scheduled_for")
  WHERE "status" IN ('pending', 'processing');
