BEGIN;
SELECT plan(15);

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

-- Regression test for the merge (the only step that deletes data): recreate case-duplicates,
-- which the unique indexes forbid, then merge them. ROLLBACK restores the dropped indexes.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
DROP INDEX public.tags_user_lower_name_key;
DROP INDEX public.domains_user_lower_name_key;
SELECT tests.create_user('bob');
SELECT tests.create_user('carol');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-0000000000a1', tests.uid('bob'), 'two variants, no keeper'),
  ('00000000-0000-0000-0000-0000000000a2', tests.uid('bob'), 'keeper only'),
  ('00000000-0000-0000-0000-0000000000a3', tests.uid('bob'), 'keeper and a variant'),
  ('00000000-0000-0000-0000-0000000000a4', tests.uid('carol'), 'other user');
INSERT INTO public.tags (id, user_id, name, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', tests.uid('bob'), 'AI', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000b2', tests.uid('bob'), 'ai', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000b3', tests.uid('bob'), 'Ai', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000b4', tests.uid('carol'), 'ai', now() - interval '1 day');
INSERT INTO public.domains (id, user_id, name, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000c1', tests.uid('bob'), 'Work', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c2', tests.uid('bob'), 'work', now() - interval '1 day');
INSERT INTO public.knowledge_object_tags (knowledge_object_id, tag_id) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b4');
INSERT INTO public.knowledge_object_domains (knowledge_object_id, domain_id) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c2');
CREATE TEMP TABLE taxonomy_before AS
  SELECT j.knowledge_object_id, 'tag' AS kind, lower(t.name) AS lname
  FROM public.knowledge_object_tags j JOIN public.tags t ON t.id = j.tag_id
  UNION
  SELECT j.knowledge_object_id, 'domain', lower(d.name)
  FROM public.knowledge_object_domains j JOIN public.domains d ON d.id = j.domain_id;

SELECT lives_ok($$ SELECT public.merge_case_duplicate_taxonomy() $$, 'merge runs on multi-variant duplicates');
SELECT is(
  (SELECT count(*)::int FROM taxonomy_before b
   WHERE NOT EXISTS (SELECT 1 FROM public.knowledge_object_tags j JOIN public.tags t ON t.id = j.tag_id
                     WHERE b.kind = 'tag' AND j.knowledge_object_id = b.knowledge_object_id AND lower(t.name) = b.lname)
     AND NOT EXISTS (SELECT 1 FROM public.knowledge_object_domains j JOIN public.domains d ON d.id = j.domain_id
                     WHERE b.kind = 'domain' AND j.knowledge_object_id = b.knowledge_object_id AND lower(d.name) = b.lname)),
  0, 'no object loses a tag or domain in the merge');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.tags GROUP BY user_id, lower(name) HAVING count(*) > 1)
  AND NOT EXISTS (SELECT 1 FROM public.domains GROUP BY user_id, lower(name) HAVING count(*) > 1),
  'exactly one tag/domain row per (user, lower(name)) remains');
SELECT results_eq(
  $$ SELECT id, name FROM public.tags WHERE user_id = tests.uid('bob') $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000000b1'::uuid, 'AI'::text) $$,
  'the oldest variant ("AI") is the one kept');
SELECT results_eq(
  $$ SELECT id, name FROM public.domains WHERE user_id = tests.uid('bob') $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000000c1'::uuid, 'Work'::text) $$,
  'the oldest domain variant ("Work") is the one kept');
SELECT results_eq(
  $$ SELECT knowledge_object_id, tag_id FROM public.knowledge_object_tags
     WHERE knowledge_object_id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3')
     ORDER BY 1 $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid),
            ('00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'objects carrying variants now link to the keeper exactly once');
SELECT results_eq(
  $$ SELECT t.id, t.name, j.knowledge_object_id FROM public.tags t
     JOIN public.knowledge_object_tags j ON j.tag_id = t.id WHERE t.user_id = tests.uid('carol') $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000000b4'::uuid, 'ai'::text, '00000000-0000-0000-0000-0000000000a4'::uuid) $$,
  'another user''s same-named tag is untouched');

SELECT * FROM finish();
ROLLBACK;
