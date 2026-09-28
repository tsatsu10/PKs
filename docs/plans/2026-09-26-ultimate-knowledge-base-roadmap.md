# PKS → The Ultimate Knowledge Base: Roadmap

_Created 2026-09-26 · Revised 2026-09-27 after an independent review. Based on a full codebase study, a two-pass audit ([codebase audit](./2026-09-26-codebase-audit.md)), and 2025–2026 market and tech research._

## North star

**"Capture in 2 seconds, find anything in 200 ms, see how it connects, and ask it questions with cited answers."**

The market is converging on four things:
- **Typed objects with properties and views**
- **Bidirectional linking**
- **AI that answers with citations**
- **An MCP server** so outside AI agents can use your knowledge

Users punish four failures:

| Failure | Product that shows it |
|---|---|
| Onboarding cliffs | Tana |
| Slowness at scale | Notion, Heptabase |
| Weak exact-keyword search | Mem |
| Poor offline support | Notion |

PKS already has a strong base: typed objects (21 types), domains/tags, versioning, link edges, prompts, templates, sharing, export, and a polished dashboard. What it lacks:
- **Connective tissue:** inline links, relevance-ranked search, AI over the whole knowledge base.
- **A speed layer:** caching, autosave, offline.
- **A stable foundation:** the audit found about 130 issues, including data-loss bugs.

---

## Decisions needed (before the phase they block)

| # | Decision | Blocks | Default if undecided |
|---|---|---|---|
| 1 | ✅ **Decided 2026-09-27: open signup.** −1B therefore includes email confirmation, CAPTCHA, invite-based sharing, rate limits and per-user plus global AI caps. Personal vs team is still open (Phase 6). | −1B, Phase 6 | — |
| 2 | ✅ **Decided 2026-09-27: keep server keys with a hard cap.** Server-key runs use Claude Sonnet 5 at medium effort, with per-user, per-provider and global daily caps. Your-own-key runs keep Claude Opus 5. The monthly budget ceiling is still to set. | −1B (S2), Phase 4 | — |
| 3 | **Supabase plan tier.** The free tier pauses and caps the DB at 500 MB, which conflicts with embeddings, pg_cron and pgmq. | Phase 4 | Pro before Phase 4 |
| 4 | **TypeScript for new code** (`features/*`). | Phase 0a | Yes: new files in TS, `checkJs` on lib/hooks |
| 5 | **Embedding provider.** OpenAI `text-embedding-3-small` (1536-d, cheap), Voyage (1024-d, higher quality) or Google. Switching later means re-embedding everything. | Phase 4 | OpenAI 3-small |
| 6 | **RAG scope.** Include objects shared with me? Keep DeepSeek as a provider (privacy statement)? | Phase 4 | Own objects only; DeepSeek opt-in |
| 7 | **Trash retention** before the purge. | Phase 0c | 30 days |
| 8 | **Email provider** for email-in, digests and Web Push (VAPID). iOS push needs an installed PWA. | Phase 3/5 | Postmark or Resend |
| 9 | **Mobile strategy.** PWA only (no iOS share target) or a Capacitor wrapper. | Phase 3 | PWA only |
| 10 | **Journal and PasteBin folded into objects?** | Phase 3 | Yes, fold them in |
| 11 | **How serious is offline?** An outbox is enough for most users; PowerSync is a bigger commitment. | Phase 6 | Outbox |

## Migration rules (apply to every schema change)

1. **Expand → migrate → contract, across two releases.** Old app bundles keep running until the user accepts the update (R5 prompt-to-update), so a release must never break the previous client.
2. **Dropped tables become read-only for one release first.** Revoke INSERT/UPDATE/DELETE, then drop the table in the next release.
3. **`min_client_version`.** The app reads this row on boot and forces a reload when a breaking change requires it.
4. **Content columns:** see Phase 0a. A trigger nulls `content_json` when `content` changes without it, so an old client's Markdown edit is never shadowed by stale JSON.
5. **Tests with every change.** Each migration ships with pgTAP tests (RLS matrix, triggers) and row-count checks.

