BEGIN;
SELECT plan(3);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Alice private');

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id IN (tests.uid('alice'), tests.uid('bob'))),
  2, 'handle_new_user created profile rows');

SELECT tests.act_as('bob');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects), 0, 'bob cannot see alice''s object');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('alice');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects), 1, 'alice sees her object');

SELECT * FROM finish();
ROLLBACK;
