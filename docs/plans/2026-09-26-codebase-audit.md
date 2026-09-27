# PKS Codebase Audit: Remove / Redo / Merge

_Date: 2026-09-26 · Companion to [the roadmap](./2026-09-26-ultimate-knowledge-base-roadmap.md)_

**Method:**
- Every file in `frontend/src`, `supabase/`, and the config/public/scripts folders was read in full.
- Findings were backed by import-graph and dependency-usage checks, a dead-CSS-class scan, and an inspection of `dist/`.
- `lint`, `test` (40/40 pass) and `build` were run.
- Headline claims were re-verified by hand (marked ✔).

**Verdicts:**

| Verdict | Meaning |
|---|---|
| **REMOVE** | Dead, useless, or harmful |
| **REDO** | Keep the capability but rebuild it differently |
| **MERGE** | Fold into another feature |
| **FIX** | A bug to fix in place |

**Estimated deletions:** ≈6,500 lines (~40% of the audited code and CSS):
- ~1,470 lines are dead code today
- ~1,200 lines are replaced by the planned architecture
- ~4,000 lines of CSS go away once shared UI primitives exist

---

## 1. Critical bugs (fix first, independent of the rebuild)

| # | Bug | Evidence | Fix |
|---|---|---|---|
| B1 ✔ | **Opening an object rewrites its `updated_at`.** `touch_object_view` UPDATEs the row, then the `set_updated_at` trigger fires. This corrupts "Updated" labels, sort order, stream buckets, Trash order and the pulse metrics. | `migrations/20250519000001:83-87`, `20250213000001:101-104`, `ObjectDetail.jsx:105` | A trigger `WHEN` clause that skips `last_viewed_at`-only updates (−1B). The name `object_views` is not used, to avoid clashing with Phase 5 `saved_views`. |
| B2 ✔ | **PDF export never prints, but reports success.** `window.open(..., 'noopener')` always returns `null`. | `ObjectDetail.jsx:948-957` | Print through a hidden iframe; show success only after it actually prints |
| B3 ✔ | **The 1.3 MB BlockNote chunk is preloaded on every page.** `main.jsx` imports `linkifyjs`, and `manualChunks` places it in the blocknote chunk. | `main.jsx:3`, `dist/index.html` modulepreload | Remove or relocate the linkify init; take `@mantine/*` and linkify out of that chunk |
| B4 | **Offline cold start is broken.** The entry depends on the blocknote chunk, which is excluded from precache and has no runtime cache. | `vite.config.js:49` | Precache it, or cache it StaleWhileRevalidate |
| B5 ✔ | **Typing `?` inside the editor opens the shortcuts modal and eats the character.** | `AppLayout.jsx:75` | Skip when `isContentEditable` is true |
| B6 | **Due/remind times drift by the UTC offset on every save.** `datetime-local` is fed `iso.slice(0,16)` and parsed back as local time. | `ObjectDetail.jsx:118→313`, `:1180` | Use one shared date utility |
| B7 | **Duplicate UI.** "Version history" renders twice, and so do "Run prompt" and "+ Link to object". | `ObjectDetail.jsx:1394/1496`, `:1289/1411`, `:1447/1472` | Remove the duplicates |
| B8 | **Each prompt run creates 2 `prompt_runs` rows.** Generate inserts one, then Save inserts another. | `ObjectDetail.jsx:655-667, 735-741, 779-785` | Have the server own the run row |
| B9 | **Template dropdown options can't be typed.** A comma is stripped on every keystroke. | `Templates.jsx:582-588` | Parse the options on blur |
| B10 | **ObjectNew draft restore is wiped** by the template-reset effect. | `ObjectNew.jsx:90-99` vs `:108-110` | — |
| B11 | **Search fetches twice on submit** and has no stale-response guard (the last response to arrive wins). This also happens on dashboard mount. | `Search.jsx:98-121`, `useDashboardPage.js:252-350` | TanStack Query keys |
| B12 | **Journal "Back to calendar" silently discards unsaved text.** | `Journal.jsx:134-139` | — |
| B13 | **Editors can edit content but can't manage domains, tags or links.** The UI shows them link search anyway. | `ObjectDetail.jsx:1127` vs `:1309/1336/1466` | — |
| B14 | **Join-insert and storage errors are ignored, leaving orphaned files and silently missing tags.** Detach never deletes the storage object. | `ObjectDetail.jsx:428-437, 592-594, 619`; `ObjectNew.jsx:164-173`; `Settings.jsx:207,222,324` | — |
| B15 | **Version trigger breaks writes that don't come from a user.** `edited_by = auth.uid()` is NOT NULL, so service-role, cron and MCP updates fail. | `20250213000001:36-47,107-130` | Make it nullable with `ON DELETE SET NULL` |
| B16 | **Dashboard "today" is computed in UTC**, not the user's timezone. This affects presets, stats, activity and the audit-log date filters. | `useDashboardPage.js:261`, `get_dashboard_stats`, `AuditLogs.jsx:31` | — |
| B17 | **Settings export `.in(ids)` isn't chunked.** It will hit the URL length limit on large libraries. | `Settings.jsx:306-461` | — |
| B18 | **Webhook bugs:** 4xx/5xx responses count as "delivered"; the HMAC has no timestamp (replayable); the in-memory rate limit doesn't work across instances. | `webhook-deliver:262,283,298,143-165` | — |
| B19 | **run-prompt consumes quota before validating input**, so malformed requests burn the daily cap. | `run-prompt/index.ts:343` vs `:378` | — |
| B20 | **CSS tokens that are used but never defined.** `--accent` and `--accent-primary` have no fallback, so those styles are silently lost. | `ObjectDetail.css:176,226,1075` | — |

