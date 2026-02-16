CREATE TABLE IF NOT EXISTS "mediator_say_sessions" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "source_text" varchar(400) NOT NULL,
  "soft_text" varchar(600) NOT NULL,
  "direct_text" varchar(600) NOT NULL,
  "short_text" varchar(600) NOT NULL,
  "selected_tone" varchar(16) NOT NULL DEFAULT 'soft',
  "sent_to_pair_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mediator_repair_sessions" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "pair_id" varchar(36) NOT NULL,
  "channel_id" varchar(32) NOT NULL,
  "message_id" varchar(32) NOT NULL,
  "started_by_user_id" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "current_step" integer NOT NULL DEFAULT 1,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_tick_at" timestamptz,
  "completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "mediator_repair_sessions_pair_status_idx"
  ON "mediator_repair_sessions" ("pair_id", "status");

CREATE TABLE IF NOT EXISTS "date_weekend_plans" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "weekend_date" text NOT NULL,
  "energy" varchar(16) NOT NULL,
  "budget" varchar(16) NOT NULL,
  "time_window" varchar(16) NOT NULL,
  "ideas_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "date_weekend_plans_user_weekend_profile_uq"
    UNIQUE("guild_id", "user_id", "weekend_date", "energy", "budget", "time_window")
);
