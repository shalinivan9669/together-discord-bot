ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "hall_channel_id" varchar(32);

CREATE TABLE IF NOT EXISTS "monthly_hall_cards" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "month_key" varchar(7) NOT NULL,
  "channel_id" varchar(32) NOT NULL,
  "message_id" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "monthly_hall_cards_guild_month_uq" UNIQUE("guild_id", "month_key")
);

CREATE TABLE IF NOT EXISTS "monthly_hall_opt_ins" (
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "category" varchar(24) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "monthly_hall_opt_ins_pk" PRIMARY KEY("guild_id", "user_id", "category")
);

CREATE INDEX IF NOT EXISTS "pairs_guild_status_idx"
  ON "pairs" ("guild_id", "status");

CREATE INDEX IF NOT EXISTS "pairs_guild_private_status_idx"
  ON "pairs" ("guild_id", "private_channel_id", "status");

CREATE INDEX IF NOT EXISTS "duels_guild_status_created_idx"
  ON "duels" ("guild_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "duel_rounds_duel_status_round_idx"
  ON "duel_rounds" ("duel_id", "status", "round_no" DESC);

CREATE INDEX IF NOT EXISTS "duel_submissions_round_created_idx"
  ON "duel_submissions" ("round_id", "created_at");

CREATE INDEX IF NOT EXISTS "duel_submissions_created_idx"
  ON "duel_submissions" ("created_at");

CREATE INDEX IF NOT EXISTS "checkins_guild_created_idx"
  ON "checkins" ("guild_id", "created_at");

CREATE INDEX IF NOT EXISTS "raids_guild_status_created_idx"
  ON "raids" ("guild_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "raid_claims_raid_status_created_idx"
  ON "raid_claims" ("raid_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "raid_pair_daily_totals_raid_pair_day_idx"
  ON "raid_pair_daily_totals" ("raid_id", "pair_id", "day_date");

CREATE INDEX IF NOT EXISTS "scheduled_posts_status_scheduled_idx"
  ON "scheduled_posts" ("status", "scheduled_for", "updated_at");

CREATE INDEX IF NOT EXISTS "monthly_hall_opt_ins_guild_category_idx"
  ON "monthly_hall_opt_ins" ("guild_id", "category", "user_id");
