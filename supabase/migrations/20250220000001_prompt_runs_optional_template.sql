-- Allow prompt runs without a template (custom / ad-hoc prompts)
ALTER TABLE public.prompt_runs
  ALTER COLUMN prompt_template_id DROP NOT NULL;

COMMENT ON COLUMN public.prompt_runs.prompt_template_id IS 'Optional: set when run used a Prompt Bank template; null for custom prompts.';
