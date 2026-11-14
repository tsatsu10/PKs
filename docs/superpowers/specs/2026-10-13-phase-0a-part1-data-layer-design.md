# Phase 0a, part 1: data layer, errors and TypeScript — design

_Date: 2026-10-13. Roadmap: [Phase 0a](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md), items 1, 3 (prerequisites only) and 6. Audit IDs: B11, P1 (dedupe part), P5, D11, R8, R9, R10, R12, U9, T5._

## Goal

Every page reads data through one shared, persisted cache. Requests are deduplicated, a failed load shows an error with Retry instead of an empty list, data from the last visit appears at once, production errors are recorded, and errors read in plain language. Part 2 (optimistic edits, autosave, content model, the `ObjectDetail` split, Playwright) builds on this.

## Decisions

- **Error reporting stays inside our Supabase project.** Owner decision 2026-10-13: no third party. Implemented as a database RPC rather than an edge function (see [Error reporter](#error-reporter)).
- **Scope: all reads, not edits.** Writes keep their current imperative code and only invalidate the cache after they succeed.
- **TypeScript (roadmap decision 4): default accepted.** New files under `src/data/` are TypeScript, existing JavaScript in `src/lib/` and `src/hooks/` gets `checkJs`, and CI runs `tsc -b`.
- **Query layout: query modules with one key factory**, not a generic hook or per-feature hooks, so invalidation and part 2's optimistic updates have a single source of keys.

## Out of scope (part 2 or later)

Optimistic mutations, client-generated UUIDs, autosave and its indicator, the `content_json`/`content_text` model, splitting `ObjectDetail`, converting pages to TypeScript, chunk-load reload (R11), Playwright, and the dashboard rewrite with a single Home RPC (Phase 5).

## 1. Query client and persistence

**Query client** (`src/data/queryClient.ts`):
- `staleTime` 30 s, `gcTime` 7 days (must be at least the persister's `maxAge`, or saved entries expire with memory), `refetchOnWindowFocus: true` (off for `ObjectDetail`'s object query, see below).
- `networkMode: 'online'` (the default): queries pause while offline and resume on reconnect.
- Retry is decided by `classifyError()` (section 3): `permission`, `validation`, `not_found` and `conflict` never retry; `network` and `server` retry up to 2 times with backoff; `auth` (expired JWT) retries once, because supabase-js may be refreshing the token.
- Reads that may legitimately find nothing use `.maybeSingle()` and return `null`; "not found" is an empty state, not an error.

**Persistence:**
- Packages: `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval`.
- Stored in IndexedDB under `pks-query-cache:<userId>`. `buster` is a `CACHE_SCHEMA_VERSION` constant, bumped only when a persisted data shape changes (not on every deploy). `maxAge` 7 days.
- Persisted: successful queries whose key root is one of `objects`, `object` (every `ObjectDetail` panel except version history, which can hold 50 full copies), `taxonomy`, `templates`, `prompts`. Never persisted: search results, notifications, audit logs, errored or pending queries.
- `PersistQueryClientProvider` sits inside `AuthProvider` and is enabled once a session user id exists. On an offline boot the id comes from the local session (`verifyAndEnrichUser` returns `undefined` when it can't reach the server). Accepted: a revoked session reloaded on the same device can briefly show data already stored on that device before verification fails.

**Session lifecycle:**

| Event | Memory cache | Saved cache (IndexedDB) |
|---|---|---|
| Explicit logout (this tab or another) | cleared | that user's entry deleted |
| Session expiry | kept | kept |
| A different user signs in | cleared | other users' `pks-query-cache:*` entries deleted |
| The same user signs back in | kept | kept |

- Hooks into the existing `clearUserData()` and `claimUserData()` in `lib/userStorage.js`, so per-user cleanup stays in one place. This matches how drafts are treated: expiry keeps data because the same person usually signs straight back in.
- The memory cache is cleared whenever the signed-in user id changes, not only on logout (user A expires, user B signs in on the same tab).
- IndexedDB deletion is async and not awaited; that is safe because each user only reads their own key.

**Editor safety:** on `ObjectDetail`, `useObject` sets `refetchOnWindowFocus: false`, and the editor seeds from query data once per object id. A later background refetch never overwrites editor state. "Changed elsewhere" detection is part 2 (`revision`).

## 2. Query modules and page migration

**Layout** (`src/data/`, TypeScript):
- `keys.ts`: the only key factory, e.g. `qk.objects.list(filters)`, `qk.objects.count(filters)`, `qk.object.detail(id)`, `qk.object.tags(id)`, `qk.taxonomy.tags()`, `qk.dashboard.stats(tz)`, `qk.trash.page()`, `qk.notifications.unread()`.
- `unwrap.ts`: `unwrap({ data, error })` throws the Supabase error, otherwise returns `data`. Every fetcher uses it (fixes R10's ignored `.error`).
- `database.types.ts`: generated by `supabase gen types` (section 4).
- One module per area: `objects`, `objectDetail`, `taxonomy`, `dashboard`, `trash`, `templates`, `prompts`, `integrations`, `notifications`, `auditLogs`, `settings`, `pasteBin`, `journal`, `profile`, `suggestions`, `exports`. Each holds typed fetchers with explicit column lists (never `select('*')`, P5), `queryOptions()`, thin `useX` hooks, and named invalidation helpers (`invalidateObject(id)`, `invalidateObjectLists()`, `invalidateTaxonomy()` …). Pages never write raw keys.
- **Every Supabase read lives in `src/data`**, either as a query or, for one-off actions (export collectors, the links batch, `AuthContext`/Login/Register profile fetches), as a plain typed async function. (`lib/entities.js`, `objectView.js`, `audit.js` and `notifications.js` only write, so they stay.)
- **Owner filters stay.** Reads that filter `.eq('user_id', …)` today keep it, because RLS also returns rows visible through sharing. Hooks take the user id; keys don't include it, because the cache is per user.

**Migration by area:**

| Area | Change | Fixes |
|---|---|---|
| Dashboard, Search | `useObjects(filters)` / `useObjectsCount(filters)` with `placeholderData: keepPreviousData`; the key replaces manual fetching and stale-response handling. `prefetchQuery(qk.object.detail(id))` on row hover and focus. | B11, U9 |
| Dashboard extras | One key each for stats, activity, trailheads and the links batch; duplicate requests (e.g. `get_dashboard_stats` twice) collapse. No new RPC. | P1 (dedupe) |
| Taxonomy | `useTaxonomy()` loads domains and tags once for Search, dashboard filters, Settings, ObjectNew and the `ObjectDetail` pickers (QuickCapture and Import don't read taxonomy); fetches pages of 1,000 ordered by `name, id` until complete. | D11, duplicate fetches |
| `ObjectDetail` + `useObjectDetail` | `useObject(id)` plus one query per panel (tags, domains, files, backlinks/links, versions, shares, prompt runs, template). A failing panel shows its own error and Retry. Read calls in `ObjectDetail.jsx` (e.g. lines 292, 311, 333, 384) are swapped one-for-one; no restructuring. Prefetch on backlink hover. | R10 |
| Trash, Notifications, Audit logs | `useInfiniteQuery`, pages of 50, **keyset** cursor on `(sort_column, id)` so restore, delete or mark-read can't skip or repeat rows; each page stores the cursor it was fetched with; "Load more"; error states. | R9, D11 |
| Prompts, Templates, Integrations | Load the complete list (pages of 1,000 until done): they're configuration-sized, and PromptBank/Templates filter and collect tags in the browser, which "Load more" would break. Error states. | R9, D11, P5 |
| PasteBin | List query loads only list columns; content loads when an item opens; keyset paging. | P5, D11 |
| Journal | A month's entry dates and the open day's entry; nothing to page. The day entry seeds an editor, so it doesn't refetch on focus or reconnect. | R10-style |
| Notification bell | `qk.notifications.unread()` (there are no realtime subscriptions in the app). | R9 |
| Settings | Profile and AI-provider reads become queries; export collectors become plain fetchers in `data/exports.ts`. Taxonomy renames and merges call `invalidateTaxonomy()` and `invalidateObjectLists()`. | R10-style |

Pages stay `.jsx` and import the TypeScript hooks.

## 3. Errors, offline banner and error reporter

**Classifier** (`lib/errors.ts`, converted from `errors.js`; importers already omit the extension):
- `classifyError(err)` returns one of `offline`, `network`, `auth`, `permission`, `not_found`, `conflict`, `validation`, `rate_limited`, `server`, `unknown`.
  - `network` matches thrown TypeErrors and supabase-js error objects whose message is `Failed to fetch` (Chromium), `Load failed` (Safari) or `NetworkError when attempting to fetch resource` (Firefox); `offline` is the same while `onlineManager` reports offline.
  - `auth`: 401, JWT expired. `permission`: 42501 or RLS. `conflict`: 23505. `validation`: 22xxx, 23502, 23514, PGRST1xx/2xx. `rate_limited`: 429. `server`: 5xx.
  - Recognises `FunctionsHttpError` and `FunctionsFetchError`. When an edge-function response carries a known PKS error code (quota, caps), its existing message wins.
- `getErrorMessage(err, overrides?)` maps the kind to plain language, keeps the current RLS hint, and accepts per-call overrides (e.g. `{ conflict: 'A tag with that name already exists.' }`). Raw database and runtime messages never reach the screen. Messages written for people pass through unchanged: strings, plain `Error`s thrown by app code (e.g. "Name is required") and SQL `RAISE EXCEPTION` text (`P0001`, e.g. "Too many shares in the last hour").

**Surfaces:**
- `<QueryError error onRetry />`: inline message plus Retry, used by list pages and `ObjectDetail` panels.
- `notifyError(err, overrides?)`: shows the toast via `ToastContext` **and** reports the error. Every catch block around a write uses it (writes don't go through `useMutation` in part 1, so `MutationCache.onError` would never see them).
- `auth` errors in queries show nothing extra; `AuthContext` already redirects to `/login?reason=session_expired`.
- `<OfflineBanner />`: app-wide, driven by `onlineManager` (browser `online`/`offline` events). "You're offline. Showing saved data." then a brief "Back online"; paused queries resume. Accepted: on a network that claims to be online but isn't (captive portal), queries fail as `network` with Retry instead of the banner.

### Error reporter

**Database** (new migration):
- Table `client_errors`: `id`, `user_id` (default `auth.uid()`), `created_at`, `kind`, `message`, `stack`, `route`, `app_version`, `user_agent`, `fingerprint`. RLS on with no user policies; only the owner reads it (SQL / MCP).
- Indexes: `(user_id, created_at)` for the rate limit, `(created_at)` for the purge.
- `report_client_error(...)`: `SECURITY DEFINER`, `SET search_path = ''`, EXECUTE revoked from `public` and `anon`, granted to `authenticated`. Truncates fields (message 500 chars, stack 4 KB, user agent 200), drops the report silently above 30 per user per hour or 5,000 per day globally, and deletes rows older than 30 days (same pattern as `increment_run_prompt_rate_limit`).
- Why an RPC rather than an edge function: nothing to deploy, uses the caller's own JWT, rate limiting is plain SQL. Cost: errors before sign-in (Login, Register) are not recorded, because anonymous writes would be an abuse route under open signup.

**Client** (`lib/reportError.ts`):
- Reports kinds `server`, `unknown` and `permission` (after −1B's RLS hardening a 42501 on a normal page likely means a policy bug). Everything else is expected and not sent.
- Sources: `QueryCache.onError`, `notifyError`, React 19 `createRoot(el, { onCaughtError, onUncaughtError })` (covers the existing per-route `ErrorBoundary`s without changing them), and `window` `error` / `unhandledrejection`.
- Same fingerprint at most once per 60 s; at most 20 reports per session; dropped (not queued) while offline. Calls `supabase.rpc` directly and swallows its own failures, so it can never report itself.
- Scrubbing: `route` is the path only (query and hash removed; recovery tokens travel in the hash); emails, JWT-like strings and `(…)=(…)` value fragments removed from message and stack; PostgREST `details` never sent; no object content or request bodies.
- `__APP_VERSION__` is injected by Vite from `VERCEL_GIT_COMMIT_SHA`, falling back to `dev`.

## 4. TypeScript and CI

- **Configs** (following Vite's React-TS template): root `tsconfig.json` with `files: []` and references to:
  - `tsconfig.app.json`: `src/data/**`, `src/lib/errors.ts` and other new `.ts`; `strict: true`, `noEmit`, `tsBuildInfoFile`.
  - `tsconfig.js.json`: `src/lib/**/*.js`, `src/hooks/**/*.js` (tests excluded); `allowJs`, `checkJs`, `strict: false`, `noEmit`. Errors found are fixed in part 1. Pages are not included; if a hook imports a component, the plan handles that case explicitly.
- `src/vite-env.d.ts` declares `import.meta.env.VITE_*` and `__APP_VERSION__`.
- Dev dependencies: `typescript` pinned to `~6.0.3` (`typescript-eslint` 8.71 supports `<6.1.0`, not TypeScript 7), `typescript-eslint`.
- A typed view of the existing client (`src/data/client.ts`, `SupabaseClient<Database>`) so `src/data` queries are checked against the generated schema.
- **Generated types:** `npm run gen:types` runs `supabase gen types typescript --project-id qtsxnipmbuvfflifvusn > src/data/database.types.ts` (no Docker); the file is committed. The CI `database` job generates types from the PR's migrations (`--local`, after `supabase start`), uploads them as an artifact, and writes a job-summary **warning** if they differ from the committed file. It does not fail the job: an unpushed migration and Management-API vs CLI formatting differences would otherwise fail every migration PR. For a migration PR, commit the artifact's file.
- **Lint:** a `**/*.{ts,tsx}` block with `typescript-eslint` recommended (not type-aware) plus the existing react-hooks and react-refresh rules. A `no-restricted-syntax` guard outside `src/data/**` flags `supabase.from(…)` directly followed by `.select(` and `supabase.rpc(` for names not on a write allow-list in the config.
- **CI `frontend` job:** add `npm run typecheck` (`tsc -b`) between lint and test.
- **Bundle:** `check:bundle` has no size budget (it guards editor-chunk loading). The PR records the entry chunk's gzipped size before and after (expected +≈17 KB) and confirms the new packages are not pulled into the editor chunk.

## Testing

- **Persistence and session:** logout deletes the IndexedDB entry; user B never sees user A's cache, in memory or saved, including after A's session expired in the same tab; same user after expiry restores from cache; a restored cache renders an object with the network off.
- **Queries:** focus refetch does not reset an open editor; a filter change keeps previous rows (no skeleton); keyset "Load more" neither skips nor repeats after a restore or delete; a failing `ObjectDetail` panel shows its error while the others render.
- **Errors:** table test of every kind → classification → message, including the three browser network messages and Functions errors; `notifyError` both toasts and reports; scrubbing (query/hash, emails, JWTs, `(…)=(…)`); per-fingerprint dedupe and per-session cap.
- **pgTAP:** field truncation, per-user and global caps, signed-out callers rejected, users cannot read `client_errors`, 30-day purge.

## Exit criteria

- CI green: lint, `typecheck`, tests, build, `check:bundle`, `npm audit`, pgTAP, Deno; the types step shows no drift warning on the merge commit.
- The lint guard passes: no reads outside `src/data`.
- Manual production checks recorded in the PR: opening a cached object takes under 100 ms (`performance.mark`); a forced 500 appears as a row in `client_errors`; after logout no `pks-query-cache:*` entry remains in IndexedDB.
- Supabase advisors show no new errors after the migration is pushed.
