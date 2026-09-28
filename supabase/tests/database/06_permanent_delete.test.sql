BEGIN;
SELECT plan(6);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Trashed'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('alice'), 'Live'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('bob'), 'Bob trashed');
UPDATE public.knowledge_objects SET is_deleted = true
WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
INSERT INTO public.files (id, user_id, filename, storage_key) VALUES
  ('00000000-0000-0000-0000-0000000000f1', tests.uid('alice'), 'only.pdf', 'k/only.pdf'),
  ('00000000-0000-0000-0000-0000000000f2', tests.uid('alice'), 'shared.pdf', 'k/shared.pdf');
INSERT INTO public.knowledge_object_files VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f2');

SELECT tests.act_as('alice');
SELECT throws_ok($$SELECT public.delete_object_permanently('00000000-0000-0000-0000-000000000002')$$,
  '42501', NULL, 'cannot permanently delete an object that is not in Trash');
SELECT throws_ok($$SELECT public.delete_object_permanently('00000000-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'cannot permanently delete someone else''s object');
SELECT is(
  public.delete_object_permanently('00000000-0000-0000-0000-000000000001'),
  '[{"id": "00000000-0000-0000-0000-0000000000f1", "filename": "only.pdf", "storage_key": "k/only.pdf"}]'::jsonb,
  'returns only files that are now orphaned');
SELECT is((SELECT count(*)::int FROM public.files WHERE id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'orphaned file row deleted');
SELECT is((SELECT count(*)::int FROM public.files WHERE id = '00000000-0000-0000-0000-0000000000f2'), 1,
  'file still attached elsewhere is kept');

SELECT lives_ok($$UPDATE public.files SET storage_key = 'k/new' WHERE id = '00000000-0000-0000-0000-0000000000f2'$$,
  'owner can record a storage key');

SELECT * FROM finish();
ROLLBACK;
