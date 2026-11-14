# Phase 0a part 2b: content model, always-editable objects, autosave and versions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Objects open straight into editing and save themselves. Unsent edits survive reloads and outages, conflicts stop and ask, and version history is coalesced to at most one automatic snapshot per 10 minutes.

**Architecture:**
- **Database (Task 1):** one expand-only migration adds `content_json` / `content_text`, a sync trigger, coalesced snapshots, and two RPCs (snapshot, backfill). pgTAP covers it.
- **Save engine (Tasks 4–5):** a per-object engine (`features/object/save/`) owns debounce, the IndexedDB local copy, sending with the `revision` check, retry, flush on hide, and the conflict state. React reads it through `useSaveQueue`.
- **Page (Task 7):** the 2a page loses Edit/Save/Cancel. Title, properties, summary, key points and content become uncontrolled in-place fields that feed the queue, so typing never re-renders the page (keeps P3).

**Tech Stack:** Postgres 17 + pgTAP (local PG18 harness `supabase/local-test/run.sh`), React 19, TanStack Query 5 (part 1 `src/data`), BlockNote 0.55, `idb-keyval`, Vitest + Testing Library + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-11-14-phase-0a-part2-editor-design.md` (section "2b"; "Delivery" row 2b).

**Starting point:** branch `feat/phase-0a-part2b-autosave`, stacked on `feat/phase-0a-part2-editor` (PR #7, 2a). Rebase onto `main` once #7 merges. Paths below are 2a's layout.

## Global Constraints

- **Migrations are expand-only.** A pre-2b bundle must still open, edit and save an object against the migrated database (roadmap migration rule 1).
- **Production database work is the owner's.** Push the migration, run `gen:types`, deploy, then run the backfill. The Supabase MCP is read-only. No Docker.
- **Every migration ships with pgTAP**, run with `bash supabase/local-test/run.sh`.
- **New files are TypeScript.** Supabase reads stay in `src/data`. Write RPCs called outside `src/data` go on the allow-list in `frontend/eslint.config.js`.
- **Timing values:**
  - debounce 800 ms, max wait 5 s;
  - local-copy write throttle 150 ms;
  - "Saved ✓" fades after 2 s;
  - retry backoff 1, 2, 5, 10, 30 s, then every 30 s.
- **Version and size values:** snapshot window 10 min; `p_fields` keys `title, content, content_json, summary, key_points`; `content` ≤ 1 MB, `content_json` ≤ 2 MB (else `22023`); `p_reason` ≤ 200 chars.
- **Indicator copy:** `Saving…`, `Saved ✓`, `Not saved: retrying`, `Not saved: offline`, `Not saved: <reason>`.
- **Conflict copy:** `This changed elsewhere.`, `Keep mine`, `Load theirs`, toast `Your version was saved to history`, notice `Restored unsaved changes`.
- **Blocked reasons:** `This object was deleted`, `You no longer have edit access`.
- **Snapshot reasons:**
  - `Kept from a conflict before overwrite` (Keep mine)
  - `Unsaved edit kept from a conflict` (Load theirs)
  - `Before restoring v<N>` (restore)
- **Local-copy key:** `pks-pending-save:<userId>:<objectId>`. It replaces the `pks-draft-<objectId>` drafts. The new-object and quick-capture drafts stay.
- **Persisted cache:** `CACHE_SCHEMA_VERSION = '2'`. List and dashboard queries never select `content_json` or `content_text`.
- **No focus on open,** except a new, empty object focuses its title.
- **Every task ends green:** `npm run lint`, `npm run typecheck`, `npm test` (from `frontend/`). Task 1 also runs `bash supabase/local-test/run.sh`, and the last task also runs `npm run build` and `npm run check:bundle`.

## Review Focus

1. **Leaving within the debounce window** (type, then click another object or the Dashboard within 800 ms): the edit is still saved. Test in Task 4.
2. **A deploy lands mid-edit:** an old `pks-draft-<id>` sessionStorage draft is adopted once into the queue (with its `_baseRevision`), not dropped. Test in Task 7.
3. **Restore or Save version with unsent edits:** the queue flushes first, so the snapshot holds what you typed. Test in Task 5.
4. **Keep mine / Load theirs when the snapshot RPC fails** (offline, 5xx): the conflict bar stays, and the local copy and pending edits are kept. Test in Task 5.
5. **Sign out while retrying:** queues stop and the local copies are deleted. Session expiry keeps them. Test in Task 4.

---

### Task 1: Migration, RPCs and pgTAP

**Files:**
- Create: `supabase/migrations/20261114000001_content_model_and_versions.sql`
- Create: `supabase/tests/database/17_content_and_versions.test.sql`
- Modify: `supabase/tests/database/01_object_touch.test.sql`, `02_versions.test.sql`, `03_shared_guard.test.sql`, but only where they assume one snapshot per edit (make each fixture's second edit happen after backdating the latest version by 11 minutes)

**Interfaces (Produces):**
- **Columns:**
  - `knowledge_objects.content_json jsonb NULL`
  - `knowledge_objects.content_text text NULL`
  - `knowledge_object_versions.content_json jsonb NULL`
- **Helpers:**
  - `public.blocknote_plain_text(jsonb) RETURNS text IMMUTABLE`
  - `public.markdown_plain_text(text) RETURNS text IMMUTABLE`
- **Content trigger:** `public.sync_object_content()` via `trg_knowledge_objects_sync_content`, BEFORE INSERT OR UPDATE. The name sorts after `trg_knowledge_objects_guard` and before `_updated_at` and `_version`.
- **RPC `public.snapshot_knowledge_object(p_object_id uuid, p_fields jsonb DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS int`:**
  - Keys missing from `p_fields` fall back to the current row's values.
  - Returns the new version number.
- **RPC `public.backfill_object_content_json(p_id uuid, p_revision bigint, p_content_json jsonb) RETURNS boolean`:**
  - Returns true when the row was updated.
  - Execute is granted to `service_role` only.

**Behavior** (spec "Migration"):
- **`sync_object_content`:**
  - On UPDATE: if `content` changed and `content_json` did not, set `content_json := NULL`.
  - `content_text := blocknote_plain_text(content_json)` when it isn't null, else `markdown_plain_text(content)`.
- **`touch_knowledge_object`:**
  - Its ignored list gains `content_text`.
  - When `current_setting('pks.backfill', true) = 'on' AND auth.uid() IS NULL`, it keeps `OLD.revision` and `OLD.updated_at`.
- **`guard_knowledge_object_update`:** `editor_writable` gains `content_text`.
- **`save_knowledge_object_version`:**
  - Same WHEN as today.
  - It inserts `OLD` (with `content_json`) and bumps `current_version` only if `NOT EXISTS (a version of this object with created_at > now() - interval '10 minutes')`.
- **`snapshot_knowledge_object`:**
  - SECURITY DEFINER, `SET search_path = public`.
  - Raises `42501` unless the caller is the owner or has an `editor` share on a non-deleted object.
  - Validates the keys and size caps (`22023`), and caps the reason at 200 characters.
  - Writes `edited_by = auth.uid()`, then bumps `current_version` with an UPDATE that `touch` ignores.
  - REVOKE from PUBLIC and anon; GRANT to authenticated.
- **`backfill_object_content_json`:** SECURITY DEFINER. It runs `set_config('pks.backfill','on', true)`, then `UPDATE … SET content_json = p_content_json WHERE id = p_id AND revision = p_revision AND content_json IS NULL`, and returns `FOUND`.

- [ ] **Step 1: Write `17_content_and_versions.test.sql`**

Fixtures follow `02_versions.test.sql`: `tests.create_user`, `tests.act_as`, and `RESET ROLE; SELECT set_config('request.jwt.claims','',true);` between users.

One assertion each:
- **Content sync:**
  - A Markdown-only update nulls `content_json`; an update of both keeps it.
  - `content_text` for JSON `[{"type":"paragraph","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world"}],"children":[]},{"type":"heading","content":[{"type":"text","text":"Title"}],"children":[{"type":"paragraph","content":[{"type":"text","text":"Nested"}],"children":[]}]}]` is `E'Hello world\nTitle\nNested'`.
  - `content_text` for Markdown `E'# Title\n\n**bold** and [link](http://x)'` is `E'Title\n\nbold and link'`.
- **Coalescing:**
  - Two title edits within 10 min make 1 snapshot.
  - After `UPDATE knowledge_object_versions SET created_at = now() - interval '11 minutes'`, a third edit makes 2.
  - `current_version` bumps only with a snapshot.
  - Six edits, each after backdating, make at most 6 snapshots (the anti-goal cap).
- **The snapshot RPC:**
  - It works for owner and editor, returns the new version, and leaves `revision` unchanged.
  - It throws `42501` for viewer and for anon.
  - `p_fields` `{"title":"mine","content":"x"}` gives a version with title `mine`, content `x`, and `summary` from the row.
  - `p_fields` with key `slug` throws `22023`.
  - `content` of 1 MB + 1 byte throws `22023`.
- **Unchanged rules:**
  - A direct INSERT into `knowledge_object_versions` as owner or editor still throws `42501`.
  - An editor update of `title, content, content_json` lives (guard plus new trigger).
  - A Markdown-only update with `.eq('revision', n)`-style `WHERE revision = n` still matches and bumps `revision` (old client).
- **The backfill RPC:**
  - As service role (no claims), it sets `content_json` and keeps `revision` and `updated_at`.
  - With a stale `p_revision` it returns false.
  - As `authenticated` it throws `42501` (no grant).

- [ ] **Step 2: Run, see it fail**

Run: `bash supabase/local-test/run.sh supabase/tests/database/17_content_and_versions.test.sql`
Expected: FAIL (`column "content_json" does not exist`).

- [ ] **Step 3: Write the migration and fix the fixtures in 01–03**

Use plain SQL for the plain-text helpers:
- **JSON:** per block, the `jsonb_path_query(block, 'lax $.content[*].**.text')` strings joined with `''`. Recurse into `children`, and join blocks with `E'\n'`.
- **Markdown:** `regexp_replace` passes for headings, emphasis, inline code, links/images (keep the text), blockquote and list markers.

- [ ] **Step 4: Run the whole database suite**

Run: `bash supabase/local-test/run.sh`
Expected: every file `.. ok`.

- [ ] **Step 5: Commit**: `git commit -m "feat(db): content_json/content_text, coalesced versions, snapshot and backfill RPCs"`

---

### Task 2: Backfill script

**Files:**
- Create: `frontend/scripts/backfill-content-json.mjs`, `frontend/scripts/backfillContent.mjs` (pure logic), `frontend/scripts/backfillContent.test.mjs`
- Modify: `frontend/package.json` (devDependency `@blocknote/server-util@0.55.0`; script `"backfill:content": "node scripts/backfill-content-json.mjs"`), `frontend/vite.config.js` (include `scripts/**/*.test.mjs` in vitest)

**Interfaces:**
- Consumes: `backfill_object_content_json` (Task 1).
- Produces: `backfillBatch({ fetchBatch, parse, write, dryRun }): Promise<{ scanned: number; updated: number; skipped: number; failed: number }>` in `backfillContent.mjs`.
  - `fetchBatch(after: string | null)` returns up to 100 rows `{ id, content, revision }` where `content_json IS NULL AND content IS NOT NULL`, ordered by `id`.
  - `parse(md)` returns blocks.
  - `write(id, revision, blocks)` returns boolean.
- **CLI:**
  - Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
  - `--dry-run` prints counts and writes nothing.
  - Uses `ServerBlockNoteEditor.create().tryParseMarkdownToBlocks`.
  - Pages by `id > after` until a short batch, and prints the totals.

- [ ] **Step 1: Write failing tests** (`backfillContent.test.mjs`):
  - **Two batches are walked:** two pages (100 rows, then 3) give `scanned: 103`, and `fetchBatch` is called with the last id of page 1.
  - **Dry run:** `dryRun: true` never calls `write`, and `updated` is 0.
  - **Skips and failures:**
    - `write` returning false counts as `skipped` (edited meanwhile; the next run picks it up).
    - `parse` throwing counts as `failed`, and the run continues.
- [ ] **Step 2: Run them and see them fail**: `npx vitest run scripts` → FAIL (module missing).
- [ ] **Step 3: Implement `backfillContent.mjs` and the CLI wrapper.**
- [ ] **Step 4: Run them and see them pass**: `npx vitest run scripts` → PASS.
- [ ] **Step 5: Commit**: `git commit -m "feat(scripts): content_json backfill (owner-run, idempotent, revision-safe)"`

---

### Task 3: Data layer for the new columns

**Files:**
- Modify:
  - `frontend/src/data/database.types.ts` (hand-add the three columns and two RPCs in generator format; the owner's `gen:types` after the push must give no diff)
  - `src/data/objectDetail.ts`
  - `src/data/objects.ts`
  - `src/data/exports.ts`
  - `src/data/persistence.ts`
  - `src/features/object/types.ts`
  - `frontend/eslint.config.js`
- Test: `src/data/objectDetail.test.tsx`, `src/data/objects.test.tsx`

**Interfaces (Produces):**
- **Columns:**
  - `OBJECT_COLS` gains `content_json`.
  - `ObjectRow` (features) gains `content_json: unknown[] | null`.
  - `VersionSnapshot` and `fetchVersionSnapshot` select `content_json`.
- **List columns:** `LIST_COLS` in `data/objects.ts` is `OBJECT_COLS` without `content_json`. It is applied with `.select(LIST_COLS)` to:
  - every `search_knowledge_objects` call (dashboard page, `searchLinkTargets`);
  - `suggest_linked_objects`;
  - `fetchFilteredObjectIds` (`.select('id')`).
- **Save check:** `fetchSaveCheck(id: string, userId: string): Promise<{ row: { revision: number; user_id: string; is_deleted: boolean } | null; shareRole: 'viewer' | 'editor' | null }>` in `data/objectDetail.ts` (R7).
- **Cache:** `CACHE_SCHEMA_VERSION = '2'`.
- **Lint:** the RPC allow-list gains `snapshot_knowledge_object`.

- [ ] **Step 1: Write failing tests:**
  - `objects › the dashboard page never asks for content_json`: the `rpc(...).select` call's argument doesn't contain `content_json` or `content_text`. Extend `mockSupabase().rpc` to return a chainable result with `.select` that records its argument.
  - `objectDetail › fetchSaveCheck returns the row and my share role`
  - `objectDetail › fetchSaveCheck returns row null when RLS hides it`
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/data` → FAIL.
- [ ] **Step 3: Implement the changes listed in the Interfaces block**
- [ ] **Step 4: Run** `npx vitest run src/data && npm run typecheck && npm run lint` → PASS
- [ ] **Step 5: Commit**: `git commit -m "feat(data): content_json in object detail, lean list columns, save check, cache v2"`

