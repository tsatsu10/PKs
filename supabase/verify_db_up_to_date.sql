-- =============================================================================
-- PKS: Verify database is up to date (run in Supabase SQL Editor)
-- =============================================================================
-- READ-ONLY. Expect: 24 tables, 20 functions. If you see fewer, run the
-- missing migration(s) from supabase/migrations/ in order.
-- =============================================================================

-- 1) Tables that exist (you should see 24 rows)
SELECT 'table' AS kind, table_name AS name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'knowledge_objects',
    'knowledge_object_versions',
    'domains',
    'tags',
    'knowledge_object_domains',
    'knowledge_object_tags',
    'link_edges',
    'files',
    'knowledge_object_files',
    'templates',
    'prompt_templates',
    'prompt_runs',
    'export_jobs',
    'export_job_items',
    'notifications',
    'share_permissions',
    'audit_logs',
    'integrations',
    'import_items',
    'journal_entries',
    'paste_bin',
    'user_ai_providers',
    'rate_limit_run_prompt'
  )
ORDER BY table_name;

-- 2) MISSING tables (run this to see which migration to apply)
SELECT unnest(ARRAY[
  'users','knowledge_objects','knowledge_object_versions','domains','tags',
  'knowledge_object_domains','knowledge_object_tags','link_edges','files',
  'knowledge_object_files','templates','prompt_templates','prompt_runs',
  'export_jobs','export_job_items','notifications','share_permissions',
  'audit_logs','integrations','import_items','journal_entries','paste_bin',
  'user_ai_providers','rate_limit_run_prompt'
]) AS expected_table
EXCEPT
SELECT table_name::text
FROM information_schema.tables
WHERE table_schema = 'public';

-- 3) Key functions (you should see 20 rows)
SELECT 'function' AS kind, routine_name AS name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN (
    'count_knowledge_objects',
    'create_domain',
    'create_tag',
    'get_dashboard_activity',
    'get_dashboard_stats',
    'get_object_links_batch',
    'handle_new_user',
    'import_get_existing_object',
    'import_register',
    'increment_run_prompt_rate_limit',
    'owns_knowledge_object',
    'resolve_user_id_by_email',
    'save_knowledge_object_version',
    'search_knowledge_objects',
    'search_knowledge_objects_with_snippets',
    'set_updated_at',
    'suggest_linked_objects',
    'suggest_tags_for_object',
    'suggest_tags_for_object_fallback',
    'touch_object_view'
  )
GROUP BY routine_name
ORDER BY routine_name;

-- 4) MISSING functions
SELECT unnest(ARRAY[
  'count_knowledge_objects','create_domain','create_tag','get_dashboard_activity',
  'get_dashboard_stats','get_object_links_batch','handle_new_user',
  'import_get_existing_object','import_register','increment_run_prompt_rate_limit',
  'owns_knowledge_object','resolve_user_id_by_email','save_knowledge_object_version',
  'search_knowledge_objects','search_knowledge_objects_with_snippets','set_updated_at',
  'suggest_linked_objects','suggest_tags_for_object','suggest_tags_for_object_fallback',
  'touch_object_view'
]) AS expected_function
EXCEPT
SELECT routine_name::text
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

-- 5) Stale search overloads (should return 0 rows after 20250805000001)
SELECT p.oid::regprocedure AS overload
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('search_knowledge_objects', 'search_knowledge_objects_with_snippets')
  AND p.pronargs <> 11;

-- 6) Optional: if you use Supabase CLI migrations, applied versions (may be empty if you ran SQL by hand)
-- Uncomment to see:
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
