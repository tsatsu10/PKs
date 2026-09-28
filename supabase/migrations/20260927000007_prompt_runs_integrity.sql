-- D3: template deletion must not destroy run history.
ALTER TABLE public.prompt_runs DROP CONSTRAINT IF EXISTS prompt_runs_prompt_template_id_fkey;
ALTER TABLE public.prompt_runs
  ADD CONSTRAINT prompt_runs_prompt_template_id_fkey
  FOREIGN KEY (prompt_template_id) REFERENCES public.prompt_templates(id) ON DELETE SET NULL;

-- S13: runs may only reference readable objects and the caller's own templates.
DROP POLICY IF EXISTS "Users can manage own prompt_runs" ON public.prompt_runs;
CREATE POLICY "Users can read own prompt_runs"
  ON public.prompt_runs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own prompt_runs"
  ON public.prompt_runs FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own prompt_runs"
  ON public.prompt_runs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_read_object(knowledge_object_id)
    AND (prompt_template_id IS NULL OR EXISTS (
      SELECT 1 FROM public.prompt_templates pt
      WHERE pt.id = prompt_template_id AND pt.user_id = (SELECT auth.uid())
    ))
  );
CREATE POLICY "Users can update own prompt_runs"
  ON public.prompt_runs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_read_object(knowledge_object_id));

CREATE INDEX IF NOT EXISTS idx_prompt_runs_user_created ON public.prompt_runs(user_id, created_at DESC);
