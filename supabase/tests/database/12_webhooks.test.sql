BEGIN;
SELECT plan(7);

SELECT tests.create_user('alice');
SELECT tests.act_as('alice');
INSERT INTO public.integrations (user_id, name, type, config)
VALUES (tests.uid('alice'), 'Hook', 'webhook', '{"url": "https://example.com/h", "secret": "s3cret"}');

SELECT is((SELECT has_secret FROM public.integrations WHERE name = 'Hook'), true, 'has_secret is readable');
SELECT is((SELECT config ? 'secret' FROM public.integrations WHERE name = 'Hook'), false,
  'secret is removed from config (old clients keep working)');
SELECT throws_ok($$SELECT webhook_secret FROM public.integrations$$, '42501', NULL,
  'the secret column cannot be read by the app (S7)');

INSERT INTO public.integrations (user_id, name, type, config)
SELECT tests.uid('alice'), 'H' || g, 'webhook', '{"url": "https://example.com/h"}' FROM generate_series(2, 10) g;
SELECT throws_ok(
  format($$INSERT INTO public.integrations (user_id, name, type, config)
           VALUES (%L, 'Eleventh', 'webhook', '{}')$$, tests.uid('alice')),
  'P0001', NULL, 'at most 10 webhooks per user (S8)');

-- S8 bypass fix: bulk-UPDATE'ing a non-webhook row to type='webhook' must not sidestep the cap.
INSERT INTO public.integrations (user_id, name, type, config)
VALUES (tests.uid('alice'), 'ElevenGeneric', 'generic', '{}');
SELECT throws_ok(
  format($$UPDATE public.integrations SET type = 'webhook' WHERE name = 'ElevenGeneric' AND user_id = %L$$, tests.uid('alice')),
  'P0001', NULL, 'UPDATE that turns a row into a webhook still enforces the cap (S8 bypass fix)');

-- S7: even RETURNING the secret column from an UPDATE the app is allowed to run must be rejected.
SELECT throws_ok(
  format($$UPDATE public.integrations SET updated_at = now() WHERE name = 'Hook' AND user_id = %L RETURNING webhook_secret$$, tests.uid('alice')),
  '42501', NULL, 'UPDATE ... RETURNING webhook_secret is rejected (S7)');

-- S8 bypass fix: moving an existing webhook row onto a user who is already at the cap is rejected.
-- RLS only lets a user touch their own rows, so the reassignment itself runs as the service
-- role (RESET ROLE), same as an admin/back-office operation would.
SELECT tests.create_user('bob');
SELECT tests.act_as('bob');
INSERT INTO public.integrations (user_id, name, type, config)
SELECT tests.uid('bob'), 'B' || g, 'webhook', '{"url": "https://example.com/h"}' FROM generate_series(1, 10) g;

SELECT tests.create_user('carol');
SELECT tests.act_as('carol');
INSERT INTO public.integrations (user_id, name, type, config)
VALUES (tests.uid('carol'), 'CarolHook', 'webhook', '{"url": "https://example.com/h"}');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT throws_ok(
  format($$UPDATE public.integrations SET user_id = %L WHERE name = 'CarolHook'$$, tests.uid('bob')),
  'P0001', NULL, 'reassigning a webhook row to a user already at cap is rejected (S8)');

SELECT * FROM finish();
ROLLBACK;
