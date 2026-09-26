-- Allow Claude (Anthropic) keys in user_ai_providers alongside DeepSeek.
ALTER TABLE public.user_ai_providers
  DROP CONSTRAINT IF EXISTS user_ai_providers_provider_type_check;

ALTER TABLE public.user_ai_providers
  ADD CONSTRAINT user_ai_providers_provider_type_check
  CHECK (provider_type IN ('openai', 'deepseek', 'anthropic'));
