-- =============================================================================
-- PKS: Verify database is up to date (run in Supabase SQL Editor)
-- =============================================================================
-- READ-ONLY. Expect: 20 tables, 5 functions. If you see fewer, run the
-- missing migration(s) from supabase/migrations/ in order.
-- =============================================================================

-- 1) Tables that exist (you should see 20 rows)
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
    'import_items'
  )
ORDER BY table_name;

-- 2) MISSING tables (run this to see which migration to apply)
SELECT unnest(ARRAY[
  'users','knowledge_objects','knowledge_object_versions','domains','tags',
  'knowledge_object_domains','knowledge_object_tags','link_edges','files',
  'knowledge_object_files','templates','prompt_templates','prompt_runs',
  'export_jobs','export_job_items','notifications','share_permissions',
  'audit_logs','integrations','import_items'
]) AS expected_table
EXCEPT
SELECT table_name::text
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users','knowledge_objects','knowledge_object_versions','domains','tags',
    'knowledge_object_domains','knowledge_object_tags','link_edges','files',
    'knowledge_object_files','templates','prompt_templates','prompt_runs',
    'export_jobs','export_job_items','notifications','share_permissions',
    'audit_logs','integrations','import_items'
  );

-- 3) Key functions (you should see 5 rows)
SELECT 'function' AS kind, routine_name AS name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN (
    'search_knowledge_objects',
    'suggest_tags_for_object',
    'suggest_tags_for_object_fallback',
    'suggest_linked_objects',
    'resolve_user_id_by_email'
  )
ORDER BY routine_name;

-- 4) Optional: if you use Supabase CLI migrations, applied versions (may be empty if you ran SQL by hand)
-- Uncomment to see:
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
