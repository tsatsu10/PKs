BEGIN;
SELECT plan(9);

SELECT tests.create_user('alice');
SELECT tests.act_as('alice');
SELECT is(
  (public.create_tag('AI') ->> 'id'),
  (public.create_tag('ai') ->> 'id'),
  'tags are unique case-insensitively');
SELECT is((public.create_domain('Work') ->> 'name'), 'Work', 'domain keeps its original casing');
SELECT is((public.create_domain('WORK') ->> 'name'), 'Work', 'a case-variant returns the existing domain');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
     AND NOT (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select auth\.uid\(\)'),
  0, 'no policy calls bare auth.uid() per row');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_knowledge_objects_type'),
  'redundant type index dropped');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_link_edges_from'),
  'unique-prefix index dropped');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_ko_user_updated_live'),
  'per-user recency index added');
SELECT ok(
  (SELECT 'search_path=public' = ANY(proconfig) FROM pg_proc WHERE proname = 'set_updated_at'),
  'set_updated_at pins search_path');

-- Duplicates created before the unique index are merged without losing tags on objects.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.tags GROUP BY user_id, lower(name) HAVING count(*) > 1),
  'no case-duplicate tags remain');

SELECT * FROM finish();
ROLLBACK;
