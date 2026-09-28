-- B8/D13: run-prompt writes one run row per call (completed or failed); clients stop inserting.
ALTER TABLE public.prompt_runs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS input_tokens int,
  ADD COLUMN IF NOT EXISTS output_tokens int,
  ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_object_id uuid REFERENCES public.knowledge_objects(id) ON DELETE SET NULL;

-- D8: create the output object, its link and the run back-reference in one transaction.
-- Idempotent per run, so double clicks and retries never create duplicates.
CREATE OR REPLACE FUNCTION public.save_prompt_output_as_object(p_run_id uuid, p_title text, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.prompt_runs;
  v_new uuid;
BEGIN
  SELECT * INTO v_run FROM public.prompt_runs WHERE id = p_run_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found' USING ERRCODE = '42501';
  END IF;
  IF v_run.saved_object_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.knowledge_objects WHERE id = v_run.saved_object_id AND NOT is_deleted) THEN
    RETURN v_run.saved_object_id;
  END IF;

  INSERT INTO public.knowledge_objects (user_id, type, title, content)
  VALUES (v_uid, 'prompt', left(coalesce(nullif(trim(p_title), ''), 'Prompt output'), 500), nullif(trim(p_content), ''))
  RETURNING id INTO v_new;

  IF public.can_edit_object(v_run.knowledge_object_id) THEN
    INSERT INTO public.link_edges (from_object_id, to_object_id, relationship_type)
    VALUES (v_run.knowledge_object_id, v_new, 'references')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.prompt_runs SET saved_object_id = v_new WHERE id = p_run_id;
  RETURN v_new;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_prompt_output_as_object(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_prompt_output_as_object(uuid, text, text) TO authenticated, service_role;
