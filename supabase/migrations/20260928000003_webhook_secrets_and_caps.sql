-- S7: the signing secret lives in a column the app can write but never read back.
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS webhook_secret text;
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS has_secret boolean GENERATED ALWAYS AS (webhook_secret IS NOT NULL) STORED;

UPDATE public.integrations
SET webhook_secret = nullif(trim(config ->> 'secret'), ''), config = config - 'secret'
WHERE config ? 'secret';

-- Old and new clients may still send config.secret: move it into the write-only column.
-- S8: cap webhooks per user.
-- Note: no CHECK (type IN (...)) is added here. Old clients may still insert/keep
-- 'generic', 'import' or 'api' (INTEGRATION_TYPES pre-dates this task), so a CHECK would need to
-- allow all of those plus 'webhook', which buys no real safety and risks breaking an old client
-- on an unanticipated existing value. Skipped; the cap logic below is what actually matters.
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

  -- S8: cap webhooks per user. Enforced on INSERT, and on any UPDATE that makes a row become
  -- (or stay) a webhook under this user for the first time -- otherwise 30 'generic' rows could
  -- be bulk-UPDATEd to type='webhook' and bypass the cap entirely.
  IF NEW.type = 'webhook'
     AND (TG_OP = 'INSERT' OR OLD.type IS DISTINCT FROM 'webhook' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
  THEN
    -- Serialize concurrent writers for the same user so two simultaneous inserts can't both
    -- read count=9 and both proceed to 10.
    PERFORM pg_advisory_xact_lock(hashtext('integrations_cap:' || NEW.user_id::text));
    IF (SELECT count(*) FROM public.integrations
        WHERE user_id = NEW.user_id AND type = 'webhook'
          AND (TG_OP = 'INSERT' OR id IS DISTINCT FROM NEW.id)) >= 10 THEN
      RAISE EXCEPTION 'You can have at most 10 webhooks' USING ERRCODE = 'P0001';
    END IF;
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
