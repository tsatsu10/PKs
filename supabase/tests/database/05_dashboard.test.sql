BEGIN;
SELECT plan(6);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
SELECT tests.create_user('carol');
UPDATE public.users SET timezone = 'Asia/Tokyo' WHERE id = tests.uid('alice');
UPDATE public.users SET timezone = 'Not/AZone' WHERE id = tests.uid('bob');
UPDATE public.users SET timezone = NULL WHERE id = tests.uid('carol');

-- S3 fixture: bob shares X with alice; X links to bob's private Y.
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('bob'), 'Shared X'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('bob'), 'Private Y secret title'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('alice'), 'Alice A'),
  ('00000000-0000-0000-0000-000000000004', tests.uid('alice'), 'Alice trashed'),
  ('00000000-0000-0000-0000-000000000005', tests.uid('alice'), 'Alice live');
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'viewer');
INSERT INTO public.link_edges (from_object_id, to_object_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005');
UPDATE public.knowledge_objects SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000000004';

SELECT tests.act_as('alice');
SELECT is(public.user_day_start(),
  date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo',
  'day start uses the user''s timezone (B16)');
SELECT ok(
  NOT (public.get_dashboard_activity()::text LIKE '%secret title%'),
  'activity does not leak titles of objects the caller cannot read (S3)');
SELECT is(
  (public.get_object_links_batch(ARRAY['00000000-0000-0000-0000-000000000003'::uuid])
     -> '00000000-0000-0000-0000-000000000003' ->> 'total')::int,
  1, 'link count ignores trashed neighbours (D6)');
SELECT ok(public.get_dashboard_stats() ? 'pulse', 'stats keeps the pulse key for old clients');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT is(public.user_day_start(), date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  'an invalid timezone falls back to UTC');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('carol');
SELECT is(public.user_day_start(), date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  'a NULL timezone falls back to UTC');

SELECT * FROM finish();
ROLLBACK;
