ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "zodiac_sign" text;

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "oracle_message_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "astro_horoscope_channel_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "astro_horoscope_message_id" varchar(32);

ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "astro_horoscope_anchor_date" date;

CREATE TABLE IF NOT EXISTS "content_astro_archetypes" (
  "key" varchar(64) PRIMARY KEY,
  "title" varchar(100) NOT NULL,
  "variants_json" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "astro_cycles" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "cycle_start_date" date NOT NULL,
  "archetype_key" varchar(64) NOT NULL REFERENCES "content_astro_archetypes"("key"),
  "seed" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "astro_cycles_guild_cycle_uq" UNIQUE("guild_id", "cycle_start_date")
);

CREATE TABLE IF NOT EXISTS "astro_claims" (
  "id" varchar(36) PRIMARY KEY,
  "guild_id" varchar(32) NOT NULL,
  "cycle_start_date" date NOT NULL,
  "user_id" varchar(32) NOT NULL,
  "pair_id" varchar(36),
  "delivered_to" varchar(32) NOT NULL DEFAULT 'ephemeral',
  "sign_key" varchar(16) NOT NULL,
  "mode" varchar(16) NOT NULL,
  "context" varchar(24) NOT NULL,
  "claim_text" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "astro_claims_guild_cycle_user_uq" UNIQUE("guild_id", "cycle_start_date", "user_id")
);

CREATE INDEX IF NOT EXISTS "astro_cycles_guild_start_idx"
  ON "astro_cycles" ("guild_id", "cycle_start_date" DESC);

CREATE INDEX IF NOT EXISTS "astro_claims_guild_user_cycle_idx"
  ON "astro_claims" ("guild_id", "user_id", "cycle_start_date" DESC);
