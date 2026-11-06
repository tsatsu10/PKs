-- Production error reports from the web app (R12). Written only through report_client_error();
-- no user can read the table (RLS on, no policies). The owner reads it with SQL / the MCP.
CREATE TABLE public.client_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,
  message     text NOT NULL,
  stack       text,
  route       text,
  app_version text,
  user_agent  text,
  fingerprint text NOT NULL
);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;

CREATE INDEX idx_client_errors_user_created ON public.client_errors (user_id, created_at);
CREATE INDEX idx_client_errors_created ON public.client_errors (created_at);

COMMENT ON TABLE public.client_errors IS
  'Client error reports (kind, scrubbed message/stack, path-only route). Insert via report_client_error(); owner-read only. 30-day retention.';

CREATE FUNCTION public.report_client_error(
  p_kind text, p_message text, p_stack text, p_route text,
  p_app_version text, p_user_agent text, p_fingerprint text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('server', 'unknown', 'permission') THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.client_errors
      WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.client_errors
      WHERE created_at > now() - interval '1 day') >= 5000 THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_errors (user_id, kind, message, stack, route, app_version, user_agent, fingerprint)
  VALUES (v_uid, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4096), left(p_route, 300),
          left(p_app_version, 40), left(p_user_agent, 200), left(coalesce(p_fingerprint, ''), 64));

  DELETE FROM public.client_errors WHERE created_at < now() - interval '30 days';
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) IS
  'Store one client error report for the caller. Drops expected kinds, >30/user/hour and >5000/day globally. Returns true when stored.';
