-- Phase 3: batched object links for dashboard LinkedBar + activity sidebar sparklines.

CREATE OR REPLACE FUNCTION public.get_object_links_batch(
  p_object_ids uuid[],
  p_limit_per int DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT unnest(coalesce(p_object_ids, ARRAY[]::uuid[])) AS object_id
  ),
  neighbors AS (
    SELECT
      i.object_id AS source_id,
      CASE
        WHEN le.from_object_id = i.object_id THEN le.to_object_id
        ELSE le.from_object_id
      END AS linked_id,
      le.relationship_type,
      le.created_at
    FROM ids i
    JOIN public.link_edges le
      ON le.from_object_id = i.object_id OR le.to_object_id = i.object_id
  ),
  ranked AS (
    SELECT
      n.*,
      row_number() OVER (PARTITION BY n.source_id ORDER BY n.created_at DESC) AS rn,
      count(*) OVER (PARTITION BY n.source_id) AS total_count
    FROM neighbors n
    WHERE n.linked_id IS NOT NULL
  ),
  limited AS (
    SELECT r.*
    FROM ranked r
    WHERE r.rn <= greatest(1, least(coalesce(p_limit_per, 3), 10))
  )
  SELECT coalesce(
    jsonb_object_agg(
      l.source_id::text,
      jsonb_build_object(
        'links', l.links,
        'total', l.total_count
      )
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT
      l.source_id,
      max(l.total_count)::int AS total_count,
      jsonb_agg(
        jsonb_build_object(
          'id', ko.id,
          'title', ko.title,
          'type', ko.type,
          'relationship_type', l.relationship_type
        )
        ORDER BY l.created_at DESC
      ) AS links
    FROM limited l
    JOIN public.knowledge_objects ko ON ko.id = l.linked_id AND ko.is_deleted = false
    GROUP BY l.source_id
  ) l;
$$;

GRANT EXECUTE ON FUNCTION public.get_object_links_batch(uuid[], int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_activity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(6, 0, -1) AS day_offset
  ),
  day_bounds AS (
    SELECT
      day_offset,
      date_trunc('day', now()) - (day_offset || ' days')::interval AS day_start,
      date_trunc('day', now()) - (day_offset || ' days')::interval + interval '1 day' AS day_end
    FROM days
  ),
  owned AS (
    SELECT id, created_at, updated_at
    FROM public.knowledge_objects
    WHERE user_id = auth.uid() AND is_deleted = false
  ),
  capture_series AS (
    SELECT
      db.day_offset,
      count(o.id)::int AS cnt
    FROM day_bounds db
    LEFT JOIN owned o ON o.created_at >= db.day_start AND o.created_at < db.day_end
    GROUP BY db.day_offset
    ORDER BY db.day_offset
  ),
  tend_series AS (
    SELECT
      db.day_offset,
      count(o.id)::int AS cnt
    FROM day_bounds db
    LEFT JOIN owned o ON o.updated_at >= db.day_start AND o.updated_at < db.day_end
    GROUP BY db.day_offset
    ORDER BY db.day_offset
  ),
  trending_tags AS (
    SELECT t.id, t.name, count(*)::int AS cnt
    FROM public.knowledge_object_tags kot
    JOIN public.tags t ON t.id = kot.tag_id
    JOIN public.knowledge_objects ko ON ko.id = kot.knowledge_object_id
    WHERE ko.user_id = auth.uid()
      AND ko.is_deleted = false
      AND ko.updated_at >= now() - interval '7 days'
    GROUP BY t.id, t.name
    ORDER BY cnt DESC
    LIMIT 6
  ),
  recent_links AS (
    SELECT
      le.id,
      le.from_object_id,
      le.to_object_id,
      le.relationship_type,
      le.created_at,
      ko_from.title AS from_title,
      ko_from.type AS from_type,
      ko_to.title AS to_title,
      ko_to.type AS to_type
    FROM public.link_edges le
    JOIN public.knowledge_objects ko_from ON ko_from.id = le.from_object_id AND ko_from.is_deleted = false
    JOIN public.knowledge_objects ko_to ON ko_to.id = le.to_object_id AND ko_to.is_deleted = false
    WHERE (
      ko_from.user_id = auth.uid()
      OR ko_to.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.share_permissions sp
        WHERE sp.shared_with_user_id = auth.uid()
          AND sp.knowledge_object_id IN (le.from_object_id, le.to_object_id)
      )
    )
    ORDER BY le.created_at DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'capture_7d', (SELECT coalesce(jsonb_agg(cnt ORDER BY day_offset), '[]'::jsonb) FROM capture_series),
    'tend_7d', (SELECT coalesce(jsonb_agg(cnt ORDER BY day_offset), '[]'::jsonb) FROM tend_series),
    'trending_tags', (
      SELECT coalesce(
        jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', cnt)),
        '[]'::jsonb
      )
      FROM trending_tags
    ),
    'recent_links', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'from_object_id', from_object_id,
            'to_object_id', to_object_id,
            'relationship_type', relationship_type,
            'created_at', created_at,
            'from_title', from_title,
            'from_type', from_type,
            'to_title', to_title,
            'to_type', to_type
          )
        ),
        '[]'::jsonb
      )
      FROM recent_links
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_activity() TO authenticated;
