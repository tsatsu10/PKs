-- The client records storage_key after upload; without an UPDATE policy that write was a no-op.
DROP POLICY IF EXISTS "Users can update own files" ON public.files;
CREATE POLICY "Users can update own files"
  ON public.files FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- D4/B14: permanently delete a trashed object and the file rows only it used. Storage objects
-- can't be deleted from SQL, so the orphaned paths are returned for the client to remove.
CREATE OR REPLACE FUNCTION public.delete_object_permanently(p_object_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphans jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_objects
    WHERE id = p_object_id AND user_id = auth.uid() AND is_deleted
  ) THEN
    RAISE EXCEPTION 'Only objects you own that are in Trash can be permanently deleted'
      USING ERRCODE = '42501';
  END IF;

  WITH orphan AS (
    SELECT f.id, f.filename, f.storage_key
    FROM public.files f
    JOIN public.knowledge_object_files kof ON kof.file_id = f.id AND kof.knowledge_object_id = p_object_id
    WHERE f.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.knowledge_object_files other
        WHERE other.file_id = f.id AND other.knowledge_object_id <> p_object_id
      )
  ), deleted AS (
    DELETE FROM public.files f USING orphan o WHERE f.id = o.id
    RETURNING o.id, o.filename, o.storage_key
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'filename', filename, 'storage_key', storage_key)), '[]'::jsonb)
  INTO v_orphans FROM deleted;

  DELETE FROM public.knowledge_objects WHERE id = p_object_id;
  RETURN v_orphans;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_object_permanently(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_object_permanently(uuid) TO authenticated, service_role;

-- 50 MB per file.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'pks-files';
