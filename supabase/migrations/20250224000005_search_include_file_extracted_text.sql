-- Include files.extracted_text in search: objects with attachments whose extracted text matches the query are returned.

CREATE OR REPLACE FUNCTION public.search_knowledge_objects(
  search_query    text DEFAULT NULL,
  type_filter     text DEFAULT NULL,
  domain_id_f     uuid DEFAULT NULL,
  tag_id_f        uuid DEFAULT NULL,
  date_from_f     timestamptz DEFAULT NULL,
  date_to_f       timestamptz DEFAULT NULL,
  status_filter   text DEFAULT NULL,
  due_from_f      timestamptz DEFAULT NULL,
  due_to_f        timestamptz DEFAULT NULL,
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
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_files kof
        JOIN public.files f ON f.id = kof.file_id
        WHERE kof.knowledge_object_id = ko.id
          AND f.extracted_text IS NOT NULL
          AND trim(f.extracted_text) <> ''
          AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
      )
    )
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
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
    AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
    AND (due_to_f IS NULL OR ko.due_at <= due_to_f)
  ORDER BY ko.is_pinned DESC, ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 100))
  OFFSET greatest(0, offset_n);
$$;

CREATE OR REPLACE FUNCTION public.search_knowledge_objects_with_snippets(
  search_query    text DEFAULT NULL,
  type_filter     text DEFAULT NULL,
  domain_id_f     uuid DEFAULT NULL,
  tag_id_f        uuid DEFAULT NULL,
  date_from_f     timestamptz DEFAULT NULL,
  date_to_f       timestamptz DEFAULT NULL,
  status_filter   text DEFAULT NULL,
  due_from_f      timestamptz DEFAULT NULL,
  due_to_f        timestamptz DEFAULT NULL,
  limit_n         int DEFAULT 50,
  offset_n        int DEFAULT 0
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
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
        OR EXISTS (
          SELECT 1 FROM public.knowledge_object_files kof
          JOIN public.files f ON f.id = kof.file_id
          WHERE kof.knowledge_object_id = ko.id
            AND f.extracted_text IS NOT NULL
            AND trim(f.extracted_text) <> ''
            AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
        )
      )
      AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
      AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
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
      AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
      AND (due_to_f IS NULL OR ko.due_at <= due_to_f)
  ),
  limited AS (
    SELECT * FROM base
    ORDER BY is_pinned DESC, updated_at DESC
    LIMIT greatest(1, least(limit_n, 100))
    OFFSET greatest(0, offset_n)
  )
  SELECT (
    jsonb_build_object(
      'id', lim.id, 'user_id', lim.user_id, 'type', lim.type, 'title', lim.title,
      'source', lim.source, 'content', lim.content, 'summary', lim.summary,
      'key_points', lim.key_points, 'is_deleted', lim.is_deleted,
      'current_version', lim.current_version, 'created_at', lim.created_at,
      'updated_at', lim.updated_at, 'is_pinned', lim.is_pinned,
      'status', lim.status, 'slug', lim.slug, 'cover_url', lim.cover_url,
      'due_at', lim.due_at, 'remind_at', lim.remind_at
    )
    || CASE
         WHEN search_query IS NOT NULL AND trim(search_query) <> '' THEN
           jsonb_build_object(
             'snippet',
             ts_headline(
               'english',
               coalesce(lim.title, '') || ' ' || coalesce(lim.summary, '') || ' ' || coalesce(left(lim.content, 5000), ''),
               plainto_tsquery('english', trim(search_query)),
               'MaxFragments=2, MaxWords=35, MinWords=10'
             )
           )
         ELSE jsonb_build_object('snippet', null)
       END
  )::jsonb
  FROM limited lim;
$$;
