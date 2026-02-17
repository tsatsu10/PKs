-- PKS Phase 8: Export Jobs (track export runs: queued → processing → completed | failed)
-- Run after phase 7 (prompts). References auth.users to match other tables.

DO $$ BEGIN
  CREATE TYPE export_format AS ENUM ('txt', 'md', 'pdf', 'docx', 'html', 'json');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE export_template AS ENUM ('raw', 'brief', 'full', 'stakeholder');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_object_id UUID REFERENCES public.knowledge_objects(id) ON DELETE SET NULL,
  format              export_format NOT NULL,
  template            export_template NOT NULL DEFAULT 'full',
  include_content     BOOLEAN NOT NULL DEFAULT true,
  include_summary     BOOLEAN NOT NULL DEFAULT true,
  include_key_points  BOOLEAN NOT NULL DEFAULT true,
  include_tags        BOOLEAN NOT NULL DEFAULT true,
  include_domains     BOOLEAN NOT NULL DEFAULT true,
  include_links       BOOLEAN NOT NULL DEFAULT true,
  filename            TEXT,
  status              export_status NOT NULL DEFAULT 'queued',
  storage_key         TEXT,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_id ON public.export_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON public.export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON public.export_jobs(created_at DESC);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own export_jobs"
  ON public.export_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
