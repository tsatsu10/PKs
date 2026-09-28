BEGIN;
SELECT plan(5);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Source');
INSERT INTO public.prompt_runs (id, user_id, knowledge_object_id, status, output, provider, model)
VALUES ('00000000-0000-0000-0000-0000000000e1', tests.uid('alice'),
        '00000000-0000-0000-0000-000000000001', 'completed', 'Answer', 'anthropic', 'claude-sonnet-5');

SELECT tests.act_as('alice');
SELECT set_config('tests.new_obj',
  public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'Summary', 'Edited answer')::text, true);
SELECT is((SELECT content FROM public.knowledge_objects WHERE id = current_setting('tests.new_obj')::uuid),
  'Edited answer', 'creates an object with the (edited) output');
SELECT is((SELECT count(*)::int FROM public.link_edges
           WHERE from_object_id = '00000000-0000-0000-0000-000000000001'
             AND to_object_id = current_setting('tests.new_obj')::uuid), 1, 'links it from the source object');
SELECT is(public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'Summary', 'Edited answer')::text,
  current_setting('tests.new_obj'), 'a second call returns the same object (no duplicates)');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects WHERE type = 'prompt'), 1, 'exactly one object created');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT throws_ok($$SELECT public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'x', 'y')$$,
  '42501', NULL, 'cannot save someone else''s run');

SELECT * FROM finish();
ROLLBACK;