---

### Task 4: Save engine core (queue, local copy, flush)

**Files:**
- Create in `frontend/src/features/object/save/`:
  - `saveQueue.ts`, `localCopy.ts`, `saveQueue.test.ts`, `localCopy.test.ts`
- Modify:
  - `src/lib/objectForm.js` (export `slugForTitle(title: string, id: string): string | null`, used by `buildObjectPatch`)
  - `src/main.jsx` (or wherever `registerUserDataHooks` is first wired) to register the local-copy hooks

**Interfaces (Produces):**

```ts
export type SaveFields = Partial<{
  title: string; content: string; content_json: unknown[] | null; summary: string | null;
  key_points: unknown[]; type: string; status: string; source: string | null;
  due_at: string | null; remind_at: string | null; cover_url: string | null;
}>;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'offline' | 'conflict' | 'blocked';
export type SaveState = { status: SaveStatus; message: string | null };
export interface SaveQueue {
  readonly objectId: string;
  getState(): SaveState;
  subscribe(listener: () => void): () => void;
  change(fields: SaveFields): void;
  /** Send now, skipping the debounce; resolves when nothing is pending or the queue is not sending. */
  flush(): Promise<void>;
  pending(): SaveFields;
  baseRevision(): number;
  /** Stop timers and listeners; keeps the local copy. */
  dispose(): void;
}
export function openSaveQueue(opts: {
  objectId: string; userId: string; isOwner: boolean; baseRevision: number; client?: QueryClient;
}): Promise<{ queue: SaveQueue; restored: { fields: SaveFields; baseRevision: number } | null }>;
export function disposeAllSaveQueues(): void;
```

