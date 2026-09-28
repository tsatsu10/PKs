BEGIN;
SELECT plan(3);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Alice'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('bob'), 'Bob');
INSERT INTO public.prompt_templates (id, user_id, name, prompt_text)
VALUES ('00000000-0000-0000-0000-0000000000a1', tests.uid('alice'), 'T', 'Summarize');
INSERT INTO public.prompt_runs (user_id, prompt_template_id, knowledge_object_id, status, output)
VALUES (tests.uid('alice'), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'completed', 'out');

SELECT tests.act_as('alice');
DELETE FROM public.prompt_templates WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT is((SELECT count(*)::int FROM public.prompt_runs WHERE prompt_template_id IS NULL), 1,
  'deleting a template keeps its runs (D3)');
SELECT throws_ok(
  format($$INSERT INTO public.prompt_runs (user_id, knowledge_object_id, status)
           VALUES (%L, '00000000-0000-0000-0000-000000000002', 'completed')$$, tests.uid('alice')),
  '42501', NULL, 'cannot record a run against an object you cannot read (S13)');
SELECT lives_ok(
  format($$INSERT INTO public.prompt_runs (user_id, knowledge_object_id, status)
           VALUES (%L, '00000000-0000-0000-0000-000000000001', 'completed')$$, tests.uid('alice')),
  'can record a run against your own object');

SELECT * FROM finish();
ROLLBACK;
