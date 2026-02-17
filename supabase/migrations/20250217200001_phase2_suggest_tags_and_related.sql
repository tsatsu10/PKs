-- Phase 2: Suggested tags (tags used on objects in same domain(s)) and related object suggestions (same domain/tag)

-- Suggested tags for an object: tags used on other objects that share at least one domain with this object,
-- ordered by usage count, excluding tags already on this object.
CREATE OR REPLACE FUNCTION public.suggest_tags_for_object(p_object_id uuid)
RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH object_domains AS (
    SELECT kod.domain_id
    FROM public.knowledge_object_domains kod
    JOIN public.knowledge_objects ko ON ko.id = kod.knowledge_object_id
    WHERE kod.knowledge_object_id = p_object_id AND ko.user_id = auth.uid()
  ),
  object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = p_object_id
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

-- If object has no domains, suggest most-used tags (excluding already on object)
CREATE OR REPLACE FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid)
RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = p_object_id
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

-- Related objects to link: objects that share at least one domain or one tag with this object,
-- excluding already linked, ordered by overlap score.
CREATE OR REPLACE FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n int DEFAULT 10)
RETURNS SETOF public.knowledge_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH object_domain_ids AS (
    SELECT domain_id FROM public.knowledge_object_domains WHERE knowledge_object_id = p_object_id
  ),
  object_tag_ids AS (
    SELECT tag_id FROM public.knowledge_object_tags WHERE knowledge_object_id = p_object_id
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

GRANT EXECUTE ON FUNCTION public.suggest_tags_for_object(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_tags_for_object_fallback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_linked_objects(uuid, int) TO authenticated;
