DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND (
        (c.table_name = 'guild_settings' AND c.column_name IN (
          'guild_id',
          'oracle_channel_id',
          'oracle_message_id',
          'horoscope_channel_id',
          'horoscope_post_message_id',
          'astro_horoscope_channel_id',
          'astro_horoscope_message_id'
        ))
        OR (c.table_name = 'oracle_weeks' AND c.column_name IN ('guild_id'))
        OR (c.table_name = 'oracle_claims' AND c.column_name IN ('guild_id', 'user_id'))
        OR (c.table_name = 'horoscope_weeks' AND c.column_name IN ('guild_id'))
        OR (c.table_name = 'horoscope_claims' AND c.column_name IN ('guild_id', 'user_id'))
      )
  LOOP
    IF col.udt_name IN ('int2', 'int4', 'int8', 'numeric') OR col.data_type IN ('smallint', 'integer', 'bigint', 'numeric') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE varchar(32) USING %I::text',
        col.table_name,
        col.column_name,
        col.column_name
      );
    END IF;
  END LOOP;
END
$$;
