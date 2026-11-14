-- Follow-up to 20261115000002 (security review, 2026-11-14): pick the latest version row by
-- version, not created_at. created_at is now() (transaction start), so two overlapping
-- writers on one object can commit in the opposite order of their timestamps. version is
-- assigned from current_version under the row lock and is server-owned since 20261115000002.

CREATE OR REPLACE FUNCTION public.save_knowledge_object_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last public.knowledge_object_versions%ROWTYPE;
BEGIN
  -- backfill_object_content_json fills JSON from the existing Markdown: not an edit.
  IF current_setting('pks.backfill', true) = 'on' AND v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- version comes from current_version, which only the server moves and only under this
  -- row's lock, so it is monotonic per object. created_at is transaction start time and
  -- can be out of order between overlapping writers, so it only breaks ties.
  SELECT * INTO v_last FROM public.knowledge_object_versions v
  WHERE v.knowledge_object_id = OLD.id
  ORDER BY v.version DESC, v.created_at DESC
  LIMIT 1;

  -- Every edit since the latest snapshot was made by that snapshot's user: anyone else's
  -- edit inserts a row first. So folding into it never loses another user's work.
  IF FOUND AND v_last.edited_by IS NOT DISTINCT FROM v_uid AND (
    -- Inside their 10-minute window. Rows with a change_reason (kept conflict copies,
    -- before-restore) never open one: the row they sit beside is not their content.
    (v_last.created_at > now() - interval '10 minutes' AND v_last.change_reason IS NULL)
    -- The state being replaced is already the latest version (e.g. just after Save version).
    OR (v_last.title IS NOT DISTINCT FROM OLD.title
        AND v_last.content IS NOT DISTINCT FROM OLD.content
        AND v_last.content_json IS NOT DISTINCT FROM OLD.content_json
        AND v_last.summary IS NOT DISTINCT FROM OLD.summary
        AND v_last.key_points IS NOT DISTINCT FROM OLD.key_points)
  ) THEN
    NEW.current_version := OLD.current_version;
  ELSE
    INSERT INTO public.knowledge_object_versions (
      knowledge_object_id, version, title, content, content_json, summary, key_points,
      edited_by, change_reason
    ) VALUES (
      OLD.id, OLD.current_version, OLD.title, OLD.content, OLD.content_json, OLD.summary,
      OLD.key_points, v_uid, NULL
    );
    NEW.current_version := OLD.current_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_knowledge_object_version() FROM PUBLIC, anon, authenticated;
