ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "published_message_id" varchar(32);

ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "last_error" text;

ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "horoscope_claims"
  ADD COLUMN IF NOT EXISTS "mode" varchar(16);

ALTER TABLE "horoscope_claims"
  ADD COLUMN IF NOT EXISTS "context" varchar(24);

ALTER TABLE "horoscope_claims"
  ADD COLUMN IF NOT EXISTS "claim_text" varchar(600);

ALTER TABLE "raid_claims"
  ADD COLUMN IF NOT EXISTS "requested_by_user_id" varchar(32);

ALTER TABLE "raid_claims"
  ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" varchar(32);
