# Phase 0a, part 2: always-editable objects, autosave and reliability — design

_Date: 2026-11-14. Roadmap: [Phase 0a](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md), items 1 (rest), 2, 3, 4, 5 and 7. Builds on [part 1](2026-10-13-phase-0a-part1-data-layer-design.md). Audit IDs: P2, P3, P7, R7, R11, R13, R16, D7, B13, U5, T4._

## Why

You should never lose work, and editing should feel instant. Today an object opens read-only. You click **Edit**, change things, and click **Save**. A sessionStorage draft is the only safety net, and every save writes a full version snapshot.

Part 2 makes objects behave like Notion: open one and you are already editing, everything saves by itself, and nothing is lost to a closed tab, a dropped connection or a second device.

## Goals

- **Always editable.** Objects you own, or that are shared with you as editor, open straight into editing. There is no Edit, Save or Cancel button.
  - Title, content, summary, key points and properties (type, status, source, due and remind dates, cover) all edit in place.
  - Shared editors edit what the database lets them write: title, content, summary, key points and source. They see the other properties read-only. _(Builder-check call: this keeps the existing `guard_knowledge_object_update` permissions rather than widening them.)_
  - Viewers (people with a `viewer` share) get a lightweight read-only view.
- **Autosave.**
  - Changes save about 0.8 s after typing stops, and at least every 5 s during continuous typing.
  - A small indicator by the title shows **Saving…**, **Saved ✓** or **Not saved: retrying**.
  - Unsent changes are kept in IndexedDB. They survive a reload or a closed tab and are sent when the connection returns.
