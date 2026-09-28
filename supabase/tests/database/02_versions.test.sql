BEGIN;
SELECT plan(6);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
SELECT tests.create_user('viewer');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'v1');
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000001', tests.uid('viewer'), 'viewer');

-- B15: an update with no auth.uid() (service role / SQL editor) must succeed.
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'v2' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'service-role update snapshots a version without a user');
SELECT ok(
  (SELECT edited_by IS NULL FROM public.knowledge_object_versions
   WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  'the snapshot records no editor');

SELECT tests.act_as('editor');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions), 1, 'editor can read history');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('viewer');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions), 0, 'viewer cannot read history (S4)');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
SELECT throws_ok(
  format($$INSERT INTO public.knowledge_object_versions (knowledge_object_id, version, title, edited_by)
           VALUES ('00000000-0000-0000-0000-000000000001', 99, 'forged', %L)$$, tests.uid('owner')),
  '42501', NULL, 'nobody can insert version rows directly');

-- D5: deleting a user who edited a shared object must not fail on the FK.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects SET title = 'v3' WHERE id = '00000000-0000-0000-0000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok(format('DELETE FROM auth.users WHERE id = %L', tests.uid('editor')),
  'a user who edited someone else''s object can be deleted');

SELECT * FROM finish();
ROLLBACK;
