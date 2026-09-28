-- Local/CI only: test tooling. Never applied to production.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO authenticated, anon;

-- Create a confirmed (or unconfirmed) auth user; handle_new_user adds public.users.
CREATE OR REPLACE FUNCTION tests.create_user(p_key text, p_confirmed boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_key || '@test.local', '',
    CASE WHEN p_confirmed THEN now() END, '{}'::jsonb, '{}'::jsonb, now(), now()
  );
  PERFORM set_config('tests.' || p_key, v_id::text, true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION tests.uid(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT current_setting('tests.' || p_key)::uuid $$;

-- Impersonate a user for the rest of the transaction (RLS applies).
CREATE OR REPLACE FUNCTION tests.act_as(p_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_key), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;