`localCopy.ts`:
- `readLocalCopy(userId, objectId)`
- `writeLocalCopy(userId, objectId, { fields, baseRevision })` (throttled 150 ms)
- `writeLocalCopyNow(…)`
- `deleteLocalCopy(userId, objectId)`
- `deleteLocalCopies(ownerId: string | null)`
- `localCopyKey(userId, objectId)` returns `pks-pending-save:<userId>:<objectId>`

**Behavior:**
- **Registry and opening:**
  - One queue per object id. `openSaveQueue` for an id that already has a queue returns the same queue.
  - `restored` is the stored copy if one exists. The queue then seeds `pending` from it and schedules a save with the stored `baseRevision`.
- **`change()`:**
  - Merges field by field, and sets `slug: slugForTitle(title, id)` with a title only when `isOwner`.
  - Drops owner-only fields (`type`, `status`, `due_at`, `remind_at`, `cover_url`) when not `isOwner`.
  - Writes the local copy (throttled) and moves to `pending`.
- **Timing:**
  - Debounce 800 ms, max wait 5 s from the first unsent change.
  - One request in flight. Changes during a save are sent next, with the returned `revision` as the base.
- **Request:** `supabase.from('knowledge_objects').update(patch).eq('id').eq('revision', base).select(OBJECT_COLS)`.
- **On success with a row:**
  - `setQueryData(qk.object.detail(id), row)`, `setObjectInLists(id, { title, updated_at })`, and `invalidateObjectLists()` without awaiting.
  - The new base is `row.revision`.
  - Delete the local copy only if nothing newer is pending.
  - Status becomes `saved`, then `idle` after 2 s.