---

## Phase −1: Stabilize & prune (≈3–4 weeks solo, before any new work)

_Delete and fix before building, so the rebuild doesn't carry dead weight or data-loss bugs. The [ID map](#appendix-audit-id--phase-map) shows where each audit finding lands._

| Plan | Scope | Needs |
|---|---|---|
| **−1A: Frontend stabilize & prune** | 18 tasks: B2–B7, B9, B10, B20, R1–R6, R15, S11, D1 (patch-only saves), D10, D12, P4, A1–A4, M1–M4, M7, T1–T3, the dependency audit, dead code, and removing pulse rings, menu wheel, About, the slug route and export-job bookkeeping | Local only. Plan: [`phase-minus1a-frontend-stabilize`](../superpowers/plans/2026-09-26-phase-minus1a-frontend-stabilize.md) |
| **−1B: Database & edge-function hardening** | Details below. Split into **−1B1 Database** ([plan](../superpowers/plans/2026-09-27-phase-minus1b1-database-hardening.md)) and **−1B2 Edge functions & abuse protection** ([plan](../superpowers/plans/2026-09-27-phase-minus1b2-edge-functions-abuse-protection.md)) | Local Postgres test server (`supabase/local-test/run.sh`, no Docker) and CI on the real Supabase stack; the owner applies to production |
| **−1C: Migration squash** | Squash the 46 migrations into a baseline dumped from production and verified with an empty schema comparison, then repair the remote history. **Recommended production order: −1A → −1C → −1B1 → −1B2.** | **Owner-run** [runbook](../superpowers/plans/2026-09-27-phase-minus1c-migration-squash.md): production credentials, local `pg_dump` (no Docker), backups |

**−1B scope (forward migrations plus edge-function fixes):**
- **Correctness:**
  - B1: a trigger `WHEN` clause so `last_viewed_at`-only updates don't bump `updated_at`.
  - B8/D13: server-owned prompt run row.
  - B15/D5: `edited_by` nullable with ON DELETE SET NULL.
  - B16: timezone-aware dashboard stats.
  - D3: `prompt_runs` FK → SET NULL.
  - D4/B14: storage cleanup on hard delete, plus an orphan sweeper.
  - D6: filter trashed objects inside `get_object_links_batch`.
  - D8: one transactional RPC for "save AI output as object".
- **Concurrency:** a new **`revision bigint`** column, bumped by trigger on *every* UPDATE. The optimistic-concurrency check uses `revision` (−1A Task 7 then switches from `current_version` to `revision`). `current_version` counts snapshots only. This completes the D1 fix.
- **Security:**
  - S1: verified email in the share resolver, plus confirmations on.
  - S2: spend caps, a separate Claude quota and a cheaper default model.
  - S3: the activity-RPC title leak.
  - S4: pre-share version history.
  - S5: invites or a rate limit.
  - S6: `cover_url` owner-only.
  - S7: webhook secret write-only.
  - S8: cap integrations and build payloads on the server.
  - S9: trash vs shared users. This is rewritten for `deleted_at` in 0c.
  - S10: allow-list the columns editors may change.
  - S12: `secure_password_change`.
  - S13: WITH CHECK ownership on side tables.
  - RLS: the `(select auth.uid())` pattern plus `can_read_object`/`can_edit_object` helpers.
  - Case-insensitive unique domain and tag names.
  - AI keys moved to Vault.
  - Storage bucket size and MIME limits.
- **Edge functions:**
  - B18: webhook delivery accounting, timestamped HMAC, a DB-backed rate limit.
  - B19: validate before consuming quota.
  - R14: Claude timeout and retries within the edge limit, plus a `truncated` flag.
  - Shared `_shared/` helpers; CORS fails closed; pinned dependencies.
