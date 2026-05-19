-- Extend dashboard stats with daily pulse metrics for Capture / Tend / Close rings.

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
      (SELECT count(*) FROM owned_today WHERE created_at >= date_trunc('day', now())) AS capture_today,
      (SELECT count(*) FROM owned_today WHERE updated_at >= date_trunc('day', now())) AS tend_today,
      (SELECT count(*) FROM owned_today
       WHERE status = 'archived' AND updated_at >= date_trunc('day', now())) AS close_today
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
