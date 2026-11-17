-- Roadmap Phase 0a exit criterion: at most 6 snapshots per hour of continuous editing.
-- Simulates one hour of typing at the client's fastest save cadence (a save at least every
-- MAX_WAIT_MS = 5 s while typing): 720 saves by the owner, with the clock moved forward 5 s
-- between saves by backdating the version rows (now() is fixed inside a transaction).
BEGIN;
SELECT plan(3);

SELECT tests.create_user('owner');
INSERT INTO public.knowledge_objects (id, user_id, title, content, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Rate', 'start', now());
DELETE FROM public.knowledge_object_versions;

CREATE TEMP TABLE hour_of_typing AS SELECT 0 AS saves;
GRANT ALL ON hour_of_typing TO authenticated;

DO $$
DECLARE i int;
BEGIN
  FOR i IN 0..719 LOOP
    -- 5 s pass: every snapshot so far gets 5 s older.
    UPDATE public.knowledge_object_versions SET created_at = created_at - interval '5 seconds'
    WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001';
    PERFORM tests.act_as('owner');
    UPDATE public.knowledge_objects SET content = 'typed ' || i, content_json = NULL
    WHERE id = '00000000-0000-0000-0000-000000000001';
    UPDATE hour_of_typing SET saves = saves + 1;
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;
END $$;

SELECT is((SELECT saves FROM hour_of_typing), 720, 'an hour of saves every 5 s ran');
SELECT cmp_ok((SELECT count(*)::int FROM public.knowledge_object_versions
               WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  '<=', 6, 'an hour of continuous editing makes at most 6 snapshots');
SELECT is((SELECT count(DISTINCT edited_by)::int FROM public.knowledge_object_versions
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'
             AND edited_by = tests.uid('owner')),
  1, 'the snapshots are the owner''s (the edits really ran as the owner)');

SELECT diag('snapshots in the simulated hour: ' || (SELECT count(*) FROM public.knowledge_object_versions
  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'));
SELECT * FROM finish();
ROLLBACK;
