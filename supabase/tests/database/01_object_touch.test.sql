BEGIN;
SELECT plan(7);

SELECT tests.create_user('alice');
INSERT INTO public.knowledge_objects (id, user_id, title, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Note', now() - interval '1 day');
SELECT tests.act_as('alice');

SELECT has_column('public', 'knowledge_objects', 'revision', 'revision column exists');

SELECT public.touch_object_view('00000000-0000-0000-0000-000000000001');
SELECT ok(
  (SELECT updated_at < now() - interval '23 hours' AND revision = 1
   FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'viewing does not change updated_at or revision');

UPDATE public.knowledge_objects SET is_pinned = true WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  1::bigint, 'pinning does not change revision');

UPDATE public.knowledge_objects SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT revision = 2 AND updated_at > now() - interval '1 minute'
   FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'a metadata edit bumps revision and updated_at');
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  1, 'a metadata edit does not create a version snapshot');

UPDATE public.knowledge_objects SET title = 'Renamed' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  3::bigint, 'a text edit bumps revision');

-- Old clients still guard on current_version: that path must keep working.
UPDATE public.knowledge_objects SET summary = 's'
WHERE id = '00000000-0000-0000-0000-000000000001' AND current_version = 2;
SELECT is((SELECT summary FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  's', 'current_version guard still works for old clients');

SELECT * FROM finish();
ROLLBACK;
