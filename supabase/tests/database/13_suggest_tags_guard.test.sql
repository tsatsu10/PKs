BEGIN;
SELECT plan(5);

SELECT tests.create_user('owner');
SELECT tests.create_user('stranger');

INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000131', tests.uid('owner'), 'Object A'),
  ('00000000-0000-0000-0000-000000000132', tests.uid('owner'), 'Object B');
INSERT INTO public.domains (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-000000000133', tests.uid('owner'), 'domain-a');
INSERT INTO public.tags (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-000000000134', tests.uid('owner'), 'tag-b');
INSERT INTO public.knowledge_object_domains (knowledge_object_id, domain_id) VALUES
  ('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0000-000000000133'),
  ('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0000-000000000133');
INSERT INTO public.knowledge_object_tags (knowledge_object_id, tag_id) VALUES
  ('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0000-000000000134');

-- The guard has no visible effect on results today, so check that it is in place.
SELECT ok(pg_get_functiondef('public.suggest_tags_for_object(uuid)'::regprocedure) LIKE '%caller_can_read%',
  'suggest_tags_for_object checks that the caller can read the object');
SELECT ok(pg_get_functiondef('public.suggest_tags_for_object_fallback(uuid)'::regprocedure) LIKE '%caller_can_read%',
  'suggest_tags_for_object_fallback checks that the caller can read the object');

SELECT tests.act_as('owner');
SELECT is((SELECT array_agg(tag_name) FROM public.suggest_tags_for_object('00000000-0000-0000-0000-000000000131')),
  ARRAY['tag-b'], 'owner gets tags from objects in the same domain');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('stranger');
SELECT is((SELECT count(*)::int FROM public.suggest_tags_for_object('00000000-0000-0000-0000-000000000131')),
  0, 'stranger gets no suggestions for an object they cannot read');
SELECT is((SELECT count(*)::int FROM public.suggest_tags_for_object_fallback('00000000-0000-0000-0000-000000000131')),
  0, 'stranger with no tags of their own gets no fallback suggestions');

SELECT * FROM finish();
ROLLBACK;
