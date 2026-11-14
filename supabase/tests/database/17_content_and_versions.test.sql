BEGIN;
SELECT plan(26);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
SELECT tests.create_user('viewer');
-- o1: content sync, o2: coalescing, o3: snapshot RPC, o4: backfill, o5: anti-goal cap.
INSERT INTO public.knowledge_objects (id, user_id, title, content, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Sync', 'md', now()),
  ('00000000-0000-0000-0000-000000000002', tests.uid('owner'), 'Coalesce', 'md', now()),
  ('00000000-0000-0000-0000-000000000003', tests.uid('owner'), 'Snap', 'body', now()),
  ('00000000-0000-0000-0000-000000000004', tests.uid('owner'), 'Backfill', 'old body', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000005', tests.uid('owner'), 'Cap', 'md', now());
UPDATE public.knowledge_objects SET summary = 'theirs summary' WHERE id = '00000000-0000-0000-0000-000000000003';
DELETE FROM public.knowledge_object_versions;
UPDATE public.knowledge_objects SET current_version = 1;
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('viewer'), 'viewer');

-- Content sync ------------------------------------------------------------------------
SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET content = 'x', content_json = '[{"type":"paragraph","content":[{"type":"text","text":"x"}],"children":[]}]'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT isnt((SELECT content_json FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  NULL, 'an update of both content and content_json keeps the JSON');
UPDATE public.knowledge_objects SET content = 'y' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_json FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  NULL, 'a Markdown-only update nulls content_json');

UPDATE public.knowledge_objects SET content = 'z', content_json =
  '[{"type":"paragraph","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world"}],"children":[]},{"type":"heading","content":[{"type":"text","text":"Title"}],"children":[{"type":"paragraph","content":[{"type":"text","text":"Nested"}],"children":[]}]}]'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  E'Hello world\nTitle\nNested', 'content_text is derived from the JSON blocks');

UPDATE public.knowledge_objects SET content = E'# Title\n\n**bold** and [link](http://x)'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  E'Title\n\nbold and link', 'content_text is derived from Markdown when there is no JSON');

-- Coalescing --------------------------------------------------------------------------
UPDATE public.knowledge_objects SET title = 'C1' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE public.knowledge_objects SET title = 'C2' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  1, 'two title edits within 10 minutes make one snapshot');
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  2, 'current_version bumps only with a snapshot');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
UPDATE public.knowledge_object_versions SET created_at = now() - interval '11 minutes'
WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002';
SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET title = 'C3' WHERE id = '00000000-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002'),
  2, 'an edit after 10 minutes makes a second snapshot');
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  3, 'the second snapshot bumps current_version');

-- Anti-goal: six edits an hour (one per backdated window) make at most 6 snapshots.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..6 LOOP
    UPDATE public.knowledge_object_versions SET created_at = created_at - interval '11 minutes'
    WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000005';
    UPDATE public.knowledge_objects SET title = 'Cap ' || i WHERE id = '00000000-0000-0000-0000-000000000005';
    UPDATE public.knowledge_objects SET title = 'Cap ' || i || 'b' WHERE id = '00000000-0000-0000-0000-000000000005';
  END LOOP;
END $$;
SELECT ok((SELECT count(*) FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000005') <= 6,
  'twelve edits over six windows make at most 6 snapshots');
SELECT tests.act_as('owner');

-- Snapshot RPC ------------------------------------------------------------------------
SELECT is(public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003'),
  1, 'owner can snapshot and gets the new version number');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
SELECT is(public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', NULL, 'Kept from a conflict before overwrite'),
  2, 'editor can snapshot');
SELECT is((SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000003'),
  2::bigint, 'the snapshot RPC does not bump revision');
SELECT is(public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003',
            '{"title":"mine","content":"x"}'::jsonb, 'Unsaved edit kept from a conflict'),
  3, 'snapshot with p_fields returns the next version');
SELECT is((SELECT title || '|' || content || '|' || summary FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000003' AND version = 3),
  'mine|x|theirs summary', 'p_fields values are used, missing keys come from the row');
SELECT throws_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', '{"slug":"x"}'::jsonb)$$,
  '22023', NULL, 'an unknown p_fields key is rejected');
SELECT throws_ok(
  format($$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003', %L::jsonb)$$,
         jsonb_build_object('content', repeat('a', 1048577))),
  '22023', NULL, 'content over 1 MB is rejected');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('viewer');
SELECT throws_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'a viewer cannot snapshot');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.snapshot_knowledge_object('00000000-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'anon cannot snapshot');
RESET ROLE;

-- Unchanged rules ---------------------------------------------------------------------
SELECT tests.act_as('owner');
SELECT throws_ok(
  format($$INSERT INTO public.knowledge_object_versions (knowledge_object_id, version, title, edited_by)
           VALUES ('00000000-0000-0000-0000-000000000003', 99, 'forged', %L)$$, tests.uid('owner')),
  '42501', NULL, 'the owner still cannot insert versions directly');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
SELECT throws_ok(
  format($$INSERT INTO public.knowledge_object_versions (knowledge_object_id, version, title, edited_by)
           VALUES ('00000000-0000-0000-0000-000000000003', 99, 'forged', %L)$$, tests.uid('editor')),
  '42501', NULL, 'an editor still cannot insert versions directly');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'E', content = 'E body',
      content_json = '[{"type":"paragraph","content":[{"type":"text","text":"E body"}],"children":[]}]'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'an editor can save title, content and content_json');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
-- o1 is at revision 6 here (insert, four owner edits, one editor edit).
UPDATE public.knowledge_objects SET content = 'old client body'
WHERE id = '00000000-0000-0000-0000-000000000001' AND revision = 6;
SELECT ok((SELECT content = 'old client body' AND revision = 7
           FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'an old client''s Markdown-only update matches on revision and bumps it');

-- Backfill RPC ------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.backfill_object_content_json('00000000-0000-0000-0000-000000000004', 1, '[]'::jsonb)$$,
  '42501', NULL, 'authenticated users cannot run the backfill');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;
SELECT ok(public.backfill_object_content_json('00000000-0000-0000-0000-000000000004', 1,
  '[{"type":"paragraph","content":[{"type":"text","text":"old body"}],"children":[]}]'::jsonb),
  'the backfill updates a row at the read revision');
SELECT ok((SELECT content_json IS NOT NULL AND revision = 1 AND updated_at < now() - interval '23 hours'
           FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000004'),
  'the backfill keeps revision and updated_at');
SELECT is(public.backfill_object_content_json('00000000-0000-0000-0000-000000000002', 1, '[]'::jsonb),
  false, 'a stale revision is skipped');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
