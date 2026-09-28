-- Read/edit helpers for policies on related tables. SECURITY DEFINER so they can read
-- knowledge_objects/share_permissions without recursing through RLS.
CREATE OR REPLACE FUNCTION public.can_read_object(obj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id
      AND (
        ko.user_id = auth.uid()
        OR (NOT ko.is_deleted AND EXISTS (
          SELECT 1 FROM public.share_permissions sp
          WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_object(obj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id
      AND (
        ko.user_id = auth.uid()
        OR (NOT ko.is_deleted AND EXISTS (
          SELECT 1 FROM public.share_permissions sp
          WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
            AND sp.role = 'editor'
        ))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_object(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_object(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_object(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_object(uuid) TO authenticated, service_role;

-- S9: shared users never see or edit trashed objects.
DROP POLICY IF EXISTS "Users can read own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can read own knowledge_objects"
  ON public.knowledge_objects FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Users can update own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can update own knowledge_objects"
  ON public.knowledge_objects FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    ))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    ))
  );

-- S10/S6: shared editors may change content fields only. Sessions without auth.uid()
-- (service role, SQL editor, migrations) are unrestricted.
CREATE OR REPLACE FUNCTION public.guard_knowledge_object_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Keep in sync with the editor UI. Phase 0a adds content_json here.
  editor_writable text[] := ARRAY['title', 'content', 'summary', 'source', 'key_points',
                                  'content_json', 'updated_at', 'revision', 'current_version', 'fts'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing the owner of an object is not allowed' USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id <> auth.uid()
     AND (to_jsonb(NEW) - editor_writable) IS DISTINCT FROM (to_jsonb(OLD) - editor_writable) THEN
    RAISE EXCEPTION 'Only the owner can change this field'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- S9 (fix round 1): editors must lose access to a trashed object's version history too.
-- The prior "Owners and editors can read versions" policy (20260927000002) let an editor
-- keep reading history after the object was trashed.
DROP POLICY IF EXISTS "Owners and editors can read versions" ON public.knowledge_object_versions;
CREATE POLICY "Owners and editors can read versions"
  ON public.knowledge_object_versions FOR SELECT
  TO authenticated
  USING (
    public.owns_knowledge_object(knowledge_object_id)
    OR EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      JOIN public.share_permissions sp ON sp.knowledge_object_id = ko.id
      WHERE ko.id = knowledge_object_versions.knowledge_object_id
        AND NOT ko.is_deleted
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    )
  );
