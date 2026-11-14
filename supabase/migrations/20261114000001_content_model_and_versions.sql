-- Phase 0a part 2b: BlockNote JSON content, derived plain text, coalesced version history,
-- and the snapshot / backfill RPCs. Expand-only: a pre-2b client (Markdown only, saving with
-- `.eq('revision', n)`) keeps working against this schema.

-- Columns -------------------------------------------------------------------------------

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS content_json jsonb,
  ADD COLUMN IF NOT EXISTS content_text text;
ALTER TABLE public.knowledge_object_versions
  ADD COLUMN IF NOT EXISTS content_json jsonb;

COMMENT ON COLUMN public.knowledge_objects.content_json IS
  'BlockNote blocks. Nulled by trigger when content (Markdown) changes without it (old clients).';
COMMENT ON COLUMN public.knowledge_objects.content_text IS
  'Plain text derived by trg_knowledge_objects_sync_content. Never written by clients.';

-- Plain-text helpers --------------------------------------------------------------------

-- One line per block (depth-first, children after their parent); inline text joined as is.
CREATE OR REPLACE FUNCTION public.blocknote_plain_text(p_blocks jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_block jsonb;
  v_lines text[] := ARRAY[]::text[];
  v_child text;
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RETURN NULL;
  END IF;
  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
    v_lines := v_lines || COALESCE(
      (SELECT string_agg(t #>> '{}', '')
       FROM jsonb_path_query(v_block, 'lax $.content[*].**.text') AS t
       WHERE jsonb_typeof(t) = 'string'),
      '');
    v_child := public.blocknote_plain_text(v_block -> 'children');
    IF v_child IS NOT NULL AND v_child <> '' THEN
      v_lines := v_lines || v_child;
    END IF;
  END LOOP;
  RETURN array_to_string(v_lines, E'\n');
END;
$$;

CREATE OR REPLACE FUNCTION public.markdown_plain_text(p_md text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- emphasis and strike markers around text
    regexp_replace(regexp_replace(regexp_replace(
    -- inline code
    regexp_replace(
    -- images and links keep their text
    regexp_replace(regexp_replace(
    -- list markers and task boxes
    regexp_replace(
    -- blockquote markers
    regexp_replace(
    -- headings
    regexp_replace(
    -- code fences
    regexp_replace(p_md, '^\s*```[^\n]*$', '', 'gn'),
      '^\s{0,3}#{1,6}\s+', '', 'gn'),
      '^\s*>\s?', '', 'gn'),
      '^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?', '', 'gn'),
      '!\[([^]]*)\]\([^)]*\)', '\1', 'g'),
      '\[([^]]*)\]\([^)]*\)', '\1', 'g'),
      '`([^`]*)`', '\1', 'g'),
      '(\*\*|__|~~)([^\n]+?)\1', '\2', 'g'),
      '\*([^*\n]+)\*', '\1', 'g'),
      '(^|[^[:alnum:]])_([^_\n]+)_([^[:alnum:]]|$)', '\1\2\3', 'gn')
$$;

-- Content sync trigger (sorts after _guard, before _updated_at and _version) ------------

CREATE OR REPLACE FUNCTION public.sync_object_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.content IS DISTINCT FROM OLD.content
     AND NEW.content_json IS NOT DISTINCT FROM OLD.content_json THEN
    -- An old client's Markdown edit must never be shadowed by stale JSON.
    NEW.content_json := NULL;
  END IF;
  IF NEW.content_json IS NOT NULL THEN
    NEW.content_text := public.blocknote_plain_text(NEW.content_json);
  ELSE
    NEW.content_text := public.markdown_plain_text(NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_objects_sync_content ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_sync_content
  BEFORE INSERT OR UPDATE ON public.knowledge_objects
  FOR EACH ROW EXECUTE FUNCTION public.sync_object_content();

REVOKE EXECUTE ON FUNCTION public.sync_object_content() FROM PUBLIC, anon, authenticated;

-- touch: content_text is derived; the backfill keeps revision and updated_at ------------

CREATE OR REPLACE FUNCTION public.touch_knowledge_object()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Columns whose changes are not user edits. fts is generated (not yet computed in BEFORE
  -- triggers); current_version is maintained by the version trigger; content_text is derived.
  ignored text[] := ARRAY['last_viewed_at', 'is_pinned', 'updated_at', 'revision', 'current_version',
                          'fts', 'content_text'];
BEGIN
  IF current_setting('pks.backfill', true) = 'on' AND auth.uid() IS NULL THEN
    -- backfill_object_content_json: not an edit, so open editors see no false conflict.
    NEW.updated_at := OLD.updated_at;
    NEW.revision := OLD.revision;
  ELSIF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
    NEW.updated_at := now();
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

-- guard: editors may write the derived column too ---------------------------------------

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

-- Coalesced versions: at most one automatic snapshot per object per 10 minutes ----------

CREATE OR REPLACE FUNCTION public.save_knowledge_object_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_object_versions v
    WHERE v.knowledge_object_id = OLD.id
      AND v.created_at > now() - interval '10 minutes'
  ) THEN
    INSERT INTO public.knowledge_object_versions (
      knowledge_object_id, version, title, content, content_json, summary, key_points,
      edited_by, change_reason
    ) VALUES (
      OLD.id, OLD.current_version, OLD.title, OLD.content, OLD.content_json, OLD.summary,
      OLD.key_points, auth.uid(), NULL
    );
    NEW.current_version := OLD.current_version + 1;
  ELSE
    NEW.current_version := OLD.current_version;
  END IF;
  RETURN NEW;
END;
$$;

-- Snapshot RPC (Save version, Keep mine, Load theirs, restore) --------------------------

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
    left(p_reason, 200)
  );

  -- touch_knowledge_object ignores current_version, so revision does not move.
  UPDATE public.knowledge_objects SET current_version = v_row.current_version + 1
  WHERE id = p_object_id;

  RETURN v_row.current_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_knowledge_object(uuid, jsonb, text) TO authenticated;

-- Backfill RPC (owner-run script, service role only) ------------------------------------

CREATE OR REPLACE FUNCTION public.backfill_object_content_json(
  p_id uuid,
  p_revision bigint,
  p_content_json jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
BEGIN
  PERFORM set_config('pks.backfill', 'on', true);
  UPDATE public.knowledge_objects
  SET content_json = p_content_json
  WHERE id = p_id AND revision = p_revision AND content_json IS NULL;
  v_found := FOUND;
  PERFORM set_config('pks.backfill', 'off', true);
  RETURN v_found;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_object_content_json(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_object_content_json(uuid, bigint, jsonb) TO service_role;

-- Fill content_text for existing rows. content_text is in touch's ignored list and the
-- version trigger's WHEN is false, so this moves neither revision, updated_at nor history.
UPDATE public.knowledge_objects
SET content_text = public.markdown_plain_text(content)
WHERE content IS NOT NULL AND content_text IS NULL;
