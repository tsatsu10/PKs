-- Phase 0a 2c: stop defaulting every account to Africa/Accra.
--
-- * users.timezone loses its default. The client falls back to the browser's zone, and the
--   dashboard RPCs already treat NULL as UTC (20260927000005).
-- * handle_new_user stores the zone Register sends in the signup metadata (options.data.timezone),
--   but only a name Postgres knows; anything else becomes NULL. With email confirmation on there
--   is no session at signup, so the browser can't write the row itself.
-- * Existing rows are not rewritten: a deliberate Accra can't be told apart from the old default.
--   Settings offers the browser's zone instead.
-- Compatible with older clients: they send no timezone, so new rows get NULL.

ALTER TABLE public.users ALTER COLUMN timezone DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, timezone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'displayName', ''),
    (SELECT z.name FROM pg_catalog.pg_timezone_names z
      WHERE z.name = NEW.raw_user_meta_data->>'timezone' LIMIT 1)
  );
  RETURN NEW;
END;
$$;
