ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_message_id" varchar(32);

ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_pinned_at" timestamptz;

ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_pin_attempted_at" timestamptz;
