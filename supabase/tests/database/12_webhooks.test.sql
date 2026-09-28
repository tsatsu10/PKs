BEGIN;
SELECT plan(4);

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

SELECT * FROM finish();
ROLLBACK;
