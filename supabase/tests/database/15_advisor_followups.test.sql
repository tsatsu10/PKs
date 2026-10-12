BEGIN;
SELECT plan(4);

SELECT ok(NOT has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
  'authenticated cannot execute rls_auto_enable');
SELECT ok(NOT has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'),
  'anon cannot execute rls_auto_enable');
SELECT has_index('public', 'prompt_runs', 'idx_prompt_runs_saved_object',
  'prompt_runs.saved_object_id is indexed');
SELECT has_index('public', 'share_invites', 'idx_share_invites_invited_by',
  'share_invites.invited_by is indexed');

SELECT * FROM finish();
ROLLBACK;
