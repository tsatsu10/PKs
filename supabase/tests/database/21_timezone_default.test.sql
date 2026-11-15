BEGIN;
SELECT plan(4);

SELECT col_hasnt_default('public', 'users', 'timezone', 'users.timezone has no default (no Accra fallback)');

CREATE TEMP TABLE tz_case(key text, meta jsonb);
INSERT INTO tz_case VALUES
  ('tz_valid', '{"timezone":"Europe/Berlin"}'),
  ('tz_bogus', '{"timezone":"Not/AZone"}'),
  ('tz_none',  '{"display_name":"x"}');

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  key || '@test.local', '', now(), '{}'::jsonb, meta, now(), now()
FROM tz_case;

SELECT is((SELECT timezone FROM public.users WHERE email = 'tz_valid@test.local'), 'Europe/Berlin',
  'signup stores a valid timezone from the user metadata');
SELECT is((SELECT timezone FROM public.users WHERE email = 'tz_bogus@test.local'), NULL,
  'an unknown zone name is stored as NULL');
SELECT is((SELECT timezone FROM public.users WHERE email = 'tz_none@test.local'), NULL,
  'no timezone in the metadata gives NULL');

SELECT * FROM finish();
ROLLBACK;
