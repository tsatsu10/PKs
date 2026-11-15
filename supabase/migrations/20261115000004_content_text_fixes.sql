-- Phase 0a part 2 follow-up: correct and fast content_text derivation.
--
-- 1. blocknote_plain_text: `lax $.content[*].**.text` returned link and table text twice (lax
--    unwraps the arrays that `.**` also yields), and `v_lines || x` inside the loop was quadratic
--    (8k blocks: 12 s). Now one set-based query with `strict $.**.text` (8k blocks: ~50 ms).
-- 2. markdown_plain_text: `^\s*` matches a newline even in 'n' mode, so the blank line before a
--    list, quote, heading or fence was dropped. Whitespace classes are now `[ \t]`.
-- 3. sync_object_content ran on every UPDATE, including touch_object_view (every open) and pin
--    toggles. It now returns early when neither content nor content_json changed.
--
-- Order matters: the helpers are replaced first, existing rows are recomputed while the old
-- trigger still re-derives on every UPDATE, and only then is the early-return trigger installed.

-- 1. BlockNote JSON -> plain text -----------------------------------------------------------

-- One line per block (depth-first, children after their parent); inline text joined as is.
-- NULL for NULL or non-array input, '' for an empty array.
CREATE OR REPLACE FUNCTION public.blocknote_plain_text(p_blocks jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE blocks(block, path) AS (
    SELECT e.value, ARRAY[e.ord]
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_blocks) = 'array' THEN p_blocks END)
      WITH ORDINALITY AS e(value, ord)
    UNION ALL
    SELECT c.value, b.path || c.ord
    FROM blocks b
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(b.block -> 'children') = 'array' THEN b.block -> 'children' END
    ) WITH ORDINALITY AS c(value, ord)
  )
  SELECT CASE WHEN jsonb_typeof(p_blocks) = 'array' THEN
    COALESCE(string_agg(
      COALESCE((SELECT string_agg(t #>> '{}', '')
                FROM jsonb_path_query(b.block -> 'content', 'strict $.**.text') AS t
                WHERE jsonb_typeof(t) = 'string'), ''),
      E'\n' ORDER BY b.path), '')
  END
  FROM blocks b
$$;

-- 2. Markdown -> plain text -----------------------------------------------------------------

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
    regexp_replace(p_md, '^[ \t]*```[^\n]*$', '', 'gn'),
      '^[ \t]{0,3}#{1,6}[ \t]+', '', 'gn'),
      '^[ \t]*>[ \t]?', '', 'gn'),
      '^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?', '', 'gn'),
      '!\[([^]]*)\]\([^)]*\)', '\1', 'g'),
      '\[([^]]*)\]\([^)]*\)', '\1', 'g'),
      '`([^`]*)`', '\1', 'g'),
      '(\*\*|__|~~)([^\n]+?)\1', '\2', 'g'),
      '\*([^*\n]+)\*', '\1', 'g'),
      '(^|[^[:alnum:]])_([^_\n]+)_([^[:alnum:]]|$)', '\1\2\3', 'gn')
$$;

-- Recompute existing rows (the current trigger re-derives on any UPDATE). content_text is in
-- touch's ignored list and the version trigger ignores it, so this moves neither revision,
-- updated_at nor history.
UPDATE public.knowledge_objects
SET content_text = CASE WHEN content_json IS NOT NULL
                        THEN public.blocknote_plain_text(content_json)
                        ELSE public.markdown_plain_text(content) END
WHERE content_text IS DISTINCT FROM
      CASE WHEN content_json IS NOT NULL
           THEN public.blocknote_plain_text(content_json)
           ELSE public.markdown_plain_text(content) END;

-- 3. Content sync trigger: skip non-content updates ------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_object_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.content_json IS NOT DISTINCT FROM OLD.content_json THEN
    -- Views, pins, title edits...: nothing to derive. content_text is never client-written.
    NEW.content_text := OLD.content_text;
    RETURN NEW;
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.sync_object_content() FROM PUBLIC, anon, authenticated;
