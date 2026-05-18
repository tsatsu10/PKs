-- Security: suggest_linked_objects must only expose domain/tag metadata for objects the caller can read.
-- Add ownership/sharing check at the start so we do not leak metadata for other users' objects.

CREATE OR REPLACE FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n int DEFAULT 10)
RETURNS SETOF public.knowledge_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller_can_read AS (
    SELECT 1
    FROM public.knowledge_objects ko
    WHERE ko.id = p_object_id
      AND (ko.user_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.share_permissions sp
             WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
           ))
    LIMIT 1
  ),
  object_domain_ids AS (
    SELECT domain_id FROM public.knowledge_object_domains
    WHERE knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  object_tag_ids AS (
    SELECT tag_id FROM public.knowledge_object_tags
    WHERE knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  already_linked AS (
    SELECT to_object_id AS oid FROM public.link_edges WHERE from_object_id = p_object_id
    UNION
    SELECT from_object_id FROM public.link_edges WHERE to_object_id = p_object_id
  ),
  overlap AS (
    SELECT ko.id,
      (SELECT count(*) FROM public.knowledge_object_domains kod WHERE kod.knowledge_object_id = ko.id AND kod.domain_id IN (SELECT domain_id FROM object_domain_ids))
      + (SELECT count(*) FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = ko.id AND kot.tag_id IN (SELECT tag_id FROM object_tag_ids)) AS score
    FROM public.knowledge_objects ko
    WHERE ko.user_id = auth.uid() AND ko.is_deleted = false AND ko.id != p_object_id
      AND ko.id NOT IN (SELECT oid FROM already_linked)
      AND EXISTS (SELECT 1 FROM caller_can_read)
      AND (
        EXISTS (SELECT 1 FROM public.knowledge_object_domains kod WHERE kod.knowledge_object_id = ko.id AND kod.domain_id IN (SELECT domain_id FROM object_domain_ids))
        OR EXISTS (SELECT 1 FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = ko.id AND kot.tag_id IN (SELECT tag_id FROM object_tag_ids))
      )
  )
  SELECT ko.*
  FROM public.knowledge_objects ko
  JOIN overlap o ON o.id = ko.id
  ORDER BY o.score DESC, ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 50));
$$;
