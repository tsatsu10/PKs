-- Multi-object export: one job can export multiple objects (export_job_items)

CREATE TABLE IF NOT EXISTS public.export_job_items (
  export_job_id       UUID NOT NULL REFERENCES public.export_jobs(id) ON DELETE CASCADE,
  knowledge_object_id UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (export_job_id, knowledge_object_id)
);

CREATE INDEX IF NOT EXISTS idx_export_job_items_job ON public.export_job_items(export_job_id);

ALTER TABLE public.export_job_items ENABLE ROW LEVEL SECURITY;

-- Users can manage items for their own export jobs
CREATE POLICY "Users can manage export_job_items for own jobs"
  ON public.export_job_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.export_jobs ej WHERE ej.id = export_job_id AND ej.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.export_jobs ej WHERE ej.id = export_job_id AND ej.user_id = auth.uid())
  );
