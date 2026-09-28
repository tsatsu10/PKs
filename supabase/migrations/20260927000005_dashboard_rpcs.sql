-- Dashboard RPC hardening: user timezone for "today" (B16), no title leaks in
-- get_dashboard_activity (S3), trash-aware link counts in get_object_links_batch (D6).

-- B16: "today" in the user's own timezone (users.timezone), UTC when unset or invalid.
CREATE OR REPLACE FUNCTION public.user_day_start()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tz AS (
    SELECT coalesce(
      (SELECT u.timezone FROM public.users u
       WHERE u.id = auth.uid()
         AND u.timezone IN (SELECT name FROM pg_timezone_names)),
      'UTC') AS name
  )
  SELECT date_trunc('day', now() AT TIME ZONE tz.name) AT TIME ZONE tz.name FROM tz;
$$;
REVOKE EXECUTE ON FUNCTION public.user_day_start() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_day_start() TO authenticated, service_role;

-- get_dashboard_stats: same as 20250520000001, but "today" uses the caller's timezone.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT ko.id, ko.type, ko.status, ko.updated_at, ko.created_at, ko.due_at
    FROM public.knowledge_objects ko
    WHERE (ko.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
    ))
      AND ko.is_deleted = false
  ),
  owned_today AS (
    SELECT ko.id, ko.status, ko.updated_at, ko.created_at
    FROM public.knowledge_objects ko
    WHERE ko.user_id = auth.uid()
      AND ko.is_deleted = false
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM base) AS total,
      (SELECT count(*) FROM base WHERE updated_at >= (now() - interval '7 days')) AS updated_last_7_days,
      (SELECT count(*) FROM public.knowledge_objects ko
       WHERE (ko.user_id = auth.uid() OR EXISTS (
         SELECT 1 FROM public.share_permissions sp
         WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
       ))
         AND ko.is_deleted = false
         AND ko.due_at IS NOT NULL
         AND ko.due_at >= now()
         AND ko.due_at <= now() + interval '7 days') AS due_next_7_days,
      (SELECT count(*) FROM owned_today WHERE created_at >= public.user_day_start()) AS capture_today,
      (SELECT count(*) FROM owned_today WHERE updated_at >= public.user_day_start()) AS tend_today,
      (SELECT count(*) FROM owned_today
       WHERE status = 'archived' AND updated_at >= public.user_day_start()) AS close_today
  ),
  by_type AS (
    SELECT jsonb_object_agg(coalesce(type::text, 'unknown'), cnt) AS data
    FROM (
      SELECT type, count(*)::int AS cnt
      FROM base
      GROUP BY type
    ) t
  ),
  by_status AS (
    SELECT jsonb_object_agg(coalesce(status, 'active'), cnt) AS data
    FROM (
      SELECT coalesce(status, 'active') AS status, count(*)::int AS cnt
      FROM base
      GROUP BY coalesce(status, 'active')
    ) s
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM totals),
    'updated_last_7_days', (SELECT updated_last_7_days FROM totals),
    'due_next_7_days', (SELECT due_next_7_days FROM totals),
    'by_type', coalesce((SELECT data FROM by_type), '{}'::jsonb),
    'by_status', coalesce((SELECT data FROM by_status), '{}'::jsonb),
    'pulse', jsonb_build_object(
      'capture_today', (SELECT capture_today FROM totals),
      'tend_today', (SELECT tend_today FROM totals),
      'close_today', (SELECT close_today FROM totals)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated, service_role;

-- get_object_links_batch: same as 20250521000001, but ignores trashed neighbours (D6).
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
    JOIN public.knowledge_objects nko ON nko.id = CASE
        WHEN le.from_object_id = i.object_id THEN le.to_object_id
        ELSE le.from_object_id
      END AND nko.is_deleted = false
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

REVOKE EXECUTE ON FUNCTION public.get_object_links_batch(uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_object_links_batch(uuid[], int) TO authenticated, service_role;

-- get_dashboard_activity: same as 20250521000001, but SECURITY INVOKER (S3: RLS on
-- knowledge_objects/link_edges then removes any row the caller can't read before it
-- reaches jsonb_build_object, so an inner join never yields a title the caller can't see),
-- and "today" uses the caller's timezone (B16).
CREATE OR REPLACE FUNCTION public.get_dashboard_activity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(6, 0, -1) AS day_offset
  ),
  day_bounds AS (
    SELECT
      day_offset,
      public.user_day_start() - (day_offset || ' days')::interval AS day_start,
      public.user_day_start() - (day_offset || ' days')::interval + interval '1 day' AS day_end
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

REVOKE EXECUTE ON FUNCTION public.get_dashboard_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_activity() TO authenticated, service_role;
