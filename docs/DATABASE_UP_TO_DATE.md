# How to know the database is up to date

## 1. Supabase CLI (recommended if you use it)

From the **project root** (where `supabase/` lives):

```bash
# Link to your remote project (one-time)
supabase link --project-ref YOUR_PROJECT_REF

# See which migrations are applied vs pending
supabase migration list

# Apply any pending migrations
supabase db push
```

- **Applied** = already in the database.
- **Pending** = not applied yet; run `supabase db push` to apply them.

If you don’t use the CLI and run SQL by hand in the Dashboard, use option 2.

---

## 2. Verification script (any setup)

Run the verification script in the **Supabase Dashboard → SQL Editor**:

1. Open **Supabase** → your project → **SQL Editor**.
2. Open the file **`supabase/verify_db_up_to_date.sql`** in your repo.
3. Copy its contents into the SQL Editor and run it.

You should see:

- **First result set**: 20 rows (one per required table). If any table is missing, that migration wasn’t applied.
- **Second result set**: 5 rows (one per required function). If any function is missing, the migration that creates it wasn’t applied.

If both result sets have the expected rows, the database is up to date with the migrations in the repo.

---

## 3. Expected tables (quick checklist)

In **Supabase → Table Editor**, confirm these **public** tables exist:

| Phase | Tables |
|-------|--------|
| 1 | `users` |
| 2 | `knowledge_objects`, `knowledge_object_versions` |
| 3 | `domains`, `tags`, `knowledge_object_domains`, `knowledge_object_tags` |
| 4 | (search uses `knowledge_objects` + FTS; no extra table) |
| 5 | `link_edges` |
| 6 | `files`, `knowledge_object_files` |
| 7 | `prompt_templates`, `prompt_runs` |
| 8 | `export_jobs` |
| 9 | `templates` |
| 10 | `notifications` |
| 11 | `audit_logs`, `share_permissions` |
| 12 | `integrations`, `import_items` |
| + | `export_job_items` (multi-object export) |

Plus:

- **Column**: `files.storage_key` (from `20250217100002_files_storage_key.sql`).
- **Functions**: `search_knowledge_objects`, `suggest_tags_for_object`, `suggest_tags_for_object_fallback`, `suggest_linked_objects`, `resolve_user_id_by_email`.

---

## 4. Applying migrations manually

If you don’t use `supabase db push`, run the migration files **in order** (by filename) in the SQL Editor:

1. `20250212000001_phase1_users.sql`
2. `20250213000001_phase2_knowledge_objects.sql`
3. … through …
4. `20250217200002_export_job_items.sql`

Order matters: later migrations depend on tables from earlier ones.

---

## Summary

- **CLI**: `supabase migration list` + `supabase db push`.
- **No CLI**: Run **`supabase/verify_db_up_to_date.sql`** in the SQL Editor and check that you get the expected tables and functions; then use the table/function checklist above if needed.
