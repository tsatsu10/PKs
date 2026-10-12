-- Include tag names in full-text search: objects match when query matches title/summary/content OR any tag name

CREATE OR REPLACE FUNCTION public.search_knowledge_objects(
  search_query    text DEFAULT NULL,
  type_filter     text DEFAULT NULL,
  domain_id_f     uuid DEFAULT NULL,
  tag_id_f        uuid DEFAULT NULL,
  date_from_f     timestamptz DEFAULT NULL,
  date_to_f       timestamptz DEFAULT NULL,
  limit_n         int DEFAULT 50,
  offset_n        int DEFAULT 0
)
RETURNS SETOF public.knowledge_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ko.*
  FROM public.knowledge_objects ko
  WHERE (ko.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()))
    AND ko.is_deleted = false
    AND (
      search_query IS NULL OR search_query = ''
      OR ko.fts @@ plainto_tsquery('english', search_query)
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_tags kot
        JOIN public.tags t ON t.id = kot.tag_id
        WHERE kot.knowledge_object_id = ko.id
          AND to_tsvector('english', coalesce(t.name, '')) @@ plainto_tsquery('english', search_query)
      )
    )
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (domain_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_domains kod
      WHERE kod.knowledge_object_id = ko.id AND kod.domain_id = domain_id_f
    ))
    AND (tag_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_tags kot
      WHERE kot.knowledge_object_id = ko.id AND kot.tag_id = tag_id_f
    ))
    AND (date_from_f IS NULL OR ko.updated_at >= date_from_f)
    AND (date_to_f IS NULL OR ko.updated_at <= date_to_f)
  ORDER BY ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 100))
  OFFSET greatest(0, offset_n);
$$;
