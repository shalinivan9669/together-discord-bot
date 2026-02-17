ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "locale" varchar(8) NOT NULL DEFAULT 'ru';

UPDATE "guild_settings"
SET "locale" = 'ru'
WHERE "locale" IS NULL OR trim("locale") = '';
