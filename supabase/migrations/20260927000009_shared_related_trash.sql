-- S9 (fix round 2): the shared-user branches on knowledge_object_tags,
-- knowledge_object_domains and link_edges checked share_permissions directly, without
-- excluding trashed objects. A shared user could still read tag/domain links and link
-- edges of an object after it was moved to trash, and an editor could still insert a
-- link from a trashed object. Route these through can_read_object/can_edit_object
-- (20260927000003), which already exclude is_deleted, instead of duplicating that logic.

-- knowledge_object_domains: shared user can read (trash-aware)
DROP POLICY IF EXISTS "Users can read kod for shared objects" ON public.knowledge_object_domains;
CREATE POLICY "Users can read kod for shared objects"
  ON public.knowledge_object_domains FOR SELECT
  TO authenticated
  USING (
    public.can_read_object(knowledge_object_domains.knowledge_object_id)
  );

-- knowledge_object_tags: shared user can read (trash-aware)
DROP POLICY IF EXISTS "Users can read kot for shared objects" ON public.knowledge_object_tags;
CREATE POLICY "Users can read kot for shared objects"
  ON public.knowledge_object_tags FOR SELECT
  TO authenticated
  USING (
    public.can_read_object(knowledge_object_tags.knowledge_object_id)
  );

-- link_edges: shared user can read links involving objects shared with them (trash-aware)
DROP POLICY IF EXISTS "Users can read links for shared objects" ON public.link_edges;
CREATE POLICY "Users can read links for shared objects"
  ON public.link_edges FOR SELECT
  TO authenticated
  USING (
    public.can_read_object(link_edges.from_object_id)
    OR public.can_read_object(link_edges.to_object_id)
  );

-- link_edges: shared editors may only insert links from objects they can still edit
-- (i.e. not trashed).
DROP POLICY IF EXISTS "Users can insert links between own objects" ON public.link_edges;
CREATE POLICY "Users can insert links between own objects"
  ON public.link_edges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      WHERE ko.id = link_edges.to_object_id AND ko.user_id = (SELECT auth.uid())
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.knowledge_objects ko
        WHERE ko.id = link_edges.from_object_id AND ko.user_id = (SELECT auth.uid())
      )
      OR public.can_edit_object(link_edges.from_object_id)
    )
  );