## 2. REMOVE (dead or useless)

### Frontend code and files

- `components/MarkdownEditor.jsx` + `.css`, `components/MarkdownContent.jsx`, `components/FormField.jsx`: imported nowhere ✔
- `lib/imports.js` (never imported) and `lib/performance.js` (no callers)
- `components/MainMenuDeck.jsx` + `.css` + `MainMenuDeckContext.jsx` (~480 lines):
  - a third navigation system (radial wheel)
  - its hidden `role=menu` keeps focusable links
- `features/dashboard/components/DashboardCommandPalette.jsx`: the second Ctrl+K; its "objects" list is just the first 5 rows on the page
- `components/DashboardQuickAddForm.jsx`: the third quick-capture path
- **Pulse rings, celebration, targets, sparklines:**
  - Files: `Hero/PulseRings`, `usePulseMetrics`, `usePulseCelebration`, `Settings/PulseTargetsForm`, ActivityPulse sparklines
  - Why remove: the celebration **can never fire in real use**. Metrics load once per mount, and capturing navigates away from the dashboard.
  - It also measures the wrong things: views count as "tend" because of B1, and it rewards volume over quality.
- `pages/About.jsx`: stale "What's new", placeholder GitHub link. Fold into a Help item in the palette.
- `pages/ObjectBySlug.jsx` and the `/objects/by-slug` route: nothing links to them, and slugs are unstable. The `[[title]]` resolver replaces them.
- **Export bookkeeping and its polling loop:**
  - The export-jobs polling loop and all `export_jobs` writes in ObjectDetail (`:157-186`, `:911-927`) and `useDashboardBulkActions.js:114-133`
  - The rows are written by the client around a local download; nothing processes them
  - A job only stays pending if the tab dies, after which the page polls every 3 s forever
- `Integrations` **generic** type plus its API/import documentation: it writes rows nothing reads (webhooks stay)
- `PromptBank.output_format`: stored but never sent to run-prompt
- **Dead exports and state:**
  - `routeConfig` export marked @deprecated (no importers, not even tests)
  - Journal `entry` state
  - `getStream*Height`, `useLinkedObjects`, `updateTargets`, `clearCelebrate`
  - bulk remove domain/tag handlers and their 2 unreachable modals
  - `OBJECT_TYPE_ICONS`, `AUDIT_ACTION_LIST`
  - `window.__reportError`
- **Assets and scripts:** `assets/react.svg`, `public/vite.svg`, `public/manifest.json` (a duplicate of the VitePWA manifest), and `scripts/split-dashboard.mjs`, `patch-dashboard-view.mjs`, `extract-dashboard-hooks.mjs` (one-off codemods, 468 lines)
- **Dead CSS (~870 lines):**
  - Dashboard.css: 41 classes, ~450 lines
  - ObjectDetail.css: 17 classes, ~185 lines
  - ObjectForm.css: `template-picker*` and `w-md-editor*`, ~105 lines
  - `.back-link` in 6 files
  - `.markdown-content`

### Dependencies

- Remove now:
  - `@mantine/utils` (v6, imported nowhere)
  - `@uiw/react-md-editor`, `react-markdown`, `remark-gfm` (only the dead components use them)
  - `@types/dompurify` (dompurify ships its own types)
- Remove after the rebuild:
  - `marked` and `dompurify`, once HTML export uses BlockNote's own exporter
  - `@mantine/hooks`, once there is a `ui/Dialog` focus trap
- `linkifyjs`: imported but undeclared. Declare it or drop it.

### Database

- `export_jobs`, `export_job_items` and 3 enums (`export_format`, `export_template`, `export_status`)
- `import_items` and the `import_get_existing_object` / `import_register` RPCs (never called)
- ~~`files.extracted_text`~~ **KEEP (revised).** Nothing writes it yet. The search guard `extracted_text IS NOT NULL` makes today's cost near zero, but it will run a per-row `to_tsvector` once populated. Phase 1 fills it, and adds a stored tsvector plus a GIN index first.
- `knowledge_objects.key_points`: no editing UI; move it into `properties`
- `prompt_templates.visibility` (there are no orgs) and `prompt_templates.version` (never incremented)
- The **INSERT policy on `knowledge_object_versions`**, which lets clients forge version rows
- **~14 redundant indexes:**
  - global `is_deleted` / `type` / `updated_at`
  - PK-prefix duplicates on kod/kot/kof/link_edges/share_permissions/export_job_items/versions
  - global `created_at` on notifications and audit_logs
  - `files.storage_key`
- **Supabase scripts and config:**
  - `supabase/scripts/apply-link-edges-only.sql`, which duplicates a migration
  - `repair-migration-history.ps1` (remove after the squash; it passes the DB password on the command line)
  - `verify_db_up_to_date.sql`, which is stale; replace it with pgTAP
  - `frontend/supabase/`, a stray `supabase init`; move a corrected `config.toml` to the root `supabase/`

## 3. MERGE

