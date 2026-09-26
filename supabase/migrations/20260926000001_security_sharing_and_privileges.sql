-- Security: repair sharing RLS, close email-lookup holes, and lock down function execute grants.
--
-- 1. knowledge_objects SELECT/UPDATE policies compared sp.knowledge_object_id = id, where the
--    unqualified id bound to share_permissions.id, so shared users never matched.
-- 2. The UPDATE policy had no WITH CHECK and nothing stopped a user_id change, so once (1) is
--    fixed a shared editor could take ownership. A trigger now pins user_id and restricts
--    owner-only columns.
-- 3. The original resolve_user_id_by_email(text) overload was never dropped and has no auth check.
-- 4. public.users.email was user-editable and non-unique, so a user could claim someone else's
--    email and receive shares meant for them. Email now always mirrors auth.users.
-- 5. SECURITY DEFINER functions are no longer executable by anon / PUBLIC.

-- ---------------------------------------------------------------------------
-- 1 + 2. knowledge_objects policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can read own knowledge_objects"
  ON public.knowledge_objects FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can update own knowledge_objects"
  ON public.knowledge_objects FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = auth.uid()
        AND sp.role = 'editor'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = auth.uid()
        AND sp.role = 'editor'
    )
  );

-- Ownership is immutable from a user session; shared editors may edit content but not
-- delete/restore or pin the owner's object. Sessions without auth.uid() (service role,
-- SQL editor, migrations) are unrestricted.
CREATE OR REPLACE FUNCTION public.guard_knowledge_object_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing the owner of an object is not allowed'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id <> auth.uid() AND (
       NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
    OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
  ) THEN
    RAISE EXCEPTION 'Only the owner can delete, restore, or pin this object'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_objects_guard ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_guard
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_object_update();

-- Version history for shared users: check the share directly instead of joining through
-- knowledge_objects (which previously inherited the broken policy).
DROP POLICY IF EXISTS "Users can read versions of own objects" ON public.knowledge_object_versions;
CREATE POLICY "Users can read versions of own objects"
  ON public.knowledge_object_versions FOR SELECT
  USING (
    public.owns_knowledge_object(knowledge_object_versions.knowledge_object_id)
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id
        AND sp.shared_with_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Drop the unauthenticated resolver overload; resolve against auth.users
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_user_id_by_email(text);

CREATE OR REPLACE FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id
  FROM auth.users au
  WHERE lower(au.email) = lower(trim(target_email))
    AND p_knowledge_object_id IS NOT NULL
    AND public.owns_knowledge_object(p_knowledge_object_id)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_user_id_by_email(text, uuid) IS
  'Resolves an auth email to a user id only when the caller owns the given knowledge_object_id (share-by-email).';

-- ---------------------------------------------------------------------------
-- 4. public.users.email mirrors auth.users.email and cannot be edited by the user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.users_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := (SELECT au.email FROM auth.users au WHERE au.id = NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_email_from_auth ON public.users;
CREATE TRIGGER trg_users_email_from_auth
  BEFORE INSERT OR UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_email_from_auth();

CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- Repair any rows that were already edited.
UPDATE public.users u
SET email = au.email
FROM auth.users au
WHERE au.id = u.id AND u.email IS DISTINCT FROM au.email;

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions: no execute for anon / PUBLIC
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Trigger functions are invoked by the trigger machinery, not by callers.
REVOKE EXECUTE ON FUNCTION public.users_email_from_auth() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_email_from_auth() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_knowledge_object_version() FROM authenticated;