- **Stop and ask on conflicts** (owner decision 2026-11-14). When the object changed elsewhere (another tab, another device, or a person it's shared with), autosave pauses and a bar says **"This changed elsewhere"**. It offers two buttons:
  - **Keep mine:** overwrite theirs.
  - **Load theirs:** your unsent text is first saved as a version, then the editor reloads with their text.
- **Coalesced versions.**
  - An automatic snapshot is taken at most once per 10 minutes per object.
  - A **Save version** button takes one on demand.
  - Restoring a version first snapshots the current state, so a restore can be undone.
- **Content model.**
  - BlockNote JSON (`content_json`) is stored next to the Markdown `content`.
  - A derived plain-text `content_text` is added.
  - Note content renders immediately instead of popping in (P7).
- **Undo, not confirm.** Destructive actions on an object show an undo toast (U5).
- **Reliability fixes:** R11, R13, R16, D7, B13, P2, P3, and removing the hardcoded `Africa/Accra` timezone.
- **End-to-end tests** with Playwright (T4).

## Non-goals

- Live co-editing or merging (Google Docs style). Conflicts stop and ask instead.
- A general offline outbox for creating objects or changing tags, links and files while offline. That is Phase 6. Only the open object's field edits are kept and retried.
- Sharing pending edits between two tabs of the same browser. Each tab saves on its own, and a clash between them is handled by the conflict bar.
- Switching full-text search (`fts`) to `content_text`. That happens in Phase 4 together with chunks and embeddings. Part 2 only adds and fills the column.
- The dashboard rewrite (Phase 5), and converting existing pages to TypeScript.

## Anti-goals (a failure even if everything "works")

- Silently losing anyone's edit: yours, another device's, or a collaborator's.
- Flooding version history: more than 6 automatic snapshots per hour of continuous editing.
- Breaking a browser that still runs the old bundle until the user accepts the update. Every migration is expand-only (roadmap migration rule 1).
- Stealing focus or opening the on-screen keyboard on phones when an object is merely being viewed.

## Constraints

- **Production database work is done by the owner.** The owner pushes migrations, regenerates types and runs the backfill. The Supabase MCP is read-only. Each migration ships with pgTAP tests.
- **No Docker on the owner's machine.**
  - Database tests run in the local PG18 harness (`supabase/local-test/run.sh`) and in CI.
  - Playwright needs auth + REST, so it runs in CI against `supabase start` on the GitHub runner.
- **Stack:** BlockNote 0.55 (`@blocknote/*`), the part 1 query layer (`src/data`, TanStack Query persisted per user in IndexedDB, `idb-keyval`), and `classifyError()` / `reportError()`.
- **Existing triggers on `knowledge_objects`:**
  - `touch_knowledge_object` bumps `revision` and `updated_at` on real edits.
  - `trg_knowledge_objects_version` snapshots `OLD` on every title/content/summary/key_points change and bumps `current_version`.
  - `guard_knowledge_object_update` also runs on every update.

## Approaches considered

1. **A per-object save engine (chosen).**
   - A small `saveQueue` state machine owns debounce, IndexedDB persistence, sending with the `revision` check, retry, flush on tab close, and pausing on conflict.
   - It updates the part 1 query cache on success.
   - It's easy to unit-test with fake timers and to drive from Playwright.
2. **TanStack mutation persistence.**
   - Less code, but debounce, coalescing keystrokes into one save, flush on unload and conflict pausing all work against the library.
   - Persisted paused mutations also need registered default functions to resume after a reload.
3. **Extend the sessionStorage drafts and save on a timer.**
   - Smallest change, but sessionStorage dies with the tab, is capped at about 5 MB and blocks while the page writes to it. It can't meet "close the tab, reopen, text is there".

**Versions are decided in the database, not the client**, so the 10-minute cap also holds for imports and any future server writers.

## Delivery: three PRs

| PR | Contents | Prod steps (owner) |
|---|---|---|
| **2a** | Split `ObjectDetail` into `features/object/` with no change to save behavior. Folds in P3, R16, D7, B13 and one `lib/export`. | none |
| **2b** | Content model + always-editable + autosave + coalesced versions + conflict bar + R7. | push 1 migration, `gen:types`, deploy, then run the backfill |
| **2c** | Optimistic edits + undo toasts + client UUIDs + reliability (R11, R13, timezone, P2) + Playwright. | push 1 small migration (timezone default) |

2a goes first so autosave lands in a small `Editor` component rather than the 1,433-line page.

---

## 2a. Split `ObjectDetail`

**Target layout** (new files in TypeScript, part 1 decision 4):

```
src/features/object/
  ObjectPage.tsx        route component: loads data, decides editable vs read-only
  Header.tsx            title, pin, actions menu (duplicate, delete, export, share)
  Properties.tsx        type, status, source, dates, cover
  Editor.tsx            BlockNote wrapper (editable)
  ReadOnlyBody.tsx      read-only renderer
  Taxonomy.tsx          domains and tags
  Links.tsx             outgoing links and backlinks
  Attachments.tsx
  History.tsx           version list and restore
  AiPanel.tsx           run prompt, generate, save output
  SharePanel.tsx        moved from ObjectDetailSharePanel
  useObjectPage.ts      replaces hooks/useObjectDetail.js
```

**Exports:** the export builders now inside the page (`buildExportText/Html/Json/DocxBlob`, `escapeHtml`) move into `src/lib/export.js` next to `buildObjectMarkdown`, so there is one export module.

**Behavior fixes allowed in 2a** (otherwise no visible change):
- **P3:** editor content is kept in a ref and only lifted on debounce. `BlockNoteMantineProvider`'s theme object is hoisted, so one keystroke no longer re-renders the whole page.
- **R16:** attachment download opens its window synchronously, then sets the URL after the signed URL arrives.
- **D7:** links to trashed objects are hidden from the links list (backlinks too).
- **B13:** editors who aren't the owner no longer see domain, tag and link controls that RLS will reject.

**Done when:** every existing ObjectDetail test passes against the new components, the page's lines move rather than being rewritten, and no route or URL changes.

---

## 2b. Content model, always-editable, autosave, versions, conflicts

### Migration (one file, expand-only)

**New columns:**
- `knowledge_objects.content_json jsonb NULL`: BlockNote blocks.
- `knowledge_objects.content_text text NULL`: plain text derived by trigger, never written by clients.
- `knowledge_object_versions.content_json jsonb NULL`, so restoring keeps formatting.

**Trigger `sync_object_content`** (BEFORE INSERT OR UPDATE on `knowledge_objects`):
- On UPDATE, if `content` changed and `content_json` did not, set `content_json := NULL`. An old client's Markdown edit is then never shadowed by stale JSON (roadmap migration rule 4).
- Derive `content_text`:
  - when `content_json` is not null: the text nodes of the JSON, joined with spaces and newlines between blocks;
  - otherwise: `content` with Markdown syntax stripped.
- `content_text` is added to `touch_knowledge_object`'s ignored list, because it is derived.
- `content_text` is also added to `guard_knowledge_object_update`'s `editor_writable` list (`content_json` is already there). Triggers fire alphabetically (`_guard`, `_updated_at`, `_version`, then the new one), so a shared editor's save would otherwise fail with 42501 once the derived column changes. The new trigger's name must sort after `trg_knowledge_objects_guard`, or the guard must allow the column. pgTAP covers an editor's save.

**Versions** (replaces `save_knowledge_object_version` and its WHEN condition):
- On a title/content/summary/key_points change, snapshot `OLD` only if this object has no version newer than 10 minutes. Bump `current_version` only when a snapshot is taken.
- The snapshot includes `content_json`.
- One editing session therefore keeps the state from before the session started, and continuous editing produces at most 6 snapshots per hour.

**New RPC `snapshot_knowledge_object(p_object_id uuid, p_fields jsonb DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS int`:**
- **Which state it snapshots:**
  - With `p_fields` null, it snapshots the current row (the **Save version** button).
  - With `p_fields` (`title`, `content`, `content_json`, `summary`, `key_points`), it snapshots those values instead. This is how **Load theirs** keeps your unsent text.
- **Effects:** it inserts the version, bumps `current_version`, and returns the new version number.
- **Who can call it:**
  - SECURITY DEFINER with `SET search_path = public`. The function checks for itself that the caller is the owner or has an `editor` share (otherwise raises 42501), and writes `edited_by = auth.uid()`.
  - _(Builder-check call: −1B dropped the client INSERT policy on versions on purpose, so that only server code writes history. The RPC keeps that: direct inserts through REST still fail.)_
  - **Limits:** `p_fields` may only contain the five listed keys, `content` is capped at 1 MB, and `content_json` at 2 MB. Anything larger raises `22023`.
  - `p_reason` goes to `change_reason`, capped at 200 characters.
  - Execute is granted to `authenticated` only and revoked from `PUBLIC` and `anon`.
- Bumping `current_version` is itself an UPDATE, which `touch_knowledge_object` already ignores (it's in the ignored list), so `revision` does not move.

**pgTAP (new file `17_content_and_versions`):**
- JSON is nulled by a Markdown-only update, and kept when both change.
- `content_text` is right for JSON and for Markdown.
- Two edits within 10 min give one snapshot; an edit after 10 min gives a second.
- The RPC works for owner and editor, fails for viewer and `anon`, and doesn't bump `revision`.
- A direct INSERT into `knowledge_object_versions` by owner or editor still fails.
- `p_fields` with an unknown key, or over the size caps, is rejected.
- A shared editor's save of title and content succeeds with the new trigger in place.
- 10-minute coalescing is proven here by backdating the latest version's `created_at`. The 6-per-hour cap is tested in the database, not in Playwright (Playwright's clock doesn't move the database's `now()`).
- A Markdown-only update (the old client) still works and still checks `revision`.

### Backfill (owner-run, after the 2b deploy)

`scripts/backfill-content-json.mjs`:
- Uses `@blocknote/server-util`'s `tryParseMarkdownToBlocks`, with the service key from the environment.
- Selects rows with `content_json IS NULL AND content IS NOT NULL` in batches of 100.
- Each row is updated with `content_json` plus the **same** `content`, and `revision = <read revision>`, so a row edited meanwhile is skipped and picked up on the next run.
- `--dry-run` prints counts. It is idempotent and safe to re-run.
- The trigger keeps the JSON, because `content_json` changed in the same UPDATE.
- **Note for the builder:** the backfill must not bump `revision` or `updated_at`, or every open editor would hit a false conflict. It runs as service role, so it either sets a session flag (e.g. `SET LOCAL pks.backfill = on`) that `touch_knowledge_object` honours, or uses a SECURITY DEFINER function. The builder picks one and tests it.

### Client content handling

- **Saving:** the editor saves `content_json` (the blocks) and `content` (`blocksToMarkdownLossy`) in the same UPDATE.
- **Loading:** the editor loads `content_json` when present. Otherwise it parses `content` from Markdown, and the next save upgrades the row.
- **Reading:**
  - `ReadOnlyBody` renders from `content_json` synchronously when present, which fixes P7. It falls back to Markdown parsing otherwise.
  - List and dashboard queries keep selecting `content` (or nothing). They never select `content_json`.
- **Exports:** they keep using Markdown `content` (lossy for some block types, which is accepted).
- **Persisted cache:** add `content_json` to the object detail columns, and bump `CACHE_SCHEMA_VERSION` to `'2'`.

### Always-editable page

- `ObjectPage` decides `editable = isOwner || myShare?.role === 'editor'`. Editable objects render `Header` with a title input, `Properties`, and `Editor`. Others render `ReadOnlyBody` with plain text fields.
- There are no Edit, Save or Cancel buttons. **Cancel edit** is replaced by version history plus undo.
- **Focus on open:**
  - New, empty objects focus the title.
  - Other objects don't take focus automatically, so phones don't pop the keyboard and readers don't get a caret.
  - Clicking anywhere in the body places the cursor.
- The object query keeps `refetchOnWindowFocus: false` (part 1), and the editor seeds once per object id. A background refetch never replaces what you are typing.

### The save engine

`src/features/object/save/saveQueue.ts`: one queue per object id in a module-level registry. React reads it through `useSaveQueue(objectId)` (state + `change(fields)`).

**Inputs and outputs:**
- `change(fields)` merges into the pending patch, field by field: `title`, `content` + `content_json`, `summary`, `key_points`, `type`, `status`, `source`, `due_at`, `remind_at`, `cover_url`.
- The slug rule from `buildPatch` still applies when the owner changes the title.
- On success it updates `qk.object.detail(id)` with the returned row, patches the title in cached object lists with `setQueriesData`, and invalidates lists in the background.

**States:**

| State | Shown as | Next |
|---|---|---|
| `idle` | nothing | `change` → `pending` |
| `pending` | "Saving…" | debounce fires → `saving` |
| `saving` | "Saving…" | ok → `saved` (or `pending` if more changes arrived); errors below |
| `saved` | "Saved ✓" (fades after 2 s) | `change` → `pending` |
| `retrying` | "Not saved: retrying" | network/server error; backoff 1, 2, 5, 10, 30 s (cap) |
| `offline` | "Not saved: offline" | resumes when `onlineManager` reports online |
| `conflict` | the conflict bar | owner chooses |
| `blocked` | "Not saved: <reason>" | permission lost or validation error; local copy kept, no auto-retry |

**Timing:**
- Debounce 800 ms after the last change, with a max wait of 5 s during continuous typing.
- Only one request is in flight per object. Changes that arrive during a save are queued for the next one.

**Local copy:**
- Every change writes the pending patch and its `baseRevision` to IndexedDB under `pks-pending-save:<userId>:<objectId>`, throttled to 150 ms.
- The local copy is deleted after a successful save, but only if no newer change arrived.
- It hooks into `clearUserData()` / `claimUserData()` like the part 1 cache: deleted on explicit logout, kept on session expiry.
- It replaces the `pks-draft-<objectId>` sessionStorage drafts. The new-object and quick-capture drafts stay as they are.

**Closing the tab:**
- On `pagehide` or `visibilitychange → hidden`, the queue writes IndexedDB immediately and starts the save without waiting for the debounce.
- If the tab dies first, the local copy is there on the next open.

**Reopening:**
- If a local copy exists for the object, the editor seeds from it on top of the server row.
- A one-line notice says "Restored unsaved changes", and the queue sends them using the stored `baseRevision`.
- If the server has moved on, this leads straight to the conflict bar.

**The save request:**
- `update(patch).eq('id', id).eq('revision', baseRevision).select(<detail columns>)`.
- On success, the returned `revision` becomes the new base.

**Zero rows updated (R7):** re-read the row (`id, revision, user_id`) plus my share role.
- Row gone or deleted → `blocked` ("This object was deleted").
- Revision differs → `conflict`.
- Same revision but I can no longer edit → `blocked` ("You no longer have edit access").

The audit's R7 bug was showing "changed elsewhere" for a permissions failure.

**Errors:** go through `classifyError()`.
- `network` or `server` → `retrying`.
- `offline` → `offline`.
- `auth` → retry once after the session refresh, then `blocked`.
- `validation` or `permission` → `blocked`.
- Server and permission errors are also sent to `reportError()`.

### Conflict bar

- Shown above the editor: **"This changed elsewhere."** with **Keep mine** and **Load theirs**, plus a link to view their version in History.
- Autosave is paused while it shows. Typing is still allowed, and changes keep accumulating in the local copy.
- **Keep mine:**
  1. Call `snapshot_knowledge_object(id, NULL, 'Kept from a conflict before overwrite')`, which saves their current text to history.
  2. Re-read the current `revision`, set it as the base, and send the full pending patch.
  - _(Builder-check call: without step 1 a collaborator's edit would usually vanish, because the 10-minute rule rarely has a snapshot due. That breaks the anti-goal on silent loss, since the collaborator never sees the bar.)_
- **Load theirs:**
  1. Call `snapshot_knowledge_object(id, <my unsent fields>, 'Unsaved edit kept from a conflict')`.
  2. Clear the local copy and refetch the object.
  3. Remount the editor (key on `revision`).
  4. Show a toast "Your version was saved to history".

### Versions in the UI

- History keeps listing versions. Restoring now calls `snapshot_knowledge_object(id)` first, then writes the version's fields through the save queue. Old versions without `content_json` restore from Markdown.
- A **Save version** item in the actions menu calls the RPC with no fields and confirms with a toast.

### Tests (vitest)

- `saveQueue` with fake timers and the part 1 Supabase mock:
  - debounce and max wait;
  - one request in flight;
  - changes during a save;
  - backoff schedule;
  - offline → online;
  - the three R7 outcomes;
  - local copy written, restored and cleared;
  - `pagehide` flush.
- Conflict bar: both buttons call the right things in the right order.
- Content: JSON preferred over Markdown, Markdown fallback, and both columns written together.

---

## 2c. Optimistic edits, undo, reliability, Playwright

**Optimistic mutations** (`src/data` mutation helpers, using part 1's key factory):
- Covers pin, add/remove tag and domain, add/remove link, detach file, delete to trash, and restore from trash.
- Each one updates the cache in `onMutate`, rolls back in `onError` with a `notifyError` toast, and invalidates in `onSettled`.

**Undo toasts (U5):**
- **Covers:** delete, remove tag, domain, link or file, revoke share, and restore version.
- **How it works:** the action applies at once (optimistically), and the toast offers **Undo** for 6 s. Undo runs the inverse mutation: restore from trash, re-add, re-share, or restore the pre-restore snapshot.
- Existing confirmation dialogs for these actions are removed.
- Permanent deletion (emptying trash) keeps its confirmation.

**Client UUIDs:**
- `ObjectNew`, `QuickCapture` and Duplicate generate the id with `crypto.randomUUID()`, insert with it, seed the detail cache, and navigate immediately.
- An insert failure shows the error on the new object page with Retry.
- Offline creation stays out of scope (Phase 6).

**Reliability:**
- **R11:** `withErrorBoundary` resets when the location changes. On a chunk-load error, it reloads the page once, guarded by a sessionStorage flag, and shows a "New version available" screen if that fails. The message no longer claims the error was recorded unless `reportError` ran.
- **R13:** a missing `VITE_SUPABASE_*` variable shows a config-error screen instead of a blank page.
- **Timezone:**
  - Remove the hardcoded `'Africa/Accra'` fallbacks in `AuthContext.jsx`, `Login.jsx`, `Register.jsx` and `Settings.jsx`. Fall back to the browser's timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
  - A small 2c migration drops the `users.timezone` column default. Register writes the browser's timezone for new accounts.
  - Existing stored values are **not** rewritten, because a deliberate Accra can't be told apart from the old default. Instead, Settings shows "Your browser says <zone>. Use it?" when the stored zone differs from the browser's.
  - _(Builder-check call.)_ This makes 2c's prod step "push one small migration".
- **P2:** memoise dashboard rows, and keep search filter state in a ref so a keystroke doesn't re-render every card.

**Playwright (T4):**
- **Setup:** `frontend/e2e/`, run in a new CI job after `supabase start`, using a seeded test user (created by a seed SQL in `supabase/seed-e2e.sql`) against `vite preview`.
- **Smoke tests:** login, create, autosave, search, add a link, trash and restore.
- **Exit tests** (from the roadmap):
  1. Edit, close the tab within 1 s, reopen: the content is present.
  2. The same with the network offline, then reconnect: saved, and the content is present after reload.
  3. Two browser contexts edit the same object: the second gets the conflict bar. **Keep mine** and **Load theirs** each end with the expected text and a version in history.
- **Checks:** opening a cached object takes < 100 ms (part 1 mark). The snapshot cap is proven in pgTAP (see 2b), because Playwright can't move the database clock.

## Exit criteria for part 2

- The three Playwright exit tests pass in CI.
- No object page has an Edit or Save button. Viewers see the read-only view.
- Version history gains ≤ 6 automatic snapshots per hour of continuous editing (pgTAP).
- A pre-2b bundle still opens, edits and saves an object against the migrated database (checked by pgTAP and once by hand).
- After the backfill, every non-empty object has `content_json` and `content_text`.

## Left to the builder

- Exact markup and CSS of the indicator, the conflict bar and the in-place fields, using the 0b design tokens.
- How the backfill avoids bumping `revision` (session flag or definer function), with a test.
- Splitting 2a's component boundaries further if a file still exceeds about 300 lines.
- The Markdown-stripping rules for `content_text` (good enough for search, not perfect).
- Whether `Links.tsx` and `Attachments.tsx` need their own query modules or reuse `objectDetail.ts`.
