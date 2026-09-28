BEGIN;
SELECT plan(12);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');

-- Users never touch counters: a caller-chosen window let them wipe their own daily buckets.
SELECT tests.act_as('alice');
SELECT throws_ok(
  format('SELECT public.consume_usage(%L::uuid, %L, 1, 1)', tests.uid('alice'), 'server_key'),
  '42501', NULL, 'authenticated cannot execute consume_usage');
SELECT throws_ok($$SELECT public.consume_global_usage('g', 1, 86400)$$, '42501', NULL,
  'users cannot touch the global counter');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is(to_regprocedure('public.consume_usage(text, integer, integer)'), NULL,
  'the caller-scoped 3-argument consume_usage is gone');

-- The service role counts per user, with explicit user ids.
SET LOCAL ROLE service_role;
SELECT is((public.consume_usage(current_setting('tests.alice')::uuid, 't', 2, 86400) ->> 'limited')::boolean, false, 'first call allowed');
SELECT is((public.consume_usage(current_setting('tests.alice')::uuid, 't', 2, 86400) ->> 'limited')::boolean, false, 'second call allowed');
SELECT is((public.consume_usage(current_setting('tests.alice')::uuid, 't', 2, 86400) ->> 'limited')::boolean, true, 'third call over the limit');
SELECT is((public.consume_usage(current_setting('tests.bob')::uuid, 't', 2, 86400) ->> 'count')::int, 1, 'counters are per user');
SELECT is((public.consume_usage(current_setting('tests.alice')::uuid, 't', 2, 86400) ->> 'count')::int, 4,
  'bob''s calls do not reset or share alice''s counter');
SELECT throws_ok($$SELECT public.consume_usage(NULL, 't', 2, 86400)$$, '22023', NULL,
  'a null user id is rejected');
SELECT throws_ok(format('SELECT public.consume_usage(%L::uuid, %L, 2, 0)', current_setting('tests.alice'), 't'),
  '22023', NULL, 'a window under one second is rejected');

SELECT is((public.consume_global_usage('g', 5, 86400) ->> 'count')::int, 1, 'service role can count globally');
SELECT is((public.consume_global_usage('g', 5, 86400) ->> 'count')::int, 2, 'the global counter accumulates');

SELECT * FROM finish();
ROLLBACK;