- **Hiding and leaving:**
  - On `pagehide` or `visibilitychange` → hidden: `writeLocalCopyNow` and `flush()`.
  - **Leaving the page:** `ObjectPage` calls `queue.flush().finally(dispose)` on unmount. The registry entry is removed only when idle.
- **User-data hooks:**
  - `onClear(owner)` runs `disposeAllSaveQueues()` and `deleteLocalCopies(owner)`.
  - `onClaim(userId)` deletes other users' copies.

This task covers the success path only. Zero rows and errors come in Task 5. Until then, a zero-row result or an error leaves `pending` intact and sets status `blocked` with the message `Not saved`.

- [ ] **Step 1: Write failing tests** (fake timers, `mockSupabase`, `fake-indexeddb` from `src/test/setup.js`):
  - **Debounce:**
    - `change` at t=0 and t=500 ms sends exactly one update at t=1300 ms with both fields.
    - Continuous `change` every 300 ms sends the first update at 5 s.
  - **In-flight:**
    - With a request held open, three more changes send nothing more until it resolves, then exactly one update.
    - That update carries `eq('revision', <returned revision>)`.
  - **Patch rules:**
    - An owner title change sends `slug` starting `new-`.
    - An editor title change sends no `slug`, and an editor `status` change is dropped.
  - **On success:**
    - The detail cache holds the returned row.
    - The status goes `saving` → `saved` → `idle` after 2 s.
    - `readLocalCopy` is null.
  - **Local copy:**
    - It's written 150 ms after `change`.
    - `openSaveQueue` on an id with a stored copy returns `restored`, and its first update uses the stored `baseRevision`.
  - **`pagehide` flush:** dispatch `pagehide` on `window` 100 ms after a change; the update is sent immediately.
  - **Leaving within the debounce window** (Review Focus 1): `change`, then `flush()` + `dispose()` at 200 ms sends the update.
  - **Sign out while pending** (Review Focus 5): `clearUserData()` stops further sends (advance 10 s: no update) and deletes the copy. `claimUserData('other')` deletes the old user's copies, while session expiry (no clear) keeps them.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object/save` → FAIL.
