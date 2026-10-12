-- PKS Phase 1: Supabase Auth + public.users (profile)
-- Run in Supabase SQL Editor or via supabase db push

-- public.users: one row per auth user (id = auth.uid())
-- No password_hash here; Supabase Auth handles that in auth.users
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT,
  display_name      TEXT,
  timezone          TEXT DEFAULT 'Africa/Accra',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- RLS: users can only read/update their own row
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Allow insert for own id (used by handle_new_user trigger and signup flow)
CREATE POLICY "Users can insert own row"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger: create public.users row when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'displayName', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Optional: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
