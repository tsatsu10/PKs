-- Rate limit for Run prompt: per user, per minute, stored in DB so it works across edge instances.
-- Edge function calls increment_run_prompt_rate_limit() with user JWT; returns count and retry_after_sec if limited.

CREATE TABLE IF NOT EXISTS public.rate_limit_run_prompt (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_bucket TIMESTAMPTZ NOT NULL,
  count         INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_bucket)
);

-- Only the function needs to write; no direct access from app. Use service role or SECURITY DEFINER.
ALTER TABLE public.rate_limit_run_prompt ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE for anon/authenticated; only the function (SECURITY DEFINER) can access.
CREATE POLICY "No direct access to rate_limit_run_prompt"
  ON public.rate_limit_run_prompt FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.rate_limit_run_prompt IS 'Run prompt rate limit: (user_id, minute bucket) -> count. Used by edge function only.';

-- Increment count for current user and current 1-minute window; cleanup old rows; return count and retry_after_sec.
-- Limit: 20 requests per minute per user. Returns JSON: { "count": n, "limited": bool, "retry_after_sec": n }.
CREATE OR REPLACE FUNCTION public.increment_run_prompt_rate_limit(
  p_limit_per_minute INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_bucket    TIMESTAMPTZ;
  v_count     INT;
  v_retry_sec INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true);
  END IF;

  v_bucket := date_trunc('minute', now());

  INSERT INTO public.rate_limit_run_prompt (user_id, window_bucket, count)
  VALUES (v_user_id, v_bucket, 1)
  ON CONFLICT (user_id, window_bucket) DO UPDATE SET count = rate_limit_run_prompt.count + 1
  RETURNING count INTO v_count;

  -- Cleanup buckets older than 5 minutes
  DELETE FROM public.rate_limit_run_prompt
  WHERE window_bucket < now() - interval '5 minutes';

  -- Seconds until next minute (window resets)
  v_retry_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_bucket + interval '1 minute' - now()))::INT);

  IF v_count > p_limit_per_minute THEN
    RETURN jsonb_build_object('count', v_count, 'limited', true, 'retry_after_sec', v_retry_sec);
  END IF;

  RETURN jsonb_build_object('count', v_count, 'limited', false, 'retry_after_sec', v_retry_sec);
END;
$$;

COMMENT ON FUNCTION public.increment_run_prompt_rate_limit(INT) IS 'Increment run-prompt rate limit for current user; returns { count, limited, retry_after_sec }. Call from edge function with user JWT.';