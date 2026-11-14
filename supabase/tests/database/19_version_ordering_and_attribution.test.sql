BEGIN;
SELECT plan(7);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
-- o1: current_version is server-owned, o2: attribution after a Save version.
INSERT INTO public.knowledge_objects (id, user_id, title, content, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Pinned', 'md', now()),
  ('00000000-0000-0000-0000-000000000002', tests.uid('owner'), 'Attr', 'saved', now());
DELETE FROM public.knowledge_object_versions;
UPDATE public.knowledge_objects SET current_version = 1;
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('editor'), 'editor');

-- 1: current_version ---------------------------------------------------------------------
SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET current_version = 999 WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  1, 'the owner cannot set current_version');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects SET current_version = 999, content = 'e'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  2, 'an editor''s current_version is ignored; the version trigger sets it');
SELECT is((SELECT version FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  1, 'the snapshot gets the server''s version number');
SELECT is(public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000001'),
  2, 'snapshot_knowledge_object still bumps current_version');
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  3, 'the snapshot bump sticks');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- 2: an edit skipped as identical never lets another user's window swallow it --------------
SELECT tests.act_as('owner');
SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000002');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects SET content = 'editor work' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  2, 'another user''s edit snapshots even when the content matches the latest version');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET content = 'owner overwrite' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT ok(EXISTS (SELECT 1 FROM public.knowledge_object_versions
                  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'
                    AND content = 'editor work'),
  'the editor''s work survives the owner''s next edit inside the owner''s window');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
