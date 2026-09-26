-- 1. user_ai_providers.api_key is write-only for app users. The client never needs to read a
--    key back; run-prompt reads it with the service role after verifying the caller.
-- 2. Daily per-user quota for Run prompt when it falls back to the server's shared DeepSeek key.

-- ---------------------------------------------------------------------------
-- 1. Column-level privileges on user_ai_providers
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.user_ai_providers FROM anon, authenticated;
GRANT SELECT (id, user_id, name, provider_type, created_at) ON public.user_ai_providers TO authenticated;

COMMENT ON COLUMN public.user_ai_providers.api_key IS
  'Write-only for authenticated users (no SELECT grant); read by the run-prompt edge function via service role.';

-- ---------------------------------------------------------------------------
-- 2. Server-key daily quota
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.server_key_daily_usage (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  count    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.server_key_daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to server_key_daily_usage" ON public.server_key_daily_usage;
CREATE POLICY "No direct access to server_key_daily_usage"
  ON public.server_key_daily_usage FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.server_key_daily_usage IS
  'Run prompt calls per user per UTC day that used the shared server DeepSeek key.';

-- Consume one unit of today's quota for the caller. Returns { count, limited }.
-- A caller can only ever raise their own count, so a direct call is harmless.
CREATE OR REPLACE FUNCTION public.consume_server_key_quota(p_daily_limit INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true);
  END IF;

  INSERT INTO public.server_key_daily_usage (user_id, day, count)
  VALUES (v_user_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = server_key_daily_usage.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.server_key_daily_usage
  WHERE day < (now() AT TIME ZONE 'utc')::date - 7;

  RETURN jsonb_build_object('count', v_count, 'limited', v_count > p_daily_limit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_server_key_quota(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_server_key_quota(INT) TO authenticated, service_role;