- [ ] **Step 3: Implement `localCopy.ts`, `saveQueue.ts` and `slugForTitle`; register the hooks.**
- [ ] **Step 4: Run** `npx vitest run src/features/object/save src/lib/objectForm.test.js && npm run typecheck` → PASS
- [ ] **Step 5: Commit**: `git commit -m "feat(object): save queue with debounce, IndexedDB local copy and flush on hide"`

---

### Task 5: Save engine failures, R7, conflicts and versions

**Files:**
- Modify: `frontend/src/features/object/save/saveQueue.ts`
- Test: `saveQueue.failures.test.ts`, `saveQueue.conflict.test.ts`

**Interfaces:**
- Consumes: `fetchSaveCheck` (Task 3), `classifyError` / `reportError`, `onlineManager`, `supabase.auth.refreshSession`, `snapshot_knowledge_object`.
- Produces: `SaveQueue` gains:
  - `keepMine(): Promise<void>`
  - `loadTheirs(): Promise<void>`, which resolves after the refetch and emits `onReloaded`
  - `snapshot(reason?: string): Promise<number>`, which flushes first and then calls the RPC with `p_fields` null
  - `applyVersion(v: { version: number; title: string; content: string | null; content_json: unknown[] | null; summary: string | null; key_points: unknown }): Promise<void>`, which flushes, snapshots with reason `Before restoring v<N>`, then `change(v fields)` and `flush()`
  - `onReloaded(listener: () => void): () => void`

