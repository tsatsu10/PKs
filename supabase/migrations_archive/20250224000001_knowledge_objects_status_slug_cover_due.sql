-- Knowledge objects: status, slug, cover_url, due_at, remind_at
-- Enables workflow (draft/active/archived), shareable URLs, thumbnails, and tasks/reminders.

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived'));

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;

-- Unique slug per user (allow null for legacy rows; backfill separately)
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_objects_user_slug
  ON public.knowledge_objects(user_id, slug)
  WHERE slug IS NOT NULL AND slug <> '';

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_status
  ON public.knowledge_objects(user_id, status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_due_at
  ON public.knowledge_objects(user_id, due_at)
  WHERE due_at IS NOT NULL AND is_deleted = false;

COMMENT ON COLUMN public.knowledge_objects.status IS 'Workflow: draft, active, archived. Default active.';
COMMENT ON COLUMN public.knowledge_objects.slug IS 'URL-friendly identifier, unique per user. Optional.';
COMMENT ON COLUMN public.knowledge_objects.cover_url IS 'Optional cover/thumbnail image URL for cards.';
COMMENT ON COLUMN public.knowledge_objects.due_at IS 'Optional due date for tasks/follow-ups.';
COMMENT ON COLUMN public.knowledge_objects.remind_at IS 'Optional reminder time.';