- **Pruning:**
  - Drop `export_jobs` and `export_job_items` plus their 3 enums (read-only first, per the migration rules).
  - Drop `import_items` and its 2 RPCs.
  - Remove the Integrations "generic" type and PromptBank `output_format` (UI and columns together).
  - Remove the pulse fields from `get_dashboard_stats`.
  - Drop ~14 redundant indexes.
  - Add `SET search_path` to `set_updated_at`.
  - Merge the two quota tables into `ai_usage`.
  - **Keep** `files.extracted_text` (Phase 1) and the `openai` provider value (Phase 4 embeddings).
- **Tooling:**
  - Move `config.toml` to the root `supabase/` folder (a prerequisite for the local stack).
  - `seed.sql` with 2 users and a share.
  - pgTAP tests covering B1, S1, S4, S9, S10 and D3.

**Exit criteria:**
- −1A: lint, tests, build and `check:bundle` are green in CI; `npm audit --omit=dev --audit-level=high` is clean; the two-tab conflict check passes.
- −1B: the pgTAP suite is green; the Supabase security and performance advisors show no errors.
- −1C: `supabase db diff` against the baseline is empty. **Phase −1 can't close until the owner runs −1C.**

## Phase 0a: Data layer & editor (≈3–4 weeks)

_Everything later depends on this. Users should feel the app get faster and never lose work._

1. **Data layer:**
   - Adopt **TanStack Query** with `persistQueryClient` to IndexedDB. **Key the persisted cache by user id, and purge it on logout and `SIGNED_OUT`.**
   - Query hooks: `useObject`, `useObjects`, `useSearch`, `useBacklinks`, `useTaxonomy`.
   - Mutations are optimistic: update in `onMutate`, roll back in `onError`, invalidate in `onSettled`.
   - Prefetch on hover and focus.
   - Use client-generated UUIDs.
   - Fixes: B11, P1, P5, D11, R9, R10, U9.
   - The dashboard gets query-key dedupe only here; its full rewrite happens in Phase 5.
2. **Content model:**
   - The client writes `content_json` (BlockNote blocks) **and** `content` (Markdown via `blocksToMarkdownLossy`) in the same UPDATE.
   - A DB trigger derives `content_text` (plain text from the JSON, or from the Markdown when the JSON is null) for full-text search, chunks and embeddings.
   - Server-side writers (clipper, email-in, MCP, importers) write Markdown only, with `content_json = NULL`. The client upgrades it to JSON on first open.
   - The backfill is a Node script using `@blocknote/server-util`. It is owner-run and needs the service key.
   - This also fixes P7.
3. **Autosave:**
   - Debounced autosave (≈800 ms) with a "Saved ✓ / Saving… / Not saved: retrying" indicator.
   - Unsaved content kept in IndexedDB and retried on reconnect, for the open object only (the general outbox is Phase 6).
   - The conflict check uses `revision` (from −1B).
   - **Prerequisites that ship first:** R12 error reporting (Sentry or an edge reporter), and R8 human-readable errors plus an offline banner.
   - **Coalesced version snapshots:** at most 1 per 10 minutes per editor, or an explicit "Save version".
4. **Split ObjectDetail:**
   - Split into `features/object/`: Header, Properties, Editor, Backlinks, Attachments, History, AI panel.
   - A lightweight read-only renderer.
   - One `lib/export` (B17).
   - Fixes: P3, R7, R16, D7, B13 (the editor-permission UI).
   - Undo toasts for destructive actions (U5).
5. **Reliability:**
   - R11: an error boundary per route, reload on chunk-load failure.
   - R13: a config-error screen.
   - Remove the hardcoded `Africa/Accra` timezone from AuthContext.
   - P2: memoise dashboard rows.
6. **TypeScript** (decision 4): `supabase gen types`, `checkJs` on `lib/` and `hooks/`, new `features/*` files in TS, and `tsc --noEmit` in CI (T5).
7. **E2E:** Playwright smoke tests for login, create, autosave, search, link and trash/restore, plus a two-context conflict test (T4).

