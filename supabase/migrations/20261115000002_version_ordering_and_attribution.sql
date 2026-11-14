-- Follow-up to 20261115000001 (security review, 2026-11-14).
--  1. current_version is server-owned. Clients (owners included) could set it and so pick
--     which version row the coalescing check treats as the latest. The guard now pins it;
--     only the version trigger and snapshot_knowledge_object move it. The latest row is
--     chosen by created_at, which clients cannot set.
--  2. Coalescing (both the 10-minute window and the identical-content skip) only applies
--     to the user who took the latest snapshot. Otherwise a skipped edit by user B could
--     be folded into user A's window and lost from history.

-- 1: guard pins current_version ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_knowledge_object_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Keep in sync with the editor UI.
  editor_writable text[] := ARRAY['title', 'content', 'summary', 'source', 'key_points',
                                  'content_json', 'content_text', 'updated_at', 'revision',
                                  'current_version', 'fts'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only the version trigger (fires after this one) and snapshot_knowledge_object move it.
  IF current_setting('pks.snapshot', true) IS DISTINCT FROM 'on' THEN
    NEW.current_version := OLD.current_version;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing the owner of an object is not allowed' USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id <> auth.uid() THEN
    -- Pre-update clients (buildObjectPatch) always send slug alongside title. Keep the
    -- existing slug silently for non-owners instead of raising, so old app versions can
    -- still rename shared objects.
    NEW.slug := OLD.slug;
  END IF;
  IF OLD.user_id <> auth.uid()
     AND (to_jsonb(NEW) - editor_writable) IS DISTINCT FROM (to_jsonb(OLD) - editor_writable) THEN
    RAISE EXCEPTION 'Only the owner can change this field'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 1 + 2: version trigger -------------------------------------------------------------------

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

  -- created_at is set by the server; version comes from current_version and only breaks ties.
  SELECT * INTO v_last FROM public.knowledge_object_versions v
  WHERE v.knowledge_object_id = OLD.id
  ORDER BY v.created_at DESC, v.version DESC
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

-- 1: snapshot RPC sets the flag around its own current_version bump --------------------------

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

  -- touch_knowledge_object ignores current_version, so revision does not move. The flag
  -- lets the guard accept this bump.
  PERFORM set_config('pks.snapshot', 'on', true);
  UPDATE public.knowledge_objects SET current_version = v_row.current_version + 1
  WHERE id = p_object_id;
  PERFORM set_config('pks.snapshot', 'off', true);

  RETURN v_row.current_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) TO authenticated;
