-- Allow shared editors to create links from objects they can edit to objects they own.
-- Previous policy required ownership of both endpoints.

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
