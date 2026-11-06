BEGIN;
SELECT plan(12);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
SELECT tests.create_user('carol');

SELECT ok(NOT has_function_privilege('anon',
  'public.report_client_error(text,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot report');
SELECT ok(has_function_privilege('authenticated',
  'public.report_client_error(text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated can report');
SELECT throws_ok(
  $$SELECT public.report_client_error('server', 'm', NULL, '/', 'v', 'ua', 'fp')$$,
  '42501', NULL, 'signed-out callers are rejected');

SELECT tests.act_as('alice');
SELECT ok(public.report_client_error('server', repeat('m', 600), repeat('s', 5000), '/objects/1',
  'abc123', repeat('u', 300), 'fp-1'), 'alice can report');
SELECT ok(NOT public.report_client_error('network', 'x', NULL, '/', 'v', 'ua', 'fp-n'),
  'expected kinds are dropped');
SELECT throws_ok($$SELECT count(*) FROM public.client_errors$$, '42501', NULL,
  'users cannot read client_errors');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

SELECT results_eq(
  $$SELECT length(message), length(stack), length(user_agent) FROM public.client_errors$$,
  $$VALUES (500, 4096, 200)$$, 'fields are truncated');
SELECT is((SELECT user_id FROM public.client_errors LIMIT 1), tests.uid('alice'), 'user_id comes from the JWT');

SELECT tests.act_as('alice');
SELECT is((SELECT count(*)::int FROM generate_series(1, 29) g
           WHERE public.report_client_error('server', 'm' || g, NULL, '/', 'v', 'ua', 'fp' || g)),
  29, '29 more reports in the hour are accepted');
SELECT ok(NOT public.report_client_error('server', 'over', NULL, '/', 'v', 'ua', 'fp-x'),
  'the 31st report in an hour is dropped');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- Carol fills the global budget; bob has no reports of his own, so only the global cap can stop him.
INSERT INTO public.client_errors (user_id, kind, message, fingerprint)
SELECT tests.uid('carol'), 'server', 'bulk', 'fp' FROM generate_series(1, 5000);
SELECT tests.act_as('bob');
SELECT ok(NOT public.report_client_error('server', 'x', NULL, '/', 'v', 'ua', 'fp-b'),
  'the global daily cap drops reports');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

DELETE FROM public.client_errors;
INSERT INTO public.client_errors (user_id, kind, message, fingerprint, created_at)
VALUES (tests.uid('alice'), 'server', 'old', 'fp-old', now() - interval '31 days');
SELECT tests.act_as('bob');
SELECT public.report_client_error('server', 'fresh', NULL, '/', 'v', 'ua', 'fp-fresh');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.client_errors WHERE message = 'old'), 0,
  'rows older than 30 days are purged');

SELECT * FROM finish();
ROLLBACK;