| From | Into | Why |
|---|---|---|
| `CommandPalette` + `DashboardCommandPalette` + Search page + CommandBar `/` + ObjectDetail link search | **One Ctrl+K palette** | 5 overlapping search and command surfaces. The nav list is defined 3× (`AppLayout:15`, `MainMenuDeck:5`, `CommandPalette:6`). Trash is missing from both nav menus. |
| `QuickCapture.jsx` + dashboard quick-add (4 triggers) + ObjectNew "Create" | **Global capture modal → Inbox** | 3 implementations with different side effects: slug, notification, webhook |
| `journal_entries` table + `Journal.jsx` | Objects of type `daily` (BlockNote) | Today a plain textarea that search, links and RAG can't reach |
| `paste_bin` table + `PasteBin.jsx` | Objects of type `snippet` | Same reason. Its "Create your first paste" button does nothing (`PasteBin.jsx:150`). |
| `templates` table + `Templates.jsx` | An `object_types` table with `property_schema` | Template values are flattened into content text today, so views can't query them |
| `BlockNoteViewer` + `BlockNoteMantineProvider` | A lightweight read-only renderer (Phase 0a) | A second full editor plus a second provider just for read-only display |
| `lib/deepseekKey.js` + `lib/aiProviders.js` | `lib/ai.js` | Tangled validators |
| `lib/objectView.js`, `storage.js`, `slugify.js` | An objects/files API module; slug generated by a DB trigger | 4 different slug behaviors across create paths |
| `suggest_tags_for_object` + `_fallback` | One RPC | — |
| `rate_limit_run_prompt` + `server_key_daily_usage` | One `ai_usage` table, cleaned up by pg_cron | Near-identical counters |
| Trailheads (Resume/Pending/Spark) + trending tags + recent links | **Home** widgets: Recently viewed, Due (status-aware), Trending | Keep the useful parts |
| `constants/index.js` type maps + `typeMarks.js` | One object-type registry, sourced from `object_types` | 3 parallel maps |
| 4 export implementations (ObjectDetail `:806-1042`, Settings `:306-461`, bulk actions, `lib/export`) | One `lib/export` with a single `downloadBlob` | Domain/tag mapping pasted 3× |
| Duplicated domains/tags fetches (16 sites) and pickers (ObjectNew ×2, ObjectDetail, EntityComboBox) | `useTaxonomy()` query + `ui/TaxonomyPicker` | — |
| 13 global keydown listeners | One shortcut registry | Conflicts: `/`, bare `1/2/3`, Ctrl+Shift+R (collides with hard reload), a phantom `c` shortcut |
| `run-prompt` + `webhook-deliver` boilerplate | `supabase/functions/_shared/` (cors, auth, http, client) | Copy-pasted code; CORS fails open to `*` |

## 4. REDO (keep the capability, rebuild it)

### Frontend

- **`ObjectDetail.jsx` (1,549 lines, ~35 `useState`s):** rebuild as `features/object/` panels (Header, Properties, Editor, Backlinks, Attachments, History, AI).
  - Autosave on BlockNote JSON
  - TanStack mutations
  - Export builders move out to `lib/export`
- **`hooks/useObjectDetail.js`:**
  - Today: 5 sequential round-trips, the same row fetched twice, 50 versions loaded with full content, 200 objects loaded for a picker
  - Rebuild: parallel queries plus lazy panels
- **`hooks/useDashboardSearch.js` and `useDashboardPage.js`:**
  - Today: ~100 returned values, 9 filter `useState`s, a manual race guard
  - Rebuild: one query keyed on a filter object in the URL, plus **DB saved views** replacing the localStorage saved filters, view mode and density
- **`DashboardView.jsx`:** collapse the 5 duplicated filter UIs and the duplicated pagination into a Home page plus a saved-view page
- **`BlockNoteEditor.jsx`:**
  - Save JSON rather than `blocksToMarkdownLossy` on every keystroke
  - Debounced autosave with an IndexedDB draft/outbox (replacing sessionStorage `draftStorage`)
  - Add `[[` and `@` suggestion menus and `uploadFile`
- **`NotificationCenter.jsx`:**
  - Today: 2 separate unread-count queries, no focus trap, a setTimeout click-outside hack; ObjectDetail renders a second bell (`:1125`)
  - Rebuild: TanStack Query + Realtime
- **`ObjectDetailRunPromptPanel.jsx` (28 props):** make it self-contained, with streaming output
- **`Notifications.jsx` / `AuditLogs.jsx`:** feed them from DB triggers. Today they are self-noise and forgeable, and many actions (bulk, restore, links, tags) are never logged.
- **`Settings.jsx` (751 lines):** split into sections, move the export out, add confirmations for domain/tag deletes, make timezone a picker instead of free text
- **`Import.jsx`:** route through the shared create path, split on any heading level, output BlockNote JSON; add Obsidian/Notion/JSON-restore importers later
- **`AuthContext.jsx`:**
  - Drop `supabase` from the context value
  - Remove the hardcoded `Africa/Accra`
  - Load the profile as a query
  - Revisit the `noOpLock` multi-tab refresh race in `lib/supabase.js`
- **`ToastContext.jsx`:** memoize the value; fix the `role=alert`/`aria-live` conflict and the region-name collision; clear timers
- **UI layer:**
  - Build `components/ui/` (Button, IconButton, Card, Dialog/ConfirmDialog, Popover, Field/Input/Select, Combobox, Tabs, Badge, EmptyState, Spinner, Pagination, Toaster, Kbd) and switch to **Lucide** icons
  - Replaces 11 overlay implementations, 36 empty-state selectors, 12 card variants, 23 page-specific button classes, 3 identical spinner keyframes and `window.confirm` in 4 places
