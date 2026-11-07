# Phase 0a part 1: owner hand-off

1. Back up production: `pg_dump` to `supabase/backups/pre-0a1-<date>.dump` (same command as the −1C runbook).
2. Push the migration: `supabase db push` (adds `client_errors` and `report_client_error`). Then `list_migrations` in the MCP shows `20261013000001`.
3. Regenerate types: `cd frontend && npm run gen:types`; commit if it changed (it will now include `client_errors`).
4. Advisors: run the Supabase security and performance advisors; expect no new errors.
5. Merge the PR; wait for the Vercel deploy of `pks2`.
6. Manual checks in production (record results in the PR):
   - Open an object, reload, open it again: `performance.mark` shows < 100 ms to content from cache (DevTools → Performance, or `performance.getEntriesByType('mark')`; measure with `performance.measure('open', 'pks:object-open', 'pks:object-visible')`).
   - Change a dashboard filter: the old rows stay until new ones arrive; no skeleton flash.
   - DevTools → Network → Offline: the offline banner appears, cached pages still open; back online shows "Back online."
   - Force a 500: in DevTools, block `*/rest/v1/rpc/get_dashboard_stats*` with a 500 response override, reload the dashboard, then query `select kind, message, route from client_errors order by created_at desc limit 5;` and see the row.
   - Log out, then DevTools → Application → IndexedDB → `keyval-store`: no `pks-query-cache:*` key remains.
7. Settings exports: run each of the three exports (full account JSON, backup JSON, Markdown ZIP) in `npm run dev` against your account and compare the downloaded file's structure with one exported from production before this change.