**Exit criteria:**
- Playwright: edit, close the tab within 1 s, reopen, and the content is present. The same passes offline-then-reconnect.
- Opening a cached object takes under 100 ms.
- ≤ 6 snapshots per hour of continuous editing.
- No file in `features/object/` over 400 lines.

## Phase 0b: UI system & accessibility (≈3 weeks)

1. **UI primitives in `components/ui/`:**
   - Button, IconButton, Field, Input, Select, Combobox, Card, Dialog and ConfirmDialog, Popover, Tabs, Badge, EmptyState, Spinner, Pagination, Toaster, Kbd.
   - Built on the `index.css` tokens.
   - **Lucide** icons.
   - Migrate page by page, including the ~4,000-line CSS sweep and the remaining dead CSS.
2. **Lint hardening:**
   - `eslint-plugin-react` (`jsx-uses-vars`), then narrow `varsIgnorePattern` to `^_`.
   - `eslint-plugin-jsx-a11y`.
   - `no-restricted-imports` (components must not import features).
   - stylelint with strict token values.
3. **Accessibility:** A5–A15, including the rebuilt ToastContext (A12) and the NotificationCenter focus trap.
4. **Mobile pass:** M5, M6 and M8–M11.
5. **Copy pass:**
   - A glossary, applied everywhere: Home, Notifications, Prompts, object, Move to Trash (U2, U3).
   - Label helpers for raw DB values (U4).
   - Inline per-card errors (U8).
   - One `formatDate` (U11).
   - Split Settings and regroup domains and tags (U14).
6. **Security headers and PWA:**
   - Self-hosted font, removing `'unsafe-hashes'` and the Google Fonts CSP entries.
   - The theme script moved to a file.
   - Narrow `img-src`.
   - Pin `connect-src` to the project host (S14).
   - COOP and HSTS preload.
   - `immutable` caching on `/assets`.
   - A single manifest with PNG 192/512 and a maskable icon.
   - P6: cover image layout shift.

**Exit criteria:**
- axe shows 0 serious or critical violations on the smoke routes, in both themes.
- CSS total at least 35% smaller than the start of −1A.
- Lint is clean with jsx-a11y.

## Phase 0c: Schema reshape (≈2 weeks)

Follows the migration rules above.

1. **`deleted_at`** replaces `is_deleted`, with a pg_cron purge after the retention period (decision 7). Rewrite S9's policies for `deleted_at`.
2. **Server-authored side effects:**
   - Notifications and audit log rows are written by triggers.
   - Webhooks become `webhooks` + `webhook_deliveries`, delivered through a pgmq outbox with retries.
   - Remove the client INSERT policies, after one release where the client stops writing.
   - Rebuild NotificationCenter on Realtime.
3. **Slugs** generated by a DB trigger, with one behaviour for every create path.

**Exit criteria:**
- The client makes no writes to `notifications`, `audit_logs` or webhooks (grep plus policy tests).
- The audit log covers bulk actions, restore, links and tags.

## Phase 1: Find anything instantly (≈2–3 weeks)

1. **Object types and one search RPC** (done together, so the search RPCs are only rewritten once):
   - An `object_types` lookup table replaces the enum. It gets an empty `property_schema` column, which Phase 5 fills.
   - One `search_objects` RPC: SECURITY INVOKER, a lean column list, keyset paging.
2. **Search that ranks:**
   - Build the tsquery from `websearch_to_tsquery` for the complete terms, and add a manually built `:*` prefix term for the last word.
   - `ts_rank_cd` with weights, boosted by pinned status and recency.
   - **pg_trgm** on titles.
   - Tag names in the object's tsvector through a trigger. A trigger on tag rename or delete re-derives the affected objects.
3. **One command palette:**
   - Ctrl+K fuzzy-matches object titles, actions, recent items and domains/tags.
   - Prefix modes: `>` for commands, `#` for tags, `@` for domains.
   - Replaces the dashboard palette, the Search page and the CommandBar `/`.
