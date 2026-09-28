BEGIN;
SELECT plan(20);

SELECT tests.create_user('owner');
SELECT tests.create_user('known');
SELECT tests.create_user('unconfirmed', false);
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Doc');

SELECT tests.act_as('owner');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'KNOWN@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'sharing with a confirmed user returns ok');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'nobody@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'same response for an unknown email (no enumeration)');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'unconfirmed@test.local', 'editor'),
  '{"status": "ok"}'::jsonb, 'same response for an unconfirmed email');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('known')), 1, 'confirmed user got access immediately');
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 0, 'unconfirmed user got no access (S1)');

UPDATE auth.users SET email_confirmed_at = now() WHERE id = tests.uid('unconfirmed');
SELECT is((SELECT role::text FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 'editor', 'invite converts on confirmation');

-- (a) Signup path: the invite is sent while the recipient email has no account yet; the
-- account is then created already confirmed and picks up access via the insert trigger.
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'newbie@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.create_user('newbie');  -- signs up (already confirmed) after being invited
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('newbie')), 1, 'signing up confirmed after an invite grants access');

-- (b) Revoke removes the invite too, so a later re-confirmation can't re-grant it.
SELECT tests.create_user('revocable');
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'revocable@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
DELETE FROM public.share_permissions
WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001' AND shared_with_user_id = tests.uid('revocable');
SELECT is((SELECT count(*)::int FROM public.share_invites
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001' AND email = 'revocable@test.local'),
  0, 'revoking a share also deletes its invite');
UPDATE auth.users SET email_confirmed_at = NULL WHERE id = tests.uid('revocable');
UPDATE auth.users SET email_confirmed_at = now() WHERE id = tests.uid('revocable');
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('revocable')), 0, 're-confirming after revoke does not re-grant access');

-- (c) Cascades: deleting the recipient user, and deleting the object, both succeed cleanly.
SELECT tests.create_user('to_delete');
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'to_delete@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok(
  $$DELETE FROM auth.users WHERE id = tests.uid('to_delete')$$,
  'deleting a recipient user cascades cleanly');

INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000003', tests.uid('owner'), 'Temp');
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000003', 'someone@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok(
  $$DELETE FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000003'$$,
  'deleting the object cascades cleanly');

-- (d) Rate limit: 30 shares/hour succeed, the 31st is rejected, and deleting invites
-- (which an owner can do) does not reset the append-only log.
SELECT tests.create_user('owner2');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000002', tests.uid('owner2'), 'Doc2');
SELECT tests.act_as('owner2');
SELECT lives_ok(
  $$DO $body$
    DECLARE i int;
    BEGIN
      FOR i IN 1..30 LOOP
        PERFORM public.share_object_by_email('00000000-0000-0000-0000-000000000002', 'rl' || i || '@test.local', 'viewer');
      END LOOP;
    END
  $body$;$$,
  '30 shares within the hour all succeed');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000002', 'rl31@test.local', 'viewer')$$,
  'P0001', NULL, '31st share within the hour is rate-limited');
DELETE FROM public.share_invites WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000002', 'rl32@test.local', 'viewer')$$,
  'P0001', NULL, 'deleting invites does not reset the rate limit');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- (e) Self-share is rejected.
SELECT tests.act_as('owner');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'owner@test.local', 'viewer')$$,
  '22023', NULL, 'self-share is rejected');

-- (f) Re-sharing with a different role updates share_permissions.role.
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'known@test.local', 'editor');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT role::text FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('known')), 'editor', 're-sharing updates the role');

-- (g) Privacy: a non-owner sees no share_invites rows for the object (S5).
SELECT tests.act_as('known');
SELECT is((SELECT count(*)::int FROM public.share_invites
           WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'), 0,
  'non-owner cannot see share_invites (S5)');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- (h) anon has no EXECUTE on share_object_by_email.
SELECT is(has_function_privilege('anon', 'public.share_object_by_email(uuid, text, share_role)', 'EXECUTE'),
  false, 'anon cannot execute share_object_by_email');

SELECT tests.act_as('known');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'x@test.local', 'viewer')$$,
  '42501', NULL, 'only the owner can share');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'not-an-email', 'viewer')$$,
  '22023', NULL, 'invalid email is rejected');

SELECT * FROM finish();
ROLLBACK;