- **Lint:**
  - `varsIgnorePattern '^[A-Z_]'` hides unused components. **Correction (verified):** this is Vite's default. Core `no-unused-vars` doesn't count JSX usage, so simply removing the pattern flags every component (166 false errors). The right fix is `eslint-plugin-react` with `react/jsx-uses-vars`, then narrowing the pattern to `^_`. That is done in Phase 0.
  - Add `jsx-a11y`
  - Ban components→features imports with `no-restricted-imports`
  - Add stylelint with strict token values
- **PWA and HTML:**
  - One manifest with PNG 192/512 icons and a maskable icon
  - Self-host the font, which lets the CSP drop `'unsafe-hashes'` and the Google Fonts entries
  - Move the inline theme script to `/theme-init.js`, removing the hash coupling
- **`vercel.json`:**
  - Narrow `img-src`
  - Add COOP and HSTS preload
  - `immutable` caching on `/assets`
  - Stop rewriting missing static files to index.html

### Database and edge functions

- **`knowledge_objects`:**
  - `content_json` becomes the source of truth, with a trigger-derived `content_text`
  - Add `properties` JSONB
  - Replace `is_deleted` with `deleted_at` (and a pg_cron purge)
  - `type` becomes text FK → `object_types` (enum values can't be removed, and `ADD VALUE` wasn't idempotent)
  - Rebuild `fts` from `content_text` plus properties
- **Versioning:** a coalescing trigger (≤1 snapshot per ~10 min per editor, or an explicit checkpoint) that also snapshots `content_json`
- **Search:** replace the 3 copy-pasted RPCs (8 historical definitions) with one `search_objects`:
  - SECURITY INVOKER
  - `websearch_to_tsquery` + `ts_rank_cd`
  - pg_trgm on title
  - a lean column list (today it ships the `fts` tsvector and full content)
  - keyset paging
  - later, hybrid RRF with pgvector
- **`link_edges`:** add `origin` (manual/inline) and `user_id` for cheap RLS, plus an index on `(user_id, lower(title))` for link resolution
- **Side-effect tables:** `notifications`, `audit_logs`, `prompt_runs` and webhooks become **server-authored** (triggers, edge function, pgmq outbox), and client INSERT policies are removed
- **`integrations`:** becomes `webhooks` + `webhook_deliveries`, with retries and a log
- **Reminders:** add `reminded_at` and a pg_cron job; make "today" use `users.timezone`
- **RLS:**
  - `(select auth.uid())` everywhere
  - `can_read_object` / `can_edit_object` helpers with `TO authenticated`
  - collapse the duplicate permissive policies
  - storage: shared-read access, bucket size and MIME limits, orphan cleanup
- **Taxonomy:** case-insensitive unique domain and tag names
- **AI keys:** move them to Vault; drop `openai` from the CHECK (or implement it)
- **`run-prompt`:**
  - SSE streaming
  - accept `object_id` instead of client-sent content, and fetch it under RLS
  - validate before consuming quota
  - log errors
  - pin dependencies in `deno.json`
  - CORS fails closed
- **`set_updated_at`:** add `SET search_path` (Supabase linter warning)
- **Migrations:** squash 46 migrations into a verified baseline, then ship the rebuild as forward migrations. Procedure:
  1. Dump the database.
  2. Diff against a local reset.
  3. Write the baseline.
  4. Move the old migrations to `migrations_archive/`.
  5. Run `migration repair`.
  6. Confirm the diff is empty.

## 5. KEEP (good foundations)

- **Frontend:**
  - Lazy routes with ErrorBoundaries
  - The auth pages
  - Trash
  - ProtectedRoute
  - Skeletons
  - TypeMark
  - Breadcrumbs (moving into ui)
  - `lib/csv`, `lib/errors`, `lib/entities`
  - The dashboard `TableView`/`TimelineRow`/`streamBuckets` renderers, which carry over as saved-view renderers
  - LinkedBar with batched link loading
  - The filter-chip model
- **Database:**
  - Share permissions (RLS fixed recently)
  - `get_object_links_batch`
  - The ownership guard trigger
  - The column-level grant hiding AI keys
  - The webhook SSRF guard
- **Tests:** the existing unit tests (they pass)

---

# Second pass: cross-cutting audit

_Covers security, reliability, performance, accessibility, mobile, UX, dependencies and dev tooling. These are new findings only; nothing here repeats §1–5. ✔ = re-verified by hand._

## 6. Security

| # | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|
| S1 ✔ | **High** | **Share-by-email can be hijacked with an unverified account.** `resolve_user_id_by_email` doesn't check `email_confirmed_at`, and the repo config has `enable_confirmations = false`. An attacker who signs up as `ceo@victim.com` receives everything later shared with that address. | `20260926000001:100-114`; `frontend/supabase/config.toml:157` | Add `AND email_confirmed_at IS NOT NULL`, and enable confirmations in the hosted project. **Verify the hosted settings in the dashboard.** |
| S2 | **High** | **The server's Claude key can be drained.** Any user can choose Opus with 16k max tokens. The quota is shared across providers, signup is open with no CAPTCHA, and `promptText` is arbitrary, so the app works as a free LLM proxy. | `run-prompt/index.ts:36-41,114-122,281-303` | Use a cheaper model for server keys, give Claude its own small quota, add a global daily spend cap, and add CAPTCHA plus email confirmation |
| S3 | Med | **`get_dashboard_activity` (SECURITY DEFINER) leaks titles of objects the caller can't read** through `recent_links`, and keeps leaking them after a share is revoked. | `20250521000001:125-149` | Make it INVOKER, or only return titles the caller can read |
| S4 | Med | **Viewers can read the full version history, including content from before the share.** | `20260926000001:85-94` | Limit history to owners and editors, or to versions created after the share |
| S5 | Med | **Anyone can check whether an email is registered, and shares arrive without consent.** Every user passes the resolver's gate, and recipients never accept a share. | `20260926000001:101-114` | Use pending invites and rate-limit lookups |
| S6 | Med | **`cover_url` can be used as a tracking pixel.** Editors can set it, and the CSP allows `img-src https:`. | `DashboardObjectCard.jsx:75`; guard `20260926000001:53-75` | Store covers in Storage, narrow `img-src`, and make the column owner-only |
| S7 | Med | **The webhook secret is returned to the browser** (plaintext in `integrations.config`). | `Integrations.jsx:23-26` | Make it write-only (Vault or a column grant) |
| S8 | Med | **Webhooks can be used to amplify traffic.** Integrations per user are unlimited, and the client supplies the event and payload (up to 1 MB), which PKS then signs. | `webhook-deliver/index.ts:239-296` | Cap integrations per user and build payloads on the server |
| S9 | Low | **Trashed objects stay readable and editable by shared users.** The SELECT and UPDATE policies don't check `is_deleted`. | `20260926000001:17-48` | Add the check to the shared branch |
| S10 | Low | **Editors can change metadata beyond content:** `created_at`, `current_version`, `slug`, `status`, `type`, `cover_url`. | guard `20260926000001:53-75` | Allow-list the columns editors may change |
| S11 | Low | **Logout leaves per-user data in the browser** (drafts, saved filters, prompt template), so the next user in the same tab inherits it. | `AuthContext.jsx:156-162`; `lib/draftStorage.js` | Key storage by user id and clear it on logout |
| S12 | Low | **Password change is only checked in the browser** (`secure_password_change = false`). | `Settings.jsx:117-130`; `config.toml:159` | Enable reauthentication for password changes |
| S13 | Low | **Side tables such as `prompt_runs` don't check that the caller owns the object on insert.** | `20250213000006:47-50` | Add `owns_knowledge_object()` to the WITH CHECK |
| S14 | Low | **CSP `connect-src https://*.supabase.co`** lets an XSS send data to an attacker's own Supabase project. | `vercel.json` | Pin the exact project host |
| S15 | Low | **Shared content can carry prompt injection.** Output has no tools, so impact is limited. | `run-prompt/index.ts:337-340` | Label AI output as untrusted |

**Checked and clean:**
- No `dangerouslySetInnerHTML` anywhere.
- HTML export is sanitized.
- No open redirect.
- Storage paths are safe, and signed URLs last 60 s.
- The column grant on AI keys holds.
- Git history has no real secrets (only test fixtures).

## 7. Dependencies ✔

- **All dependencies:** `npm audit` reports **28 vulnerabilities (1 critical, 15 high)**. All are fixable without breaking changes via `npm audit fix`.
- **Production only: 9 (4 high):**
  - `@tiptap/core` ≤3.30.4: `__proto__` becomes a DOM attribute. This is relevant because shared content renders in BlockNote.
  - `linkify-it`: ReDoS.
  - `nanoid` (via docx).
  - `ws`.
- **Outdated:**
  - BlockNote 0.46 → **0.55** (clears the tiptap and uuid issues)
  - supabase-js 2.95 → 2.117
  - vite 7.3.1 → 7.3.6 (dev-server CVEs; the critical one is in vitest)

## 8. Reliability & data integrity

