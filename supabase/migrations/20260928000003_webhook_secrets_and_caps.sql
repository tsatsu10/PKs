-- S7: the signing secret lives in a column the app can write but never read back.
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS webhook_secret text;
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS has_secret boolean GENERATED ALWAYS AS (webhook_secret IS NOT NULL) STORED;

UPDATE public.integrations
SET webhook_secret = nullif(trim(config ->> 'secret'), ''), config = config - 'secret'
WHERE config ? 'secret';

-- Old and new clients may still send config.secret: move it into the write-only column.
-- S8: cap webhooks per user.
CREATE OR REPLACE FUNCTION public.integrations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.config ? 'secret' THEN
    NEW.webhook_secret := nullif(trim(NEW.config ->> 'secret'), '');
    NEW.config := NEW.config - 'secret';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.type = 'webhook'
     AND (SELECT count(*) FROM public.integrations WHERE user_id = NEW.user_id AND type = 'webhook') >= 10 THEN
    RAISE EXCEPTION 'You can have at most 10 webhooks' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.integrations_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_integrations_before_write ON public.integrations;
CREATE TRIGGER trg_integrations_before_write
  BEFORE INSERT OR UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.integrations_before_write();

REVOKE SELECT ON public.integrations FROM anon, authenticated;
GRANT SELECT (id, user_id, name, type, enabled, config, created_at, updated_at, has_secret)
  ON public.integrations TO authenticated;
