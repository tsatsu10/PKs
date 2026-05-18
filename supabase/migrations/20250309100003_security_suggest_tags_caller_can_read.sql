-- Security: suggest_tags_for_object and suggest_tags_for_object_fallback must only expose
-- tag/domain metadata for objects the caller can read (owner or shared with).

CREATE OR REPLACE FUNCTION public.suggest_tags_for_object(p_object_id uuid)
RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
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
  object_domains AS (
    SELECT kod.domain_id
    FROM public.knowledge_object_domains kod
    JOIN public.knowledge_objects ko ON ko.id = kod.knowledge_object_id
    WHERE kod.knowledge_object_id = p_object_id
      AND ko.user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot
    WHERE kot.knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  candidate_objects AS (
    SELECT DISTINCT kod2.knowledge_object_id
    FROM public.knowledge_object_domains kod2
    WHERE kod2.domain_id IN (SELECT domain_id FROM object_domains)
      AND kod2.knowledge_object_id != p_object_id
      AND EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = kod2.knowledge_object_id AND ko.user_id = auth.uid())
  ),
  tag_counts AS (
    SELECT kot.tag_id, count(*) AS cnt
    FROM public.knowledge_object_tags kot
    WHERE kot.knowledge_object_id IN (SELECT knowledge_object_id FROM candidate_objects)
      AND kot.tag_id NOT IN (SELECT tag_id FROM object_tag_ids)
    GROUP BY kot.tag_id
  )
  SELECT t.id AS tag_id, t.name AS tag_name, tc.cnt AS usage_count
  FROM tag_counts tc
  JOIN public.tags t ON t.id = tc.tag_id AND t.user_id = auth.uid()
  ORDER BY tc.cnt DESC, t.name
  LIMIT 15;
$$;

CREATE OR REPLACE FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid)
RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
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
  object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot
    WHERE kot.knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  tag_counts AS (
    SELECT kot.tag_id, count(*) AS cnt
    FROM public.knowledge_object_tags kot
    JOIN public.knowledge_objects ko ON ko.id = kot.knowledge_object_id AND ko.user_id = auth.uid() AND ko.is_deleted = false
    WHERE kot.tag_id NOT IN (SELECT tag_id FROM object_tag_ids)
    GROUP BY kot.tag_id
  )
  SELECT t.id AS tag_id, t.name AS tag_name, tc.cnt AS usage_count
  FROM tag_counts tc
  JOIN public.tags t ON t.id = tc.tag_id AND t.user_id = auth.uid()
  ORDER BY tc.cnt DESC, t.name
  LIMIT 10;
$$;
