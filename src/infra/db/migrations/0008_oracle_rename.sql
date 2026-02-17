DO $$
BEGIN
  IF to_regclass('public.content_horoscope_archetypes') IS NOT NULL
    AND to_regclass('public.content_oracle_archetypes') IS NULL THEN
    EXECUTE 'ALTER TABLE public.content_horoscope_archetypes RENAME TO content_oracle_archetypes';
  END IF;

  IF to_regclass('public.horoscope_weeks') IS NOT NULL
    AND to_regclass('public.oracle_weeks') IS NULL THEN
    EXECUTE 'ALTER TABLE public.horoscope_weeks RENAME TO oracle_weeks';
  END IF;

  IF to_regclass('public.horoscope_claims') IS NOT NULL
    AND to_regclass('public.oracle_claims') IS NULL THEN
    EXECUTE 'ALTER TABLE public.horoscope_claims RENAME TO oracle_claims';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guild_settings'
      AND column_name = 'horoscope_channel_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guild_settings'
      AND column_name = 'oracle_channel_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.guild_settings RENAME COLUMN horoscope_channel_id TO oracle_channel_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guild_settings'
      AND column_name = 'horoscope_message_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guild_settings'
      AND column_name = 'oracle_message_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.guild_settings RENAME COLUMN horoscope_message_id TO oracle_message_id';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.oracle_weeks') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horoscope_weeks_guild_week_uq')
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oracle_weeks_guild_week_uq') THEN
    EXECUTE 'ALTER TABLE public.oracle_weeks RENAME CONSTRAINT horoscope_weeks_guild_week_uq TO oracle_weeks_guild_week_uq';
  END IF;

  IF to_regclass('public.oracle_claims') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horoscope_claims_guild_week_user_uq')
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oracle_claims_guild_week_user_uq') THEN
    EXECUTE 'ALTER TABLE public.oracle_claims RENAME CONSTRAINT horoscope_claims_guild_week_user_uq TO oracle_claims_guild_week_user_uq';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.guild_settings') IS NOT NULL THEN
    UPDATE public.guild_settings
    SET features = (features - 'horoscope') || jsonb_build_object('oracle', COALESCE((features ->> 'horoscope')::boolean, false)),
        updated_at = now()
    WHERE features ? 'horoscope' AND NOT (features ? 'oracle');

    UPDATE public.guild_settings
    SET features = features - 'horoscope',
        updated_at = now()
    WHERE features ? 'horoscope' AND features ? 'oracle';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.scheduled_posts') IS NOT NULL THEN
    UPDATE public.scheduled_posts
    SET type = 'oracle_weekly',
        updated_at = now()
    WHERE type = 'horoscope_weekly';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.scheduler_settings') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.scheduler_settings WHERE schedule_name = 'weekly.horoscope.publish'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.scheduler_settings WHERE schedule_name = 'weekly.oracle.publish'
    ) THEN
      UPDATE public.scheduler_settings
      SET schedule_name = 'weekly.oracle.publish',
          updated_at = now()
      WHERE schedule_name = 'weekly.horoscope.publish';
    ELSIF EXISTS (
      SELECT 1 FROM public.scheduler_settings WHERE schedule_name = 'weekly.horoscope.publish'
    ) AND EXISTS (
      SELECT 1 FROM public.scheduler_settings WHERE schedule_name = 'weekly.oracle.publish'
    ) THEN
      DELETE FROM public.scheduler_settings WHERE schedule_name = 'weekly.horoscope.publish';
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.schedule') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.horoscope.publish'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.oracle.publish'
    ) THEN
      UPDATE public.schedule
      SET name = 'weekly.oracle.publish'
      WHERE name = 'weekly.horoscope.publish';
    ELSIF EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.horoscope.publish'
    ) AND EXISTS (
      SELECT 1 FROM public.schedule WHERE name = 'weekly.oracle.publish'
    ) THEN
      DELETE FROM public.schedule WHERE name = 'weekly.horoscope.publish';
    END IF;
  END IF;
END
$$;
