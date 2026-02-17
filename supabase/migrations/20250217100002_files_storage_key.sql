-- Add storage_key to files for plan compliance (path in storage bucket)
-- Download can use storage_key when set, else fall back to computed path
-- Safe to run even if public.files does not exist yet (e.g. phase 6 not applied).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'files') THEN
    ALTER TABLE public.files ADD COLUMN IF NOT EXISTS storage_key TEXT;
    CREATE INDEX IF NOT EXISTS idx_files_storage_key ON public.files(storage_key) WHERE storage_key IS NOT NULL;
  END IF;
END $$;
