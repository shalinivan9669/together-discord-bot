CREATE TABLE IF NOT EXISTS "guild_settings" (
  "guild_id" varchar(32) PRIMARY KEY,
  "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Almaty',
  "horoscope_channel_id" varchar(32),
  "questions_channel_id" varchar(32),
  "raid_channel_id" varchar(32),
  "duel_public_channel_id" varchar(32),
  "moderator_role_id" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
  "user_id" varchar(32) PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pairs" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "user1_id" varchar(32) NOT NULL,
  "user2_id" varchar(32) NOT NULL,
  "user_low" varchar(32) NOT NULL,
  "user_high" varchar(32) NOT NULL,
  "private_channel_id" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pairs_guild_user_low_user_high_uq" UNIQUE("guild_id", "user_low", "user_high")
);

CREATE TABLE IF NOT EXISTS "duels" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "public_channel_id" varchar(32) NOT NULL,
  "scoreboard_message_id" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "duel_rounds" (
  "id" varchar(36) PRIMARY KEY,
  "duel_id" varchar(36) NOT NULL,
  "round_no" integer NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ends_at" timestamptz NOT NULL,
  "closed_at" timestamptz,
  CONSTRAINT "duel_rounds_duel_round_no_uq" UNIQUE("duel_id", "round_no")
);

CREATE TABLE IF NOT EXISTS "duel_submissions" (
  "id" varchar(36) PRIMARY KEY,
  "round_id" varchar(36) NOT NULL,
  "pair_id" varchar(36) NOT NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "duel_submissions_round_pair_uq" UNIQUE("round_id", "pair_id")
);

CREATE TABLE IF NOT EXISTS "scheduled_posts" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "type" varchar(64) NOT NULL,
  "target_channel_id" varchar(32) NOT NULL,
  "payload_json" jsonb NOT NULL,
  "scheduled_for" timestamptz NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "idempotency_key" varchar(200) NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "op_dedup" (
  "operation_key" varchar(200) PRIMARY KEY,
  "payload_hash" varchar(128),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "command_rate_limits" (
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "action_key" varchar(64) NOT NULL,
  "day_date" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "command_rate_limits_pk" PRIMARY KEY("guild_id", "user_id", "action_key", "day_date")
);

CREATE TABLE IF NOT EXISTS "content_horoscope_archetypes" (
  "key" varchar(64) PRIMARY KEY,
  "title" varchar(100) NOT NULL,
  "variants_json" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "horoscope_weeks" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "week_start_date" text NOT NULL,
  "archetype_key" varchar(64) NOT NULL,
  "seed" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "horoscope_weeks_guild_week_uq" UNIQUE("guild_id", "week_start_date")
);

CREATE TABLE IF NOT EXISTS "horoscope_claims" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "week_start_date" text NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "delivered_to" varchar(32) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "horoscope_claims_guild_week_user_uq" UNIQUE("guild_id", "week_start_date", "user_id")
);

CREATE TABLE IF NOT EXISTS "agreements_library" (
  "key" varchar(64) PRIMARY KEY,
  "text" varchar(240) NOT NULL,
  "tags_json" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "checkins" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "pair_id" varchar(36) NOT NULL,
  "week_start_date" text NOT NULL,
  "scores_json" jsonb NOT NULL,
  "agreement_key" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'submitted',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "checkins_pair_week_uq" UNIQUE("pair_id", "week_start_date")
);

CREATE TABLE IF NOT EXISTS "anon_questions" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "author_user_id" varchar(32) NOT NULL,
  "question_text" varchar(400) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "published_message_id" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "approved_by" varchar(32),
  "approved_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "rewards_ledger" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "kind" varchar(24) NOT NULL,
  "amount" integer NOT NULL,
  "key" varchar(64) NOT NULL,
  "source_type" varchar(64) NOT NULL,
  "source_id" varchar(64) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "rewards_ledger_dedupe_uq" UNIQUE("kind", "key", "source_type", "source_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "progress_state" (
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "level" integer NOT NULL DEFAULT 1,
  "unlocks_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "progress_state_guild_user_uq" UNIQUE("guild_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "seasons" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "season_key" varchar(64) NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'planned',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "seasons_guild_season_uq" UNIQUE("guild_id", "season_key")
);

CREATE TABLE IF NOT EXISTS "weekly_capsules" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "week_start_date" text NOT NULL,
  "seed" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "weekly_capsules_guild_week_uq" UNIQUE("guild_id", "week_start_date")
);

CREATE TABLE IF NOT EXISTS "raids" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "week_start_date" text NOT NULL,
  "week_end_at" timestamptz NOT NULL,
  "goal_points" integer NOT NULL,
  "progress_points" integer NOT NULL DEFAULT 0,
  "public_channel_id" varchar(32) NOT NULL,
  "progress_message_id" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "raids_guild_week_uq" UNIQUE("guild_id", "week_start_date")
);

CREATE TABLE IF NOT EXISTS "raid_quests" (
  "id" varchar(36) PRIMARY KEY,
  "key" varchar(64) NOT NULL UNIQUE,
  "category" varchar(64) NOT NULL,
  "difficulty" varchar(16) NOT NULL,
  "points" integer NOT NULL,
  "text" varchar(240) NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "raid_daily_offers" (
  "id" varchar(36) PRIMARY KEY,
  "raid_id" varchar(36) NOT NULL,
  "day_date" text NOT NULL,
  "quest_keys_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "raid_daily_offers_raid_day_uq" UNIQUE("raid_id", "day_date")
);

CREATE TABLE IF NOT EXISTS "raid_claims" (
  "id" varchar(36) PRIMARY KEY,
  "raid_id" varchar(36) NOT NULL,
  "day_date" text NOT NULL,
  "pair_id" varchar(36) NOT NULL,
  "quest_key" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending_confirm',
  "base_points" integer NOT NULL,
  "bonus_points" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "confirmed_at" timestamptz,
  CONSTRAINT "raid_claims_raid_day_pair_quest_uq" UNIQUE("raid_id", "day_date", "pair_id", "quest_key")
);

CREATE TABLE IF NOT EXISTS "raid_pair_daily_totals" (
  "raid_id" varchar(36) NOT NULL,
  "day_date" text NOT NULL,
  "pair_id" varchar(36) NOT NULL,
  "points_total" integer NOT NULL DEFAULT 0,
  CONSTRAINT "raid_pair_daily_totals_raid_day_pair_uq" UNIQUE("raid_id", "day_date", "pair_id")
);

CREATE TABLE IF NOT EXISTS "event_outbox" (
  "id" varchar(36) PRIMARY KEY,
  "event_type" varchar(64) NOT NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "sequence_numbers" (
  "key" varchar(64) PRIMARY KEY,
  "value" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);