| # | Issue | Evidence | Fix |
|---|---|---|---|
| R1 | **Every tab refocus wipes and reloads the profile.** auth-js emits `SIGNED_IN` whenever the tab becomes visible, which costs 2 requests and **resets Settings form edits**. | `AuthContext.jsx:163-178`; `Settings.jsx:71-75` | Treat `SIGNED_IN` for the same user id as a no-op |
| R2 | **Boot verifies the user twice** (4 auth/profile requests on a cold load). | `AuthContext.jsx:154-178` | Use `INITIAL_SESSION` only |
| R3 | **Logging out while offline doesn't remove the token**, so a reload logs the user back in. | `AuthContext.jsx:156-162` | Fall back to `signOut({scope:'local'})` |
| R4 | **A deliberate sign-out shows "session expired"**, and the next user to log in is sent to the previous user's page. | `AuthContext.jsx:117-120,171-174` | Reset `hadUserRef` and drop `from` on explicit logout |
| R5 | **After a deploy, the PWA reloads every open tab, even mid-edit.** | `vite.config.js:29`; `main.jsx:6-13` | Switch to `registerType:'prompt'` with an update toast, and defer the reload while a form has unsaved changes |
| R6 | **Draft restore silently overwrites newer server versions.** The draft doesn't store which version it started from, and the app's own "reload" advice triggers the overwrite. | `ObjectDetail.jsx:125-134,322-326` | Store `base_version` with the draft and show a diff or choice when it doesn't match |
| R7 | **An update blocked by permissions (RLS) is shown as "changed elsewhere".** | `ObjectDetail.jsx:132,322-326` | Only restore drafts when `canEdit`, and re-check permission when 0 rows are updated |
| R8 | **Users see raw errors** ("Failed to fetch", "duplicate key value…", "JWT expired"), and the app never detects being offline. | `lib/errors.js:10-19` | Map these errors to plain messages and add an offline banner |
| R9 | **Six list pages turn a fetch error into an empty list** (e.g. "No prompts yet"). | `PromptBank.jsx:64`, `Templates.jsx:61`, `Integrations.jsx:29`, `Notifications.jsx:30`, `AuditLogs.jsx:34`, `NotificationCenter.jsx:49` | Show an error state with Retry |
| R10 | **None of the 11 object-detail queries checks `.error`**, so a partial failure looks like "no tags" or "no files". | `useObjectDetail.js:70-124` | Show an error in each panel |
| R11 | **The object-route error boundary never resets when you open a different object.** It also can't recover from a failed code-chunk load, and claims "We've recorded the error" when nothing is recorded. | `routeConfig.jsx:14,55-70`; `ErrorBoundary.jsx:32-39` | Reset per route, reload on ChunkLoadError, and fix the message |
| R12 | **No error reporting in production.** All logging only runs in dev builds. | `lib/audit.js:40` etc. | Add Sentry or a small edge-function reporter |
| R13 | **Missing environment variables give a blank white page**, because the error is thrown at module level. | `lib/supabase.js:6-8` | Show a config-error screen |
| R14 | **Claude requests can outlive the Edge Function limit** (~240 s worst case vs 150 s), and content over 50k characters is silently truncated. | `run-prompt/index.ts:20,24,112,335` | `maxRetries:0`, and return a `truncated` flag the UI can show |
| R15 | **Downloads can be cancelled because the file URL is revoked immediately.** `downloadBlob` does this synchronously, and there are 5 copies of it. | `ObjectDetail.jsx:978`; bulk `:175`; `Settings.jsx:365,410,452` | One shared helper: append the link, click, then revoke later |
| R16 | **Popup blockers drop attachment downloads**, because `window.open` runs after an `await`. | `ObjectDetail.jsx:603-613` | Open the window synchronously |
| R17 | **Import calls `file.text()` outside the try block**, with no file-size cap. | `Import.jsx:74-76` | Move it inside the try and cap the size |
| D1 | **Metadata edits have no concurrency guard, and each save writes every field.** A save in tab A reverts tab B's status or due date, and an editor's save overwrites the owner's metadata. | `ObjectDetail.jsx:305-320`; `20250213000001:136` | Send only changed fields, and version all user-visible columns |
| D2 | **Journal and PasteBin are last-write-wins.** This goes away once they merge into objects. | `Journal.jsx:113`; `PasteBin.jsx:60` | — |
| D3 ✔ | **Deleting a prompt template also deletes all its run history** (ON DELETE CASCADE). | `20250213000006:26` | `ON DELETE SET NULL` |
| D4 | **Permanently deleting from Trash leaves `files` rows and storage objects behind forever.** | `20250213000005:13,24`; `Trash.jsx:65-83` | Delete through an RPC that cleans up storage, or run an orphan-sweeper cron |
| D5 | **Account deletion will fail** because of the `edited_by` foreign key, and nothing purges the user's storage. | `20250213000001:44` | `SET NULL` plus a storage purge |
| D6 | **`get_object_links_batch` filters trashed objects after ranking**, so "+N more" is wrong and links go missing. | `20250521000001:29-41,66` | Filter inside the CTE |
| D7 | **Links to trashed objects look like normal links.** | `useObjectDetail.js:93,133` | Filter them out or badge them |
| D8 | **"Save AI output as object" isn't atomic**, so a retry creates duplicates. | `ObjectDetail.jsx:765-786` | One transactional RPC |
| D9 | **A partially failed import can't be safely retried** (no idempotency key). | `Import.jsx:101-117` | Report the failed rows and dedupe on a hash |
| D10 | **Bulk ZIP export silently overwrites files that share a name** (same titles, or non-Latin titles such as all-CJK → `-.md`). | `useDashboardBulkActions.js:167-170` | Add an id suffix to each filename |
| D11 | **Unpaginated lists silently stop at 1000 rows** (Trash, prompts, templates, domains/tags). | `Trash.jsx:26`; `config.toml max_rows` | Paginate |
| D12 | **Drafts aren't scoped to a user** (same as S11). | `lib/draftStorage.js:6-11` | — |
| D13 | **Closing the tab mid-run leaves `prompt_runs` rows stuck on `running`.** | `ObjectDetail.jsx:655-667` | Have the server own the run row |

## 9. Performance

| # | Issue | Evidence | Fix |
|---|---|---|---|
| P1 | **The dashboard makes about 18 requests on mount**, including `get_dashboard_stats` twice. | `useDashboardPage.js:147`; `usePulseMetrics.js:53` | One Home RPC, plus TanStack Query dedupe |
| P2 | **Every search keystroke re-renders all dashboard cards.** `runSearch` gets a new identity each time, about 100 props are passed down, and rows aren't memoised. | `useDashboardSearch.js:216`; `DashboardView.jsx:427` | Keep filter state in a ref and memoise rows |
| P3 | **Every editor keystroke re-renders all 1,550 lines of ObjectDetail**, and the viewer rebuilds MantineProvider from an inline theme object. | `ObjectDetail.jsx:293`; `BlockNoteMantineProvider.jsx:8` | Debounce content in a ref and hoist the theme object |
| P4 | **18 unused Inter font files (355 KB) are precached.** | `BlockNoteEditor.jsx:2`, `BlockNoteViewer.jsx:2` | Drop the import and the woff glob |
| P5 | **Queries fetch more than they need.** PasteBin's list loads full content; bulk export pulls content and the search index just to collect ids; `select('*')` sends the search index (tsvector) over the wire. | `PasteBin.jsx:25`; `useDashboardBulkActions.js:79-135`; `Settings.jsx:289` | Explicit column lists |
| P6 | **The cover image shifts the layout as it loads** (no dimensions, no `onError`). | `ObjectDetail.jsx:1255` | `aspect-ratio`, `decoding=async`, and hide on error |
| P7 | **Note content pops in late** because the viewer parses markdown asynchronously. | `BlockNoteViewer.jsx:18-36` | Solved by storing content as JSON (§4) |

