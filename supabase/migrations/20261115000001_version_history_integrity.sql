-- Version history integrity follow-ups to 20261114000001 (security review, 2026-11-14).
--  1. A content_json-only change now snapshots (an editor could change the rendered body
--     with no history entry).
--  2. Coalescing is per user: an edit only folds into the latest snapshot when that
--     snapshot was taken by the same user within 10 minutes and has no change_reason. Another
--     user's edit always snapshots first, so it cannot erase work from history.
--  3. snapshot_knowledge_object only accepts the change reasons the app sends.

-- 1 + 2: version trigger --------------------------------------------------------------------

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

  SELECT * INTO v_last FROM public.knowledge_object_versions v
  WHERE v.knowledge_object_id = OLD.id
  ORDER BY v.version DESC, v.created_at DESC
  LIMIT 1;

  IF FOUND AND (
    -- Same user, still inside their 10-minute window. Snapshots with a change_reason
    -- (kept conflict copies, before-restore) never open a window: the row they sit
    -- beside is not their content.
    (v_last.created_at > now() - interval '10 minutes'
     AND v_last.change_reason IS NULL
     AND v_last.edited_by IS NOT DISTINCT FROM v_uid)
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

DROP TRIGGER IF EXISTS trg_knowledge_objects_version ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_version
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW
  WHEN (old.title IS DISTINCT FROM new.title
        OR old.content IS DISTINCT FROM new.content
        OR old.content_json IS DISTINCT FROM new.content_json
        OR old.summary IS DISTINCT FROM new.summary
        OR old.key_points IS DISTINCT FROM new.key_points)
  EXECUTE FUNCTION public.save_knowledge_object_version();

-- 3: snapshot RPC reasons -------------------------------------------------------------------
-- Keep in sync with saveQueue.ts (KEEP_MINE_REASON, LOAD_THEIRS_REASON, applyVersion).

CREATE OR REPLACE FUNCTION public.snapshot_knowledge_object(
  p_object_id uuid,
  p_fields jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.knowledge_objects%ROWTYPE;
  v_bad text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NOT NULL
     AND p_reason NOT IN ('Kept from a conflict before overwrite', 'Unsaved edit kept from a conflict')
     AND p_reason !~ '^Before restoring v[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'Unknown change reason' USING ERRCODE = '22023';
  END IF;
  -- Caller-supplied content is only allowed as the conflict copy of the caller's own edit.
  IF p_fields IS NOT NULL AND p_reason IS DISTINCT FROM 'Unsaved edit kept from a conflict' THEN
    RAISE EXCEPTION 'p_fields is only allowed for a kept conflict edit' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.knowledge_objects WHERE id = p_object_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    v_row.user_id = v_uid
    OR (NOT v_row.is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = p_object_id
        AND sp.shared_with_user_id = v_uid
        AND sp.role = 'editor'
    ))
  ) THEN
    RAISE EXCEPTION 'You cannot edit this object' USING ERRCODE = '42501';
  END IF;

  IF p_fields IS NOT NULL THEN
    IF jsonb_typeof(p_fields) <> 'object' THEN
      RAISE EXCEPTION 'p_fields must be an object' USING ERRCODE = '22023';
    END IF;
    SELECT k INTO v_bad FROM jsonb_object_keys(p_fields) AS k
    WHERE k NOT IN ('title', 'content', 'content_json', 'summary', 'key_points')
    LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Unknown field %', v_bad USING ERRCODE = '22023';
    END IF;
    IF octet_length(p_fields ->> 'content') > 1048576 THEN
      RAISE EXCEPTION 'content is over 1 MB' USING ERRCODE = '22023';
    END IF;
    IF octet_length((p_fields -> 'content_json')::text) > 2097152 THEN
      RAISE EXCEPTION 'content_json is over 2 MB' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.knowledge_object_versions (
    knowledge_object_id, version, title, content, content_json, summary, key_points,
    edited_by, change_reason
  ) VALUES (
    p_object_id,
    v_row.current_version,
    CASE WHEN p_fields ? 'title' THEN COALESCE(p_fields ->> 'title', v_row.title) ELSE v_row.title END,
    CASE WHEN p_fields ? 'content' THEN p_fields ->> 'content' ELSE v_row.content END,
    CASE WHEN p_fields ? 'content_json' THEN NULLIF(p_fields -> 'content_json', 'null'::jsonb)
         ELSE v_row.content_json END,
    CASE WHEN p_fields ? 'summary' THEN p_fields ->> 'summary' ELSE v_row.summary END,
    CASE WHEN p_fields ? 'key_points' THEN COALESCE(NULLIF(p_fields -> 'key_points', 'null'::jsonb), '[]'::jsonb)
         ELSE v_row.key_points END,
    v_uid,
    p_reason
  );

  -- touch_knowledge_object ignores current_version, so revision does not move.
  UPDATE public.knowledge_objects SET current_version = v_row.current_version + 1
  WHERE id = p_object_id;

  RETURN v_row.current_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) TO authenticated;
