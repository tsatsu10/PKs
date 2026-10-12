-- Security: import_register must only allow linking to objects the caller owns (or has write access to).

CREATE OR REPLACE FUNCTION public.import_register(
  p_integration_id     uuid DEFAULT NULL,
  p_source_identifier text DEFAULT NULL,
  p_knowledge_object_id uuid DEFAULT NULL,
  p_payload           jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_knowledge_object_id IS NULL THEN
    RAISE EXCEPTION 'knowledge_object_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = p_knowledge_object_id AND ko.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not own this knowledge object';
  END IF;

  UPDATE public.import_items
  SET knowledge_object_id = p_knowledge_object_id, payload = COALESCE(p_payload, '{}'::jsonb)
  WHERE user_id = auth.uid()
    AND (integration_id IS NOT DISTINCT FROM p_integration_id)
    AND source_identifier = p_source_identifier;
  IF FOUND THEN
    SELECT id INTO v_id FROM public.import_items
    WHERE user_id = auth.uid() AND (integration_id IS NOT DISTINCT FROM p_integration_id) AND source_identifier = p_source_identifier;
    RETURN v_id;
  END IF;
  INSERT INTO public.import_items (user_id, integration_id, source_identifier, knowledge_object_id, payload)
  VALUES (auth.uid(), p_integration_id, p_source_identifier, p_knowledge_object_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
