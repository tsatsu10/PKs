-- B1: view tracking and pinning are bookkeeping, not edits, so they must not bump updated_at.
-- D1: revision bumps on every real edit (current_version only bumps on text fields and counts
--     snapshots), so the client's optimistic-concurrency check catches metadata races too.

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.knowledge_objects.revision IS
  'Bumped by trigger on every real edit (not views/pins). Clients use it for optimistic concurrency.';

CREATE OR REPLACE FUNCTION public.touch_knowledge_object()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Columns whose changes are not user edits. fts is generated (not yet computed in BEFORE
  -- triggers); current_version is maintained by the version trigger.
  ignored text[] := ARRAY['last_viewed_at', 'is_pinned', 'updated_at', 'revision', 'current_version', 'fts'];
BEGIN
  IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
    NEW.updated_at := now();
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_objects_updated_at ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_updated_at
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_object();

REVOKE EXECUTE ON FUNCTION public.touch_knowledge_object() FROM PUBLIC, anon, authenticated;
