-- Paste bin: user snippets (code/text). One table, RLS by user_id.
CREATE TABLE IF NOT EXISTS public.paste_bin (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paste_bin_user_created ON public.paste_bin(user_id, created_at DESC);

ALTER TABLE public.paste_bin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own paste_bin"
  ON public.paste_bin FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paste_bin"
  ON public.paste_bin FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paste_bin"
  ON public.paste_bin FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paste_bin"
  ON public.paste_bin FOR DELETE
  USING (auth.uid() = user_id);
