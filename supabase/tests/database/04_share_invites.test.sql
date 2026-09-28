BEGIN;
SELECT plan(9);

SELECT tests.create_user('owner');
SELECT tests.create_user('known');
SELECT tests.create_user('unconfirmed', false);
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Doc');

SELECT tests.act_as('owner');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'KNOWN@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'sharing with a confirmed user returns ok');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'nobody@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'same response for an unknown email (no enumeration)');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'unconfirmed@test.local', 'editor'),
  '{"status": "ok"}'::jsonb, 'same response for an unconfirmed email');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('known')), 1, 'confirmed user got access immediately');
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 0, 'unconfirmed user got no access (S1)');

UPDATE auth.users SET email_confirmed_at = now() WHERE id = tests.uid('unconfirmed');
SELECT is((SELECT role::text FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 'editor', 'invite converts on confirmation');

SELECT tests.create_user('latecomer');  -- the invite for this email was sent before signup
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'latecomer@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('latecomer')), 1, 'an existing confirmed signup gets access');

SELECT tests.act_as('known');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'x@test.local', 'viewer')$$,
  '42501', NULL, 'only the owner can share');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'not-an-email', 'viewer')$$,
  '22023', NULL, 'invalid email is rejected');

SELECT * FROM finish();
ROLLBACK;