4. **File text extraction:**
   - An `extract-file` edge function fills `files.extracted_text` for PDF, DOCX, TXT and MD.
   - A stored tsvector column and a GIN index **before** search reads it.
5. **Search page UX (U13):** result count, filter chips, keyboard navigation, snippets, an attachments toggle, saved searches.
6. **Optional (after this phase):** a read-only **MCP server** (`search`, `get_object`) as a cheap early win. Note that Supabase's OAuth 2.1 server is still in beta.

**Exit criteria (10k-object synthetic seed script, added to T3):**
- p95 keyword search under 150 ms.
- Exact-title queries rank #1.
- A one-typo title query finds the object in the top 3.

## Phase 2: Connect (≈3–4 weeks)

1. **`[[Wiki links]]` in the editor:**
   - A BlockNote inline `objectLink` element.
   - A `[[` suggestion menu with "Create '<title>'".
   - `@` mentions for person objects.
2. **Link sync:**
   - A DB trigger on `content_json` extracts the `objectLink` nodes and reconciles `link_edges` with `origin = 'inline'`.
   - It is **diff-based**, so it is a no-op when the set of links is unchanged.
   - Manual edges are never touched.
   - Decide how editors are handled (B13): the sync runs SECURITY DEFINER, and it can only link to objects the editing user can read.
3. **Backlinks panel:**
   - Each incoming link with the surrounding sentence.
   - An **Unlinked mentions** list with a one-click "Link".
   - One search combobox for manual links (U7).
4. **Local graph:** 1–2 hops, lazy-loaded, with a full-screen explore mode. No global hairball by default.
5. **Aliases:** `aliases text[]` so links resolve on alternate names.
6. **Importers, needed early for adoption:**
   - An Obsidian or Markdown-folder zip, with `[[links]]` converted to edges.
   - **Restore from PKS JSON backup.**
   - Idempotent (D9).
   - Import page fixes (R17).
7. **Stretch, moved to Phase 6 if short on time:** block references and transclusion. BlockNote has no native support.

**Exit criteria:**
- A pgTAP test shows that edges equal the parsed `objectLink` set after insert, update and delete.
- A link takes ≤ 3 keystrokes after `[[`.
- A 1,000-note Obsidian vault imports with its links intact.

## Phase 3: Capture everywhere (≈3 weeks)

1. **Global Quick Capture modal** (Ctrl+Shift+Q):
   - The title is optional.
   - Inline `#tag` and `@domain`.
   - Paste an image or URL.
   - A "Capture another" option.
   - Replaces `/quick`, the dashboard quick-add and the FAB (U10).
2. **Inbox:**
   - A new `triaged_at timestamptz NULL` column, rather than overloading `status`.
   - A keyboard-first triage view.
   - AI suggestions once Phase 4 lands.
3. **Journal → daily notes:**
   - Migrate `journal_entries` into objects (`type = 'daily'`) in the release that ships the new UI.
   - The old table becomes **read-only, and is dropped in the next release** (B12, D2).
4. **PasteBin → snippets:** the same pattern (`type = 'snippet'`).
5. **Images in the editor:** BlockNote `uploadFile` into `pks-files`.
6. **Capture from outside the app:**
   - PWA Web Share Target (Android and desktop; iOS per decision 9).
   - A bookmarklet or clipper edge function.
   - Email-in (decision 8).
7. **Onboarding (U1):**
   - A sample linked "Getting Started" domain.
   - A single empty-state call to action.
   - A 3-step checklist: capture, link, ask.
8. **Voice capture** (optional).

**Exit criteria:**
- Hotkey → persisted in under 2 s.
- Share target → saved in under 5 s.
- A new user reaches their first linked object in under 3 minutes (5-person hallway test).

## Phase 4: AI that cites (≈5–6 weeks)

