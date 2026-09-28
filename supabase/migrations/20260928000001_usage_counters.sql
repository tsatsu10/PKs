-- Fixed-window counters for per-user rate limits/daily caps and global caps.
-- Replaces rate_limit_run_prompt and server_key_daily_usage (dropped in the contract task).
CREATE TABLE IF NOT EXISTS public.usage_counters (
  scope   text        NOT NULL,
  subject uuid        NOT NULL,  -- user id, or the zero uuid for global counters
  bucket  timestamptz NOT NULL,
  count   int         NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject, bucket)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER functions below touch it.

CREATE OR REPLACE FUNCTION public._consume_counter(p_scope text, p_subject uuid, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count  int;
BEGIN
  INSERT INTO public.usage_counters (scope, subject, bucket, count)
  VALUES (p_scope, p_subject, v_bucket, 1)
  ON CONFLICT (scope, subject, bucket) DO UPDATE SET count = usage_counters.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.usage_counters
  WHERE scope = p_scope AND subject = p_subject
    AND bucket < v_bucket - make_interval(secs => p_window_seconds);

  RETURN jsonb_build_object(
    'count', v_count,
    'limited', v_count > p_limit,
    'retry_after_sec', ceil(extract(epoch FROM v_bucket + make_interval(secs => p_window_seconds) - now()))::int
  );
END;
$$;
-- Internal helper: not meant to be called directly by any role, including service_role
-- (Postgres/Supabase default privileges would otherwise grant it EXECUTE like any other function).
REVOKE EXECUTE ON FUNCTION public._consume_counter(text, uuid, int, int) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_usage(p_scope text, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true, 'retry_after_sec', 60);
  END IF;
  RETURN public._consume_counter(p_scope, auth.uid(), p_limit, p_window_seconds);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_usage(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_global_usage(p_scope text, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._consume_counter(p_scope, '00000000-0000-0000-0000-000000000000', p_limit, p_window_seconds);
$$;
REVOKE EXECUTE ON FUNCTION public.consume_global_usage(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_global_usage(text, int, int) TO service_role;
