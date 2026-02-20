-- User-defined AI API providers: name + provider type (openai/deepseek) + api_key.
-- Used by Run prompt when user selects a saved provider instead of server default.
-- Keys are stored in DB; only the edge function reads them (never sent to client).

CREATE TABLE IF NOT EXISTS public.user_ai_providers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('openai', 'deepseek')),
  api_key       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_providers_user_id ON public.user_ai_providers(user_id);

ALTER TABLE public.user_ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own user_ai_providers"
  ON public.user_ai_providers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_ai_providers IS 'Per-user AI API keys (OpenAI/DeepSeek) for Run prompt; keys only read server-side in edge function.';
