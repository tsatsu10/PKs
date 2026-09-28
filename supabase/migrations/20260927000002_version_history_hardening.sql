-- B15/D5: snapshots from service-role writes have no user; deleting a user keeps history.
ALTER TABLE public.knowledge_object_versions ALTER COLUMN edited_by DROP NOT NULL;
ALTER TABLE public.knowledge_object_versions
  DROP CONSTRAINT IF EXISTS knowledge_object_versions_edited_by_fkey;
ALTER TABLE public.knowledge_object_versions
  ADD CONSTRAINT knowledge_object_versions_edited_by_fkey
  FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kov_edited_by ON public.knowledge_object_versions(edited_by);

-- Versions are written only by the SECURITY DEFINER snapshot trigger; clients never insert.
DROP POLICY IF EXISTS "Users can insert versions for own objects" ON public.knowledge_object_versions;

-- S4: viewers see the current object only, not its history (which may predate the share).
DROP POLICY IF EXISTS "Users can read versions of own objects" ON public.knowledge_object_versions;
CREATE POLICY "Owners and editors can read versions"
  ON public.knowledge_object_versions FOR SELECT
  TO authenticated
  USING (
    public.owns_knowledge_object(knowledge_object_id)
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    )
  );