1. **Chunks and embeddings:**
   - `knowledge_chunks` columns: object_id, **user_id**, chunk_idx, heading_path, content, **content_hash**, fts, embedding `halfvec(N)`, **embedding_model**; HNSW index.
   - Vector queries filter by user inside the query (pgvector iterative scan).
   - **Autosave-safe enqueueing:**
     - Enqueue only when `content_text` changes and no job is pending for that object.
     - Delay the job until 2–5 minutes after the last edit.
     - Re-embed and re-contextualize only the chunks whose `content_hash` changed.
   - pgmq + pg_cron + pg_net → an `embed` edge function.
   - Chunking: split on headings first, then ~400 tokens with ~15% overlap.
   - Contextual retrieval, with prompt caching.
2. **Embedding provider:** fixed by decision 5. Switching providers means a full re-embed into a new column.
3. **Hybrid search (RRF):** keyword results render first, and semantic results merge in when they arrive.
4. **Ask your knowledge base:**
   - Ctrl+J chat that streams from Claude.
   - **Citation chips** that jump to the exact passage.
   - Save an answer as a linked `insight` object.
   - Scope follows decision 6.
5. **run-prompt v2:**
   - SSE streaming.
   - The **server fetches context by `object_id` under RLS**.
   - The run row belongs to the server.
   - Multi-object context.
   - U6 fixes: "Append to note" and clickable run history.
   - S15: AI output labelled as untrusted.
   - Merge `lib/ai`.
6. **AI assists** ("suggest, never silently apply"):
   - Related notes.
   - Suggested links.
   - Auto-tag, domain and type suggestions in the Inbox.
   - Summaries.
   - Key points stored as a property (Phase 5).
   - Merge the `suggest_tags` RPCs.
7. **Cost & privacy:**
   - Per-user quotas using `ai_usage`.
   - An "exclude from AI" flag.
   - A provider disclosure.

**Exit criteria:**
- Recall@10 at least 15 percentage points above keyword-only search, on 30 hand-labelled queries.
- At least 90% of citations actually support the claim (hand-graded).
- AI cost at most $X per active user per month (set with decision 2).

## Phase 5: Structure without the cliff (≈4 weeks)

1. **Per-type properties:**
   - Fill `object_types.property_schema`.
   - A `properties` JSONB column with a GIN index.
   - Migrate `templates` into it, then retire the `templates` table.
   - Progressive disclosure: a plain note never shows empty property fields.
2. **Saved views** (`saved_views` table):
   - Table, Board, Calendar and Gallery layouts, grouping, pin to the sidebar, embed in a page.
   - **The dashboard becomes Home plus saved views.** This is its one full rewrite, including the Home widgets (recently viewed, due, trending).
3. **Reminders that fire:**
   - A pg_cron job over `remind_at` with a `reminded_at` column.
   - Web Push and an optional email digest.
4. **Resurfacing:** a daily "Review" card (SM-2-lite); optional flashcards.
5. **Nested domains:** `parent_id`, plus colour and icon.

**Exit criteria:**
- Reminders fire within 1 minute of `remind_at`.
- A 1,000-row table view renders in under 200 ms.
- A new property type needs no code change.

## Phase 6: Ecosystem, offline & collaboration (ongoing)

1. **Full MCP server:**
   - Write tools: `create_object`, `append_daily`, `ask`.
   - OAuth 2.1 via Supabase Auth, running under RLS.
2. **More importers:** Notion export, HTML/DOCX, Readwise.
3. **Offline:**
   - An IndexedDB mutation outbox.
   - `y-indexeddb`.
   - PowerSync only per decision 11.
4. **Sharing:**
   - Public read-only links.
   - A "Shared with me" view and badge (U12).
   - Comments.
5. **Real-time co-editing** (team only, decision 1): Hocuspocus with Supabase JWT validation. Not `y-supabase`.
6. **Canvas and whiteboards** (tldraw); block transclusion if deferred from Phase 2.

**Exit criteria (per item):**
- MCP works end to end from Claude, and an RLS test proves isolation.
- Offline edits replay without loss after 24 h offline.

---

## Timeline (solo developer, realistic)

