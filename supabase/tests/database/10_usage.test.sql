BEGIN;
SELECT plan(6);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');

SELECT tests.act_as('alice');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, false, 'first call allowed');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, false, 'second call allowed');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, true, 'third call over the limit');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'count')::int, 1, 'counters are per user');
SELECT throws_ok($$SELECT public.consume_global_usage('g', 1, 86400)$$, '42501', NULL,
  'users cannot touch the global counter');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;
SELECT is((public.consume_global_usage('g', 5, 86400) ->> 'count')::int, 1, 'service role can count globally');

SELECT * FROM finish();
ROLLBACK;
