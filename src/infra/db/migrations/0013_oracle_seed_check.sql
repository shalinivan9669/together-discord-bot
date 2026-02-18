DO $$
BEGIN
  IF to_regclass('public.oracle_weeks') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'oracle_weeks_seed_int4_safe_chk'
    ) THEN
    EXECUTE '
      ALTER TABLE public.oracle_weeks
      ADD CONSTRAINT oracle_weeks_seed_int4_safe_chk
      CHECK (seed >= 1 AND seed <= 2147483646)
    ';
  END IF;
END
$$;
