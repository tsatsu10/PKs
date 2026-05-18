-- Run in Supabase SQL Editor if you prefer not to use migration repair + db push.
-- Same as migration 20250518000001_link_edges_shared_editor_insert.sql

DROP POLICY IF EXISTS "Users can insert links between own objects" ON public.link_edges;

CREATE POLICY "Users can insert links between own objects"
  ON public.link_edges FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      WHERE ko.id = to_object_id AND ko.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.knowledge_objects ko
        WHERE ko.id = from_object_id AND ko.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.share_permissions sp
        WHERE sp.knowledge_object_id = from_object_id
          AND sp.shared_with_user_id = auth.uid()
          AND sp.role = 'editor'
      )
    )
  );

-- Record migration (optional; keeps CLI in sync):
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES ('20250518000001', 'link_edges_shared_editor_insert')
-- ON CONFLICT DO NOTHING;
