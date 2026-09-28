BEGIN;
SELECT plan(6);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');

INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000101', tests.uid('owner'), 'Trashed A'),
  ('00000000-0000-0000-0000-000000000102', tests.uid('owner'), 'Trashed B');
UPDATE public.knowledge_objects SET is_deleted = true
  WHERE id IN ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102');
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000101', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000102', tests.uid('editor'), 'editor');

INSERT INTO public.tags (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-000000000103', tests.uid('owner'), 'tag-a');
INSERT INTO public.domains (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-000000000104', tests.uid('owner'), 'domain-a');
INSERT INTO public.knowledge_object_tags (knowledge_object_id, tag_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103');
INSERT INTO public.knowledge_object_domains (knowledge_object_id, domain_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000105', tests.uid('editor'), 'Editor Own');
INSERT INTO public.link_edges (from_object_id, to_object_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102');

SELECT tests.act_as('editor');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_tags
  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000101'),
  0, 'shared editor sees 0 tag links of a trashed object');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_domains
  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000101'),
  0, 'shared editor sees 0 domain links of a trashed object');
SELECT is((SELECT count(*)::int FROM public.link_edges
  WHERE from_object_id = '00000000-0000-0000-0000-000000000101'
     OR to_object_id = '00000000-0000-0000-0000-000000000101'),
  0, 'shared editor sees 0 link edges of a trashed object');
SELECT throws_ok(
  $$INSERT INTO public.link_edges (from_object_id, to_object_id)
    VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000105')$$,
  '42501', NULL, 'shared editor cannot insert a link from a trashed object');

SELECT tests.act_as('owner');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_tags
  WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000101'),
  1, 'owner still sees their tag link on a trashed object');
SELECT is((SELECT count(*)::int FROM public.link_edges
  WHERE from_object_id = '00000000-0000-0000-0000-000000000101'),
  1, 'owner still sees their link edge from a trashed object');

SELECT * FROM finish();
ROLLBACK;
