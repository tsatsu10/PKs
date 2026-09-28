BEGIN;
SELECT plan(11);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Live'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('owner'), 'Trashed');
UPDATE public.knowledge_objects SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('editor'), 'editor');

SELECT tests.act_as('editor');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'Edited', content = 'Body', summary = 'S', source = 'x'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'editor can change content fields');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot change status');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET cover_url = 'https://evil.example/px' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot set cover_url (tracking pixel, S6)');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET created_at = now() - interval '9 years' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot rewrite created_at');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET title = 'Live 2', slug = 'live-2-00000000' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot change slug');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'Live 2', content = 'Body 2' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'editor can change title+content without slug');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  0, 'shared user cannot read a trashed object (S9)');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  0, 'editor sees 0 versions of a trashed shared object (S9)');
UPDATE public.knowledge_objects SET title = 'x' WHERE id = '00000000-0000-0000-0000-000000000002';
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT title FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  'Trashed', 'shared user cannot edit a trashed object');

SELECT tests.act_as('owner');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET status = 'archived', cover_url = NULL WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can change owner-only fields');
SELECT ok(public.can_edit_object('00000000-0000-0000-0000-000000000001'), 'can_edit_object true for owner');

SELECT * FROM finish();
ROLLBACK;