```
−1A/−1B/−1C Prune (3–4w) ─► 0a Data & editor (3–4w) ─► 0b UI system (3w) ─► 0c Schema (2w)
  ─► 1 Search (2–3w) ─► 2 Connect (3–4w) ─► 3 Capture (3w) ─► 4 AI (5–6w) ─► 5 Structure (4w) ─► 6 …
```

- **Total to the end of Phase 5:** about 31–37 weeks.
- **Phases 2 and 3 can be swapped** if capture matters more than linking.
- **0b can interleave with 0a** (it touches different files).
- **The MCP read-only server** can ship any time after Phase 1.

## UX principles (apply across every phase)

- **Keyboard-first, mouse-friendly:** every action is reachable from Ctrl+K, and shortcuts are shown in tooltips.
- **Progressive disclosure:** a new user sees a note, a search box and Today. Avoid the Tana cliff.
- **Never lose work:** autosave, retry, version history with a diff view, and undo toasts instead of confirm dialogs.
- **Skeletons, not spinners:** optimistic updates; animations under 100 ms that respect `prefers-reduced-motion`.
- **AI suggests, the human decides:** always cite sources, and never mutate data silently.
- **Mobile is first-class:** fixed UI clears the bottom nav, inputs are 16 px, touch targets are ≥ 24 px (44 px on coarse pointers).
- **Accessibility:** WCAG 2.2 AA, with axe in the Playwright suite.

## Success metrics

| Metric | Target |
|---|---|
| Time to capture (hotkey → saved) | < 2 s |
| Search p95 at 10k objects | < 150 ms (keyword), < 600 ms (hybrid) |
| Open cached object | < 100 ms |
| Share of objects with ≥ 1 link | 50% or more within 60 days |
| Citation correctness | ≥ 90% |
| Data-loss incidents | 0 |

---

## Appendix: audit ID → phase map

Every finding in the [audit](./2026-09-26-codebase-audit.md) is assigned. "−1A Tn" means task n of the −1A plan.

| Phase | Audit IDs |
|---|---|
| **−1A** | B2 (T9), B3/B4/P4 (T4), B5 (T5), B6 (T6/7), B7 (T10), B9/B10 (T13), B20/A1–A3/M3 (T16), R1–R4/S11/D12 (T11), R5 (T12), R6/D1 patch (T7), R15/D10 (T9), A4/M7 (T15), M1/M2/M4 (T17), T1/T3 docs (T1), T2 (T18), dependency audit (T3) |
| **−1B** | B1, B8, B14, B15, B16, B18, B19, S1–S10, S12, S13, R14, D1 (`revision`), D3, D4, D5, D6, D8, D13, T3 (seed), T4 (pgTAP) |
| **−1C** | Migration squash |
| **0a** | B11, B13 (UI), B17, R7–R13, R16, D7, D11, P1, P2, P3, P5, P7, U5, U9, T4 (E2E), T5 |
| **0b** | A5–A15, M5, M6, M8–M11, P6, S14, U2, U3, U4, U8, U11, U14 |
| **0c** | S9 rewrite for `deleted_at`, server-authored notifications, audit log and webhooks, slug trigger |
| **1** | U13, `object_types`, one search RPC, `files.extracted_text` |
| **2** | B13 (link sync permissions), D9, R17, U7 |
| **3** | B12, D2, U1, U10 |
| **4** | S15, U6, `lib/ai` merge, `suggest_tags` merge, run-prompt fetch by `object_id` |
| **5** | Home widgets, `templates` retirement, reminders |
| **6** | U12 |

## Key references
- Supabase hybrid search: https://supabase.com/docs/guides/ai/hybrid-search
- Supabase automatic embeddings: https://supabase.com/docs/guides/ai/automatic-embeddings
- Contextual retrieval: https://www.anthropic.com/engineering/contextual-retrieval
- Supabase MCP auth: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- BlockNote collaboration: https://www.blocknotejs.org/docs/features/collaboration
- Hocuspocus + Supabase: https://emergence-engineering.com/blog/hocuspocus-with-supabase
- PWA share target: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target
