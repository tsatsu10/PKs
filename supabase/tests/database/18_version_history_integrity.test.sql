BEGIN;
SELECT plan(14);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
-- o1: content_json-only edit, o2: cross-user coalescing, o3: snapshot reasons, o4: backfill.
INSERT INTO public.knowledge_objects (id, user_id, title, content, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Json', 'md', now()),
  ('00000000-0000-0000-0000-000000000002', tests.uid('owner'), 'Cross', 'v0', now()),
  ('00000000-0000-0000-0000-000000000003', tests.uid('owner'), 'Reasons', 'body', now()),
  ('00000000-0000-0000-0000-000000000004', tests.uid('owner'), 'Backfill', 'old body', now());
DELETE FROM public.knowledge_object_versions;
UPDATE public.knowledge_objects SET current_version = 1;
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('editor'), 'editor');

-- 1: content_json-only change -----------------------------------------------------------
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects
SET content_json = '[{"type":"paragraph","content":[{"type":"text","text":"swapped"}],"children":[]}]'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  1, 'a content_json-only edit makes a snapshot');
SELECT is((SELECT content FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  'md', 'the snapshot holds the state before the edit');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- 2: coalescing is per user -------------------------------------------------------------
SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET content = 'owner 1' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE public.knowledge_objects SET content = 'owner 2' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  1, 'the same user''s edits within 10 minutes still coalesce');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects SET content = 'editor wipe' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  2, 'another user''s edit inside the window snapshots first');
SELECT ok(EXISTS (SELECT 1 FROM public.knowledge_object_versions
                  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'
                    AND content = 'owner 2'),
  'the overwritten user''s work is kept in history');
UPDATE public.knowledge_objects SET content = 'editor 2' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  2, 'the new user''s own follow-up edits coalesce');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- Save version, then edit: no duplicate snapshot of identical content.
SELECT tests.act_as('owner');
SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003');
UPDATE public.knowledge_objects SET content = 'after save' WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000003'),
  1, 'an edit right after Save version does not duplicate the saved state');
UPDATE public.knowledge_objects SET content = 'after save 2' WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000003'),
  1, 'Save version opens a window for the same user, like an automatic snapshot');

-- 3: snapshot reasons -------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', NULL, 'Restored by owner')$$,
  '22023', NULL, 'a free-text reason is rejected');
SELECT lives_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', NULL, 'Before restoring v2')$$,
  'the restore reason is accepted');
SELECT throws_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', '{"content":"forged"}'::jsonb)$$,
  '22023', NULL, 'p_fields without the conflict reason is rejected');
SELECT lives_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003',
      '{"content":"mine"}'::jsonb, 'Unsaved edit kept from a conflict')$$,
  'p_fields with the conflict reason is accepted');
UPDATE public.knowledge_objects SET content = 'overwrite theirs' WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000003'),
  4, 'an edit after a kept conflict copy still snapshots the row it replaces');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- 4: the backfill does not snapshot -----------------------------------------------------
SET LOCAL ROLE service_role;
SELECT public.backfill_object_content_json('00000000-0000-0000-0000-000000000004',
  (SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000004'),
  '[{"type":"paragraph","content":[{"type":"text","text":"old body"}],"children":[]}]'::jsonb);
RESET ROLE;
SELECT ok((SELECT content_json IS NOT NULL AND current_version = 1
           FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000004')
          AND NOT EXISTS (SELECT 1 FROM public.knowledge_object_versions
                          WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000004'),
  'the backfill fills content_json without a snapshot');

SELECT * FROM finish();
ROLLBACK;