**Behavior:**
- **Zero rows updated (R7):** `fetchSaveCheck`:
  - row null or `is_deleted` → `blocked` with `This object was deleted`;
  - `row.revision !== base` → `conflict`;
  - otherwise not owner and `shareRole !== 'editor'` → `blocked` with `You no longer have edit access`.
- **Errors, by `classifyError`:**
  - `network` or `server` → `retrying`, with backoff 1, 2, 5, 10, 30 s, then 30 s;
  - `offline`, or `onlineManager` offline before sending → `offline`, resuming on online;
  - `auth` → `refreshSession()` and retry once, then `blocked`;
  - `validation` or `permission` → `blocked` (message from `getErrorMessage`).
  - `server` and `permission` also go to `reportError`.
- **While `conflict` or `blocked`:** `change()` keeps merging into `pending` and the local copy, but sends nothing.
- **`keepMine()`:**
  1. `snapshot_knowledge_object(id, null, 'Kept from a conflict before overwrite')`.
  2. `fetchSaveCheck` → base = `row.revision`.
  3. Send the full pending patch.
  - If step 1 or 2 throws, stay in `conflict` with pending and the local copy kept, and re-throw for the UI.
- **`loadTheirs()`:**
  1. `snapshot_knowledge_object(id, <pending subset of the five keys>, 'Unsaved edit kept from a conflict')`.
  2. Clear pending and the local copy.
  3. `refetchQueries(qk.object.detail(id))`, set the base from the refetched row, set status `idle`, and emit `onReloaded`.
  - If step 1 throws, stay in `conflict` with nothing cleared, and re-throw.

- [ ] **Step 1: Write failing tests:**
  - **Backoff:** a network error (`{ message: 'Failed to fetch' }`) retries at +1, +2, +5, +10, +30 and +30 s (count the update calls at each mark), and the state is `retrying`.
  - **Offline:** `onlineManager.setOnline(false)` before the debounce gives `offline` and no update; `setOnline(true)` sends.
  - **Auth:** a `PGRST301` error calls `refreshSession` once, then retries once, then `blocked`.
  - **R7:** three tests, one per outcome above, with the exact messages.
  - **Typing while blocked:** in `conflict`, `change` updates the local copy and sends nothing.
  - **Keep mine:** the RPC is called with `p_fields: null` and the conflict reason, before an update whose `eq('revision')` is the re-read revision.
  - **Load theirs:** the RPC is called with `p_fields` containing the pending title and content, then the local copy is deleted, then the detail query is refetched, then `onReloaded` fires (assert the order).
  - **A failing snapshot** (Review Focus 4): `rpc` rejects with `Failed to fetch` → both methods reject, the status stays `conflict`, and `readLocalCopy` still holds the pending fields.
  - **Unsent edits are flushed first** (Review Focus 3): with an unsent `change`, `applyVersion(v)` sends that update before the RPC call, and then sends the version's fields. `snapshot()` does the same.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object/save` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/object/save && npm run typecheck && npm run lint` → PASS
- [ ] **Step 5: Commit**: `git commit -m "feat(object): retries, offline, R7 outcomes, conflict resolution and version actions in the save queue"`

---

### Task 6: Content in and out (Editor, ContentView) and the save UI pieces

**Files:**
- Create in `frontend/src/features/object/`:
  - `content.ts`
  - `ContentView.tsx`
  - `save/useSaveQueue.ts`
  - `SaveIndicator.tsx`
  - `ConflictBar.tsx`
  - tests `Editor.test.tsx` (extend), `ContentView.test.tsx`, `ConflictBar.test.tsx`, `SaveIndicator.test.tsx`
- Modify: `Editor.tsx` (it stops using `components/BlockNoteEditor.jsx`, which stays for ObjectNew and QuickCapture)

**Interfaces (Produces):**
- **`content.ts`:**
  - `export type ContentFields = { content: string; content_json: unknown[] }`
  - `export async function toContentFields(editor: BlockNoteEditor): Promise<ContentFields>`: the document as JSON, plus `blocksToMarkdownLossy` (an empty document gives `''`).
