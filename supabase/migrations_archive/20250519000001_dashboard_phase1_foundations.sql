-- Phase 1 dashboard foundations: last viewed, accurate counts, inline entity create, touch view.

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_last_viewed
  ON public.knowledge_objects (user_id, last_viewed_at DESC NULLS LAST)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.knowledge_objects.last_viewed_at IS 'When the owner last opened this object (for Resume on dashboard).';

-- Shared filter predicate (matches search_knowledge_objects).
CREATE OR REPLACE FUNCTION public.count_knowledge_objects(
  search_query    text DEFAULT NULL,
  type_filter     text DEFAULT NULL,
  domain_id_f     uuid DEFAULT NULL,
  tag_id_f        uuid DEFAULT NULL,
  date_from_f     timestamptz DEFAULT NULL,
  date_to_f       timestamptz DEFAULT NULL,
  status_filter   text DEFAULT NULL,
  due_from_f      timestamptz DEFAULT NULL,
  due_to_f        timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.knowledge_objects ko
  WHERE (ko.user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.share_permissions sp
    WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
  ))
    AND ko.is_deleted = false
    AND (
      search_query IS NULL OR search_query = ''
      OR ko.fts @@ plainto_tsquery('english', search_query)
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_tags kot
        JOIN public.tags t ON t.id = kot.tag_id
        WHERE kot.knowledge_object_id = ko.id
          AND to_tsvector('english', coalesce(t.name, '')) @@ plainto_tsquery('english', search_query)
      )
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_files kof
        JOIN public.files f ON f.id = kof.file_id
        WHERE kof.knowledge_object_id = ko.id
          AND f.extracted_text IS NOT NULL
          AND trim(f.extracted_text) <> ''
          AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
      )
    )
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
    AND (domain_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_domains kod
      WHERE kod.knowledge_object_id = ko.id AND kod.domain_id = domain_id_f
    ))
    AND (tag_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_tags kot
      WHERE kot.knowledge_object_id = ko.id AND kot.tag_id = tag_id_f
    ))
    AND (date_from_f IS NULL OR ko.updated_at >= date_from_f)
    AND (date_to_f IS NULL OR ko.updated_at <= date_to_f)
    AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
    AND (due_to_f IS NULL OR ko.due_at <= due_to_f);
$$;

COMMENT ON FUNCTION public.count_knowledge_objects IS 'Count objects matching dashboard search filters (RLS via auth.uid).';

CREATE OR REPLACE FUNCTION public.touch_object_view(p_object_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_object_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.knowledge_objects ko
  SET last_viewed_at = now()
  WHERE ko.id = p_object_id
    AND ko.user_id = auth.uid()
    AND ko.is_deleted = false;
END;
$$;

COMMENT ON FUNCTION public.touch_object_view IS 'Record that the current user opened their own object (for Resume).';

CREATE OR REPLACE FUNCTION public.create_domain(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Domain name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Domain name too long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.domains (user_id, name)
  VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tag(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tag name too long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tags (user_id, name)
  VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;

COMMENT ON FUNCTION public.create_domain IS 'Create or return existing domain for current user.';
COMMENT ON FUNCTION public.create_tag IS 'Create or return existing tag for current user.';

GRANT EXECUTE ON FUNCTION public.count_knowledge_objects TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_object_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_domain TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tag TO authenticated;
