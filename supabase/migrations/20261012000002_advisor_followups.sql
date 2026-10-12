-- Follow-ups from the post-push Supabase advisors (2026-10-12).
--
-- rls_auto_enable() is Supabase's event-trigger helper; the baseline captured a GRANT to
-- authenticated, which exposes it at /rest/v1/rpc/rls_auto_enable. Event triggers don't need
-- EXECUTE for the caller, so revoking it changes nothing for DDL.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Covering indexes for foreign keys the advisor flagged. The export_jobs, export_job_items and
-- import_items FKs are left alone: −1B1 Task 11 drops those tables.
CREATE INDEX IF NOT EXISTS idx_prompt_runs_saved_object
  ON public.prompt_runs (saved_object_id) WHERE saved_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_share_invites_invited_by
  ON public.share_invites (invited_by);