- **`Editor`:**
  - Props: `{ initialJson: unknown[] | null; initialMarkdown: string; onChange(fields: ContentFields): void; autoFocus?: boolean }`.
  - It uses `useCreateBlockNote({ initialContent })` when `initialJson` is set, and otherwise parses `initialMarkdown` once.
  - It still never sets state per keystroke (P3), and stays memoized.
- **`ContentView({ json, markdown })`:** when `json` is set, it renders synchronously with `useCreateBlockNote({ initialContent: json })` and `editable={false}` (P7). Otherwise it falls back to `components/BlockNoteViewer`.
- **`useSaveQueue({ objectId, userId, isOwner, baseRevision })`:** returns `{ ready: boolean; queue: SaveQueue | null; state: SaveState; restored: { fields: SaveFields; baseRevision: number } | null; seed: number }`.
  - It uses `useSyncExternalStore` over the queue.
  - `seed` increments on `onReloaded`. Fields and the editor key on `${objectId}:${seed}`.
  - On unmount it runs `queue.flush().finally(queue.dispose)`.
- **`SaveIndicator({ state })`:** the indicator copy from Global Constraints, `aria-live="polite"`.
- **`ConflictBar({ queue, onLoaded })`:**
  - Shows `This changed elsewhere.`, **Keep mine**, **Load theirs**, and a link `View their version in History` that scrolls to the History card.
  - Both buttons are disabled while one runs.
  - Errors go through `useNotifyError`.
  - `onLoaded` shows the `Your version was saved to history` toast.

- [ ] **Step 1: Write failing tests:**
  - **Editor seeding:**
    - `Editor › seeds from JSON when present`: mock `@blocknote/react`'s `useCreateBlockNote` and assert it receives `initialContent` equal to the JSON, and that no Markdown parse happens.
    - `Editor › falls back to Markdown`: with `initialJson` null, `tryParseMarkdownToBlocks` is called with the Markdown.
  - **`content › toContentFields returns both columns`**, from a fake editor.
  - **`ContentView › renders JSON without waiting`**: the text is in the DOM in the first render, with no `findBy`.
  - **SaveIndicator:** one case per status, with the exact copy.
  - **ConflictBar:** the buttons call `keepMine` / `loadTheirs`, both are disabled while pending, and a rejection shows an error toast with the bar still shown.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object` → FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/object && npm run typecheck && npm run lint` → PASS
- [ ] **Step 5: Commit**: `git commit -m "feat(object): BlockNote JSON in the editor and read view (P7), save indicator and conflict bar"`

---

### Task 7: Always-editable page

**Files:**
- Create: `frontend/src/features/object/Properties.tsx`, `InPlaceFields.tsx` (title, summary, key points), `legacyDraft.ts`, `legacyDraft.test.ts`
- Modify:
  - `ObjectPage.tsx`, `Header.tsx`, `History.tsx`, `ReadOnlyBody.tsx`
  - `hooks/useObjectActions.ts` (restore now calls `queue.applyVersion`; `Save version` calls `queue.snapshot()` + the toast `Version saved`)
  - `useObjectPage.ts` (drops `draft`)
  - `ObjectPage.test.tsx`
- Delete: `hooks/useEditSession.ts` (+ test), `EditForm.tsx`. Remove `DRAFT_KEYS.object` usage (`lib/draftStorage.js` keeps `new` / `quick`).

**Interfaces:**
- Consumes: `useSaveQueue`, `Editor`, `ContentView`, `SaveIndicator`, `ConflictBar` (Task 6), `SaveQueue.applyVersion` / `snapshot` (Task 5).
- **`ObjectPage`:**
  - `editable = isOwner || myShare?.role === 'editor'`.
  - **Editable:** renders the conflict bar (when `state.status === 'conflict'`), the indicator next to the title, `InPlaceFields`, `Properties`, and `Editor`.
  - **Not editable:** renders `ReadOnlyBody`, whose content comes from `ContentView`.
  - It shows the `Restored unsaved changes` notice when `restored` is set.
- **Seeding:** every field seeds from `restored.fields` over the server row, once per `${objectId}:${seed}`.
- **`InPlaceFields({ object, initial, editable, onChange, autoFocusTitle })`:**
  - Uncontrolled inputs (`defaultValue`): the title as `<input aria-label="Title">`, summary as `<textarea aria-label="Summary">`, and key points as `<textarea aria-label="Key points">` with one point per line, saved as a string array with blank lines dropped.