## 10. Accessibility (WCAG 2.2 AA)

Contrast ratios below were computed from the design tokens.

| # | Issue | Evidence | Fix |
|---|---|---|---|
| A1 | **Primary button text fails contrast in both themes** (2.84–4.27). | `index.css:333-338` | Darker gradient stops (#be185d→#4338ca) with a white `--on-accent` |
| A2 | **Faint and status colours fail contrast.** Hints are 3.18–3.63 in dark; the success toast is **2.66** in light; danger is 3.57 in dark. | `index.css:17-27,115-127`; `App.css:128` | Adjust the tokens |
| A3 ✔ | **The dashboard focus ring is almost invisible** (1.5:1, and identical to the resting glow). | `Dashboard.css:1212-1215` | Delete the override |
| A4 | **The closed mobile drawer is still in the tab order.** It is aria-hidden but not `inert`. | `AppLayout.jsx:110` | Add `inert` and manage focus |
| A5 | **The run-prompt dialog has no Escape key, focus trap or labels**, and a backdrop click discards paid AI output. | `ObjectDetailRunPromptPanel.jsx:64-71,147,220,230` | Use `ui/Dialog` with an unsaved-changes check |
| A6 | **Dropdowns act as soon as the selection changes**, so moving through options with the arrow keys adds the wrong tag, domain or link. | `ObjectDetail.jsx:1313,1350,1447,1472`; `EntityComboBox.jsx:184` | A combobox that commits explicitly |
| A7 | **Interactive elements are nested inside each other** (links and a checkbox inside a card `<Link>`; buttons inside a `div role=button`). | `DashboardObjectCard.jsx:175-229`; `PromptBank.jsx:300-356` | Use an `<article>` with a stretched title link |
| A8 | **Page titles and focus don't change on navigation**, and 7 pages have no h1. | `routeConfig.jsx`; ObjectNew, Journal, PasteBin, auth pages | A `useTitle` hook, and focus the h1 |
| A9 | **ARIA roles are misused:** a radiogroup with aria-pressed, a listbox containing links, a palette without `aria-activedescendant`, and a Journal "grid" with no rows. | `CommandBar.jsx:65`; `CommandPalette.jsx:121`; `Journal.jsx:216` | Use correct roles |
| A10 | **Virtualized lists don't expose their size** (`aria-setsize`/`posinset`). | `DashboardView.jsx:402`; `Search.jsx:210` | Add them |
| A11 | **The remove buttons on tags and links are about 15×18 px** (below the 24 px minimum). | `ObjectDetail.css:536`; `LinkedBar.css:32` | At least 24 px (44 px on touch screens) |
| A12 | **Error toasts disappear after 4 s** and can't be paused. | `ToastContext.jsx:6-16` | Keep errors until the user dismisses them |
| A13 | **Button names are ambiguous.** "Remove" and "Restore" don't say what they act on; Windows shows the ⌘K glyph; the card's aria-label hides status, due date and summary. | `ObjectDetail.jsx:1378,1466`; `DashboardObjectCard.jsx:181` | Name each control after its object |
| A14 | **Inputs lack labels or fieldsets** (Settings domain/tag inputs, Import radios, webhook checkboxes). | `Settings.jsx:659,721`; `Import.jsx:152` | Add them |
| A15 | **Some states are shown by colour only** (overdue vs soon, the theme picker, the selected paste). | `DashboardObjectCard.jsx:132-142`; `Settings.jsx:590` | Add text and `aria-pressed` |

## 11. Mobile (~375 px)

These findings come from reading the CSS; they haven't been tested in a browser.

| # | Issue | Evidence | Fix |
|---|---|---|---|
| M1 | **The bottom nav (z 90) covers the Share/Export sheet buttons, the bulk-action ribbon and the FAB**, so export, share and bulk actions can't be completed on phones. | `ObjectDetail.css:1521`; `BulkActionRibbon.css:1-6`; `Dashboard.css:640` vs `AppLayout.css:531` | Offset them by the nav height plus the safe area, or hide the nav |
| M2 ✔ | **`viewport-fit=cover` is missing**, so every `env(safe-area-inset-*)` is 0. | `index.html:8` | Add it |
| M3 ✔ | **The Settings mobile layout never applies**, because its media query uses `var()`, which isn't valid inside `@media`. | `Settings.css:174` | Use a literal 768px |
| M4 | **iOS zooms in when the user taps many inputs**, because their font size is under 16 px (command bar, filters, link search, chip selects, run-prompt, templates). | `CommandBar.css:37`; `Dashboard.css:1276`; `ObjectDetail.css:167,572,1061` | 16 px on inputs at ≤768 px |
| M5 | **Screen space is wasted:** padding is doubled, leaving about 311 px of content; `min-height:100vh` sits under a header; lists scroll inside a nested `calc(100vh-280px)` box. | `AppLayout.css:525`; `DashboardView.jsx:402` | A window virtualizer and `dvh` |
| M6 | **The sticky ObjectDetail header is about 200 px tall** and hides focused fields. | `ObjectDetail.css:121-135` | A "⋯" menu, and not sticky on mobile |
| M7 | **If the sidebar was collapsed on desktop, the mobile drawer shows icons only.** | `AppLayout.jsx:122-188` | `collapsed && !isMobile` |
| M8 | **Selection checkboxes only appear on hover**, so touch users can't find bulk select. | `TableView.css:13`; `StreamView.css:49` | Always show them on touch devices (`hover:none`) |
| M9 | **The activity drawer has no close button, backdrop or Escape key.** | `Dashboard.css:142`; `DashboardView.jsx:522` | A proper sheet |
| M10 | **ObjectNew puts its properties below a 520 px editor**, and the submit button is only at the top. | `ObjectNew.jsx:208-214` | Properties first, and a sticky submit bar |
| M11 | **Keyboard hints (⌘K, "press /", ⌥1) appear on touch devices.** | `CommandBar.jsx:54`; `TrailheadRow.jsx:252` | Hide them on touch devices (`hover:none`) |

## 12. UX flows & copy

| # | Issue | Evidence | Fix |
|---|---|---|---|
| U1 | **First run shows 5 competing calls to action and 3 different ways to create.** | `DashboardView.jsx:77-98,340-374`; `DashboardEmptyStates.jsx:278` | One empty state with one call to action |
| U2 | **Jargon:** "rhythm/tend", "Spark", "Synthesize", "Stakeholder", "Soft-deleted", "v3", "Comfy", "Field key", "server DeepSeek key". | `Trailhead.jsx:198`; `ObjectDetail.jsx:1280`; `Trash.jsx:90` | Plain language |
| U3 | **The same thing has different names:** Dashboard/Home, Notifications/Alerts, Prompts/Prompt Bank, object/note/entry, Trash/Delete, "More filters"/"Filters". | `AppLayout.jsx:19,32,230` | Agree on a glossary |
| U4 | **Raw database values appear in the UI** ("active", "references", type slugs, "knowledge_object 1a2b…"). | `DashboardFilterPanel.jsx:47`; `AuditLogs.jsx:84` | Label helpers |
| U5 | **No undo anywhere.** Deleting, revoking a share, removing a tag/link/file, restoring a version, cancelling an edit and switching pastes all lose data without confirmation or undo. | `ObjectDetail.jsx:462,1180,1402`; `ObjectDetailSharePanel.jsx:298` | Undo toasts and unsaved-changes checks |
| U6 | **The AI flow has dead ends.** "Use on object" from Prompts takes an extra hop; output can't be appended to the current object; run history can't be opened; errors mention "Edge Function secrets". | `PromptBank.jsx:125`; `ObjectDetailRunPromptPanel.jsx:229-243`; `ObjectDetail.jsx:1414` | An object picker, "Append to note", and clickable history |
| U7 | **The link picker shows only 50 objects** and gives no feedback when a link is added. | `ObjectDetail.jsx:1449,1474` | A search combobox |
| U8 | **Errors appear at the top of the page**, far from the sidebar control that failed. | `ObjectDetail.jsx:1186` | Show errors inline in each card |
| U9 | **Every filter or page change flashes a skeleton and loses scroll position.** Filters need "Apply" but the pills apply instantly. | `DashboardView.jsx:381`; `DashboardFilterPanel.jsx:83` | Keep previous results while loading (`placeholderData`) and apply filters automatically |
| U10 | **Capture is slow:** content is required, there's no "capture another", and domains/tags can't be created inline. | `QuickCapture.jsx:73,104`; `ObjectNew.jsx:451` | Title-only capture and inline create |
| U11 | **Dates appear in 5 formats**, including raw ISO in the Journal breadcrumb and an unlabeled `updated_at` in Trash. | `ObjectDetail.jsx:1230`; `Journal.jsx:148`; `Trash.jsx:109` | One `formatDate` |
| U12 | **Shared objects aren't marked** (no "Shared by" badge or filter), and there's no way to invite someone. | `DashboardObjectCard.jsx`; `ObjectDetail.jsx:1083` | A badge and a "Shared with me" view |
| U13 | **The Search page is missing basics:** no result count or dates; it says "Enter a query" even when filters are set; the mobile nav has no Search tab. | `Search.jsx:209-252`; `AppLayout.jsx:227` | Fix each one |
| U14 | **Settings is disorganised:** domains and tags are in separate sections; the copy says "contact support" but no support channel exists; accounts can't be deleted. | `Settings.jsx:481,655-748` | Regroup and fix the copy |

## 13. Developer experience, testing & docs

| # | Issue | Evidence | Fix |
|---|---|---|---|
| T1 ✔ | **`.gitignore` ignores every `*.md` and `*.txt` file**, so the repo can't have a README and **these plan docs aren't tracked**. | `.gitignore:37,40` | Remove those patterns and add a README |
| T2 | **No CI** (there is no `.github/` folder). | repo root | Run lint, test, build, `supabase db lint`, pgTAP and `deno check` |
| T3 | **No `.env.example` for the edge-function secrets and no `seed.sql`.** | `run-prompt/index.ts:17,28-39` | Add both, with the seed containing 2 users and a share |
| T4 | **The riskiest flows have no tests** (auth events, save conflicts, sharing, trash, RLS). | `search.integration.test.js` | A pgTAP RLS matrix, a Playwright two-tab conflict test, and a shared mock |
| T5 | **No type checking.** | `package.json` | `supabase gen types`, `checkJs` on lib and hooks, new `features/*` in TS, and `tsc --noEmit` in CI |
