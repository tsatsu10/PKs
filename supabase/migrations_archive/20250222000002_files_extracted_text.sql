-- Add extracted_text to files for full-text search / indexing of attachment content.
-- No backfill in this migration; populate via worker or on-demand when needed.

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS extracted_text TEXT;

COMMENT ON COLUMN public.files.extracted_text IS 'Plain text extracted from the file (e.g. PDF, DOCX) for search; populated by worker or on upload.';
