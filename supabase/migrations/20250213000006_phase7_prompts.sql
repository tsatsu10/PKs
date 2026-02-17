-- PKS Phase 7: Prompt Bank + Prompt Runs
-- Run in Supabase SQL Editor

-- prompt_templates: reusable prompt library per user
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  applies_to_types  TEXT[] DEFAULT '{}',  -- e.g. ARRAY['report','sop'] or empty = all
  prompt_text       TEXT NOT NULL,
  output_format     TEXT DEFAULT 'text' CHECK (output_format IN ('text', 'markdown', 'json')),
  tags              TEXT[] DEFAULT '{}',
  visibility        TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'org')),
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON public.prompt_templates(user_id);

-- prompt_runs: one row per run (object + template → output)
CREATE TABLE IF NOT EXISTS public.prompt_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_template_id  UUID NOT NULL REFERENCES public.prompt_templates(id) ON DELETE CASCADE,
  knowledge_object_id UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  output              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_runs_object ON public.prompt_runs(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_template ON public.prompt_runs(prompt_template_id);

-- RLS: prompt_templates
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prompt_templates"
  ON public.prompt_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS: prompt_runs
ALTER TABLE public.prompt_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prompt_runs"
  ON public.prompt_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at for prompt_templates
DROP TRIGGER IF EXISTS trg_prompt_templates_updated_at ON public.prompt_templates;
CREATE TRIGGER trg_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