- **`Properties({ object, initial, isOwner, onChange })`:**
  - Type, status, source, due, remind, cover.
  - Non-owners get read-only text for everything except `source` (spec: editors write source).
- **Focus:** `autoFocusTitle` is true only when `object.title === ''` and there's no content. Nothing else autofocuses.
- **Clicking the body:** a click on the empty area below the editor (the `detail-main` padding, not on a block) puts the cursor at the end of the last block: `editor.setTextCursorPosition(lastBlock, 'end')` and then `editor.focus()`. `Editor` exposes this as `focusEnd()` through `forwardRef`.
- **`legacyDraft.ts`:** `adoptLegacyDraft(objectId: string): { fields: SaveFields; baseRevision: number | null } | null` reads `pks-draft-<id>` (via `getDraft`), maps it to `SaveFields`, and deletes it. `ObjectPage` passes the result to `queue.change` once, after `ready`, using the draft's base revision when the queue has no restored copy.
- **`Header`:**
  - Loses Edit, Save and Cancel.
  - Gains **Save version** (editable only).
  - Keeps Pin, Export, Duplicate, Share, Delete with today's rules.

- [ ] **Step 1: Write failing tests:**
  - **`ObjectPage.test.tsx`:** update the Task 1 (2a) cases:
    - Owner and editor: no `Edit` / `Save` / `Cancel` buttons, and the `Title` textbox is present on load.
    - Viewer: no `Title` textbox, and the heading shows the title.
    - The two old save tests become: type in `Title`, advance 800 ms (fake timers) → the update has `title: 'New'` and `eq('revision', 3)`, and the indicator shows `Saved ✓`.
    - The zero-row case → the conflict bar shows `This changed elsewhere.`
    - The draft test becomes **"a legacy session draft is adopted"** (Review Focus 2): `sessionStorage['pks-draft-o1'] = { title:'Drafted', _baseRevision: 3 }` → `Title` has value `Drafted`, an update with `title: 'Drafted'` is sent after 800 ms, and the `pks-draft-o1` key is removed.
    - Restore → the RPC `snapshot_knowledge_object` is called with reason `Before restoring v1`, then an update with the version's title.
    - `Save version` → the RPC is called with `p_fields: null`, and a `Version saved` toast appears.
    - `moving to another object resets the page` stays as it is, apart from removing the Edit click.
  - **Focus:** `a new empty object focuses its title; an existing one focuses nothing` (`document.activeElement`).
  - **Clicking the body:** `clicking below the content puts the cursor in the editor`: with a mocked `Editor` exposing a `focusEnd` spy, a click on the main column's empty area calls it once, and a click on the Title input doesn't.
  - **`legacyDraft.test.ts`:** mapping and key removal; returns null with no draft.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object` → FAIL.
- [ ] **Step 3: Implement, then delete `useEditSession`, `EditForm` and the object-draft plumbing.** `grep -rn "useEditSession\|EditForm\|DRAFT_KEYS.object" src` must print nothing.
- [ ] **Step 4: Run the full gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle` → PASS.
- [ ] **Step 5: Commit**: `git commit -m "feat(object): always-editable objects with autosave, in-place fields, conflict bar and coalesced versions"`

---

## After the last task

- **Open the PR** `feat/phase-0a-part2b-autosave` → `main` (after #7 merges and this branch is rebased), titled "Phase 0a part 2b: autosave and always-editable objects". The body lists the owner's production steps in order:
  1. `supabase db push` (migration `20261114000001`), after `bash supabase/local-test/run.sh` passes;
  2. `npm run gen:types`, and confirm there's no diff against the hand-added types;
  3. deploy;
  4. `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run backfill:content -- --dry-run`, then without `--dry-run`, and re-run until `updated` is 0.
- **The manual checklist:**
  - Edit, close the tab within 1 s, reopen: the text is there.
  - Go offline, edit, come back online: it saves.
  - Two tabs editing the same object: the second gets the bar. Try both **Keep mine** and **Load theirs**, and check History in each case.
  - A pre-2b bundle (the previous deploy's URL) still edits and saves.
  - A viewer gets the read view, and nothing takes focus on a phone.
- **Playwright exit tests** are part 2c.
