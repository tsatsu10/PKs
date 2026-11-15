# Phase 0a part 2c: optimistic edits, undo, client UUIDs and reliability, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** finish 2c. Small edits feel instant and can be undone. New objects open at once. A broken route, a stale chunk or missing env vars never leave a blank page. Timezones stop defaulting to Accra.

**Architecture:**
- One helper (`data/optimistic.ts`) carries the onMutate, onError and onSettled pattern over cache keys. The existing object hooks call it, and keep their public signatures.
- Undo is a toast action, which `ToastContext` gains.
- Client-side creation goes through `data/createObject.ts`. It seeds the cache, inserts in the background, and gates the detail fetch and the save queue until the row exists.
- Reliability adds a route-aware error boundary and a config check before the app bundle loads.
- Timezone adds one migration: drop the column default, and have the signup trigger read `timezone` from the user metadata.

**Tech stack:** React 19, TanStack Query 5, supabase-js, Vitest with Testing Library, pgTAP (local PG18 harness `supabase/local-test/run.sh`), Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-11-14-phase-0a-part2-editor-design.md`, section "2c".

## Global constraints

- Undo toasts last **6 s** (`UNDO_TTL_MS = 6000`). Other toasts keep `TOAST_TTL_MS = 4000`.
- Permanent deletion (Trash → Delete forever) keeps its `window.confirm`. Every other confirmation dialog covered by U5 is removed.
- Offline creation is out of scope (Phase 6). No outbox is added.
- There is no hardcoded `'Africa/Accra'` anywhere in `frontend/src`, apart from datalist suggestions and tests. The fallback is `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Existing stored timezones are **not** rewritten.
- Migrations follow the roadmap's migration rules. A pre-2c client must keep working: it doesn't send `timezone`, so the column stays NULL, and the dashboard RPCs already treat NULL as UTC.
- No Docker. The pgTAP tests run with `bash supabase/local-test/run.sh`, and Playwright runs only in CI. Auto mode can't run `supabase db push`; the owner pushes.
- Run Vitest as `npx vitest run --pool=threads --maxWorkers=1 <path>` when the workers crash.

## Review focus

1. **Undo after the page is gone.** You delete an object, which navigates to `/`, then click Undo. The object comes back, and the dashboard and Trash lists are right. (Task 5 test.)
2. **Undo racing a failure.** The optimistic delete fails on the server, so it rolls back, and the Undo toast must not be left offering to undo something that never happened. The toast is dismissed on error. (Task 3 test.)
3. **Typing before the insert lands.** You type in a new object before its insert finishes. The edits are saved after the insert, not rejected as "This object was deleted". (Task 7 test.)
4. **Create fails, then Retry.** The page shows the error with Retry. Retry inserts the same id, and edits typed meanwhile are kept. (Task 7 and Task 8 tests.)
5. **A chunk error loop.** A deploy removed the chunk and the reload didn't help. The page shows "New version available" instead of reloading forever. (Task 9 test.)

---

### Task 1: Timezone migration (DB)

**Files:**
- Create: `supabase/migrations/20261115000005_timezone_default.sql`
- Create: `supabase/tests/database/21_timezone_default.test.sql`

**Interfaces:**
- Produces: `public.users.timezone` has no default. `handle_new_user()` stores `raw_user_meta_data->>'timezone'` when it is a valid IANA name (found in `pg_timezone_names`), and NULL otherwise. Task 2's Register sends `options.data.timezone`.

- [ ] **Step 1: Write the failing pgTAP test** `21_timezone_default.test.sql`, with `plan(4)`:
  - `col_default_is` / `col_hasnt_default('public','users','timezone')`.
  - Insert into `auth.users` with `raw_user_meta_data = '{"timezone":"Europe/Berlin"}'`, and check that `public.users.timezone = 'Europe/Berlin'`.
  - Metadata `{"timezone":"Not/AZone"}` gives NULL.
  - No timezone key gives NULL.
  - Copy the auth.users insert shape from an existing test that creates users (`grep -l "auth.users" supabase/tests/database`).
- [ ] **Step 2: Run** `bash supabase/local-test/run.sh`. Expected: 21 FAILS (the default still exists).
- [ ] **Step 3: Write the migration.**
  - `ALTER TABLE public.users ALTER COLUMN timezone DROP DEFAULT;`
  - `CREATE OR REPLACE FUNCTION public.handle_new_user()`, keeping the baseline's signature, `SECURITY DEFINER` and `search_path`, and adding:
    ```sql
    INSERT INTO public.users (id, email, display_name, timezone)
    VALUES (NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'displayName', ''),
      (SELECT z.name FROM pg_timezone_names z WHERE z.name = NEW.raw_user_meta_data->>'timezone' LIMIT 1));
    ```
- [ ] **Step 4: Run** `bash supabase/local-test/run.sh`. Expected: all files pass.
- [ ] **Step 5: Commit** `feat(db): no Accra default; signup stores the browser timezone`.

### Task 2: Timezone in the client

**Files:**
- Create: `frontend/src/lib/timezone.ts` and `frontend/src/lib/timezone.test.ts`
- Modify: `context/AuthContext.jsx:25`, `pages/Login.jsx:81`, `pages/Register.jsx:38-56`, `pages/Settings.jsx:92-107`
- Test: `frontend/src/pages/Settings.test.jsx`, which exists or is created

**Interfaces:**
- Produces: `browserTimeZone(): string`, which returns `Intl…timeZone`, or `'UTC'` if that throws or is empty.

- [ ] **Step 1: Write failing tests.**
  - `timezone.test.ts`: it returns the mocked `Intl` zone, and `'UTC'` when `resolvedOptions` throws.
  - Settings test:
    - The stored zone `'Africa/Accra'` with the browser on `'Europe/Berlin'` shows the text "Your browser says Europe/Berlin. Use it?". Clicking **Use it** sets the field to `Europe/Berlin` and doesn't save on its own.
    - With equal zones, the prompt is absent.
    - The stored zone `null` fills the field with the browser zone.
- [ ] **Step 2: Run** `npx vitest run src/lib/timezone.test.ts src/pages/Settings.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Replace every `?? 'Africa/Accra'` fallback with `?? browserTimeZone()`.
  - Register adds `timezone: browserTimeZone()` to `signUp` `options.data`.
  - Settings saves `profileTimezone.trim() || browserTimeZone()`, and renders the "Use it?" prompt next to the timezone field.
  - Update the comment at `Settings.jsx:97`.
- [ ] **Step 4: Run** the tests, then `grep -rn "Africa/Accra" src --include=*.js* --include=*.ts*`. Expected: tests PASS. The only remaining hits are the datalist `<option>`, the placeholder and test files.
- [ ] **Step 5: Commit** `feat(timezone): fall back to the browser zone and offer it in Settings`.

### Task 3: Toast actions and the optimistic helper

**Files:**
- Modify: `frontend/src/context/ToastContext.jsx` and `frontend/src/index.css` (or wherever `.toast` styles live: `grep -rn "toast-dismiss" src --include=*.css`)
- Create: `frontend/src/data/optimistic.ts` and `frontend/src/data/optimistic.test.ts`
- Test: `frontend/src/context/ToastContext.test.jsx`

**Interfaces:**
- Produces: `addToast(type, message, opts?: { action?: { label: string; onClick: () => void }; ttlMs?: number }): string`. It now **returns the toast id**, and `dismiss(id)` already exists.
- Produces: `export const UNDO_TTL_MS = 6000` (ToastContext).
- Produces:
  ```ts
  export async function optimistic<T>(client: QueryClient, opts: {
    keys: QueryFilters[];        // queries snapshotted before apply, restored on error, invalidated after
    apply: () => void;           // cache writes (onMutate)
    run: () => Promise<T>;       // the request; throw on failure
  }): Promise<T>                 // rethrows after rollback; callers notifyError
  ```
  The snapshot uses `client.getQueriesData(filter)` for each filter, and the rollback writes each entry back with `setQueryData`. The invalidation in `finally` is `invalidateQueries(filter)`, and is not awaited.

- [ ] **Step 1: Write failing tests.**
  - Toast:
    - An action renders a button with its label, and clicking it calls `onClick` and dismisses the toast.
    - With `ttlMs: 6000`, the toast is present at 5 999 ms and gone at 6 000 ms (fake timers).
    - `addToast` returns an id that `dismiss` accepts.
  - Optimistic:
    - `apply` runs before `run` resolves (the cache shows the new value while the request is pending).
    - On rejection, every snapshotted key is restored exactly, and the promise rejects with the same error.
    - On success, the cache is not restored, and `invalidateQueries` is called for each filter.
    - A key with no data before `apply` is removed again on rollback.
- [ ] **Step 2: Run** `npx vitest run src/context/ToastContext.test.jsx src/data/optimistic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both.** The action button uses class `toast-action`. The `role="alert"` stays on the toast.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): toast actions and an optimistic-update helper`.

### Task 4: Optimistic tags, domains, links and detach, with Undo

**Files:**
- Modify: `features/object/hooks/useTaxonomyActions.ts`, `useLinks.ts`, `useAttachments.ts`
- Test: the matching `*.test.tsx` files in `features/object/hooks/`

**Interfaces:**
- Consumes: `optimistic`, `addToast` and `UNDO_TTL_MS` from Task 3, and `qk.object.{domains,tags,links,files}(id)`.
- Produces: unchanged hook signatures. The hooks now call `useQueryClient()` and write the cache through `optimistic`. They don't use the `ListSetter` props any more, so drop those from `Options` and from the call sites in `ObjectPage.tsx` / `useObjectPage.ts` if nothing else uses them.

Behaviour, the same for each hook:
- **add tag, add domain, add link:** optimistic, with rollback and `notifyError` on failure. There's no undo (the spec lists only removals).
  - An added link gets a temporary id `tmp:<uuid>` until the invalidation refetches it.
- **remove tag, domain, link or file:** optimistic, then the toast `success` "Tag removed", "Domain removed", "Link removed" or "Attachment removed", with `{ action: { label: 'Undo', onClick: undo }, ttlMs: UNDO_TTL_MS }`.
  - `undo` runs the inverse insert through `optimistic` (re-insert the junction row, or the edge with the same from, to and relationship_type).
  - A failed undo calls `notifyError(err, 'Undo failed')`.
- If the removal's request fails, `dismiss` the undo toast (Review focus 2).
- `invalidateObjectLists()` and `invalidateObject(otherId)` (links) still run after a successful request.

- [ ] **Step 1: Write failing tests** for each hook, mocking supabase as the existing tests do.
  - `removeTag`: the cache drops the tag before the delete resolves, a toast with action label `Undo` is shown, and calling the action re-inserts `{knowledge_object_id, tag_id}` and the tag reappears in the cache.
  - `removeTag` failure: the tag is back in the cache, `notifyError` is called with 'Failed to remove tag', and the undo toast is dismissed.
  - `addTag`: the cache contains the tag before the insert resolves, and a failure removes it.
  - The same pairs for domain, link (outgoing and incoming) and detach.
- [ ] **Step 2: Run** `npx vitest run src/features/object/hooks`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/object` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(object): optimistic tags, domains, links and files with undo`.

### Task 5: Optimistic pin, delete and Trash restore; Undo for delete

**Files:**
- Modify: `features/object/hooks/useObjectActions.ts` (`togglePin`, `remove`) and `pages/Trash.jsx` (`handleRestore`)
- Modify: `frontend/e2e/smoke.e2e.ts:89`, since the dialog is gone
- Test: `features/object/hooks/useObjectActions.test.tsx` and `pages/Trash.test.jsx` (create it if absent)

**Interfaces:**
- Consumes: Task 3. `setObjectInLists(id, patch)`, `invalidateObjectLists()`.
- Produces: `restoreFromTrash(id: string, userId: string): Promise<void>` in `frontend/src/data/trash.ts`, the update `is_deleted=false` that both Trash and the undo of delete use.

Behaviour:
- **togglePin:** the detail and list caches flip at once, and roll back on error.
- **remove:**
  - No `window.confirm`.
  - It runs `await queue?.flush()` first, as it does today, then `navigate('/', { replace: true })`. Then it runs `optimistic` over the `['objects']`, `['search']`, `qk.trash.list()` and `qk.object.detail(id)` filters, applying `setObjectInLists(id, null)`.
  - Then the toast "Moved to Trash" with Undo, which calls `restoreFromTrash` followed by `invalidateObjectLists()` and `invalidateObject(id)`, and the toast "Restored".
  - The undo needs no mounted component: it closes over `client`, `addToast` and `notifyError` only.
- **Trash restore:** `removeRow(id)` is applied optimistically and rolled back on error. There's no undo.

- [ ] **Step 1: Write failing tests.**
  - The pin flips in the cache before the update resolves, and reverts on error.
  - `remove` never calls `window.confirm` (spy) and navigates to `/` before the update resolves.
  - Calling the undo action after the hook is unmounted calls `update({ is_deleted: false })` and invalidates the lists (Review focus 1).
  - The Trash row disappears before the update resolves and comes back on error.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** In `smoke.e2e.ts`, delete the `page.once('dialog', …)` line and add an Undo check:
  - After trashing, click `Undo` in the toast and expect the dashboard row back.
  - Then trash it again and continue with the existing Trash or Restore steps.
- [ ] **Step 4: Run** `npx vitest run src/features/object src/pages` and `npm run typecheck && npm run lint`. Expected: PASS. (The e2e runs in CI.)
- [ ] **Step 5: Commit** `feat(object): optimistic pin, trash and restore; undo for delete`.

### Task 6: Undo for revoking a share and for restoring a version

**Files:**
- Modify: `features/object/hooks/useShares.ts` (`revoke`), `features/object/hooks/useObjectActions.ts` (`restoreVersion`), `features/object/save/saveQueue.ts` (`applyVersion` return type), `data/objectDetail.ts`
- Test: `useShares.test.tsx`, `useObjectActions.test.tsx`, `save/saveQueue.test.ts`

**Interfaces:**
- Produces: `SaveQueue.applyVersion(v): Promise<number>`, which returns the version number of the "Before restoring vN" snapshot. Update the interface at `saveQueue.ts:47`.
- Produces: `fetchVersionSnapshotByNumber(objectId: string, version: number): Promise<VersionSnapshot & { version: number }>` in `data/objectDetail.ts`. It throws the same "doesn't exist" error when the row is missing.

Behaviour:
- **revoke:**
  - Optimistic on the local `shares` state (`useState`, not the cache). Keep the removed row and restore it on error.
  - Toast "Access removed" with Undo, which calls `share_object_by_email` with the row's `shared_with_email` and `role`, then `load()`.
- **restoreVersion:**
  - The toast "Restored to v{N}" gains Undo, which calls `fetchVersionSnapshotByNumber(object.id, before)` and then `queue.applyVersion(...)`, and toasts "Undone".
  - The undo itself creates another "Before restoring" snapshot. That's intended: history stays complete.

- [ ] **Step 1: Write failing tests.**
  - `applyVersion` resolves to the number the `snapshot_knowledge_object` RPC returned.
  - The revoke row disappears at once, comes back on error, and Undo calls `rpc('share_object_by_email', { p_object_id, p_email, p_role })`.
  - The restoreVersion Undo applies the snapshot fetched by `version = before`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/object` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(object): undo for revoking a share and restoring a version`.

### Task 7: Client-side creation (`createObject`)

**Files:**
- Create: `frontend/src/data/createObject.ts` and `frontend/src/data/createObject.test.ts`
- Modify: `data/objectDetail.ts` (`objectDetailQuery` queryFn) and `features/object/save/saveQueue.ts` (`request`)

**Interfaces:**
- Produces:
  ```ts
  export type NewObject = { userId: string; row: Record<string, unknown>; domainIds?: string[]; tagIds?: string[];
    domains?: Named[]; tags?: Named[]; onCreated?: (id: string) => void };
  export function createObject(input: NewObject, client?: QueryClient): string;     // returns the new id synchronously
  export function whenCreated(id: string): Promise<void>;   // resolves at once if no create is pending; waits through failures until a retry succeeds
  export function useCreateState(id: string | undefined): { status: 'none' | 'pending' | 'failed'; error: unknown; retry: () => void };
  ```

Behaviour:
- `createObject` generates `crypto.randomUUID()`.
- It seeds `qk.object.detail(id)` with the full row: `id`, `user_id`, `is_deleted: false`, `revision: 1`, `is_pinned: false`, `current_version: null`, `created_at` and `updated_at` set to now, plus the `row` fields. It seeds `qk.object.domains/tags(id)` with `domains/tags ?? []`, and `links` with `{outgoing:[],incoming:[]}`, and `files`, `versions` and `runs` with `[]`.
- It then starts the attempt: insert `{ id, user_id, ...row }`, then the domain and tag junction rows, then `onCreated(id)` (audit, webhook, notification), then `invalidateObjectLists()`.
- The state lives in a module-level `Map`, and `useCreateState` subscribes through `useSyncExternalStore`.
- A failure sets `failed`. `retry()` re-runs the attempt with the same id, treating a `23505` on the object insert as "already exists" and continuing.
- `whenCreated` returns one deferred per id, resolved on the first success.
- `objectDetailQuery`'s `queryFn` runs `await whenCreated(id)` before `fetchObjectRow`.
- `SaveQueue.request` runs `await whenCreated(this.objectId)` before sending (Review focus 3).

- [ ] **Step 1: Write failing tests.**
  - `createObject` returns a UUID, and the detail cache holds the seeded row synchronously.
  - The insert is called with that id.
  - `useCreateState` goes from `pending` to `none` on success.
  - When the insert fails, the state is `failed`, `whenCreated` is still pending, `retry()` succeeds, and `whenCreated` resolves.
  - When the retry hits `23505`, it still runs the junction inserts and resolves.
  - A detail fetch started while the create is pending calls `fetchObjectRow` only after the insert resolves.
  - SaveQueue: a `change()` made while the create is pending sends its update only after the insert resolves, and never enters `blocked` (use `save/testHarness.ts`).
- [ ] **Step 2: Run** `npx vitest run src/data/createObject.test.ts src/features/object/save`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests plus `npx vitest run src/data`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): client-generated ids with background insert and retry`.

### Task 8: Use `createObject` in ObjectNew, QuickCapture and Duplicate; Retry on the object page

**Files:**
- Modify: `pages/ObjectNew.jsx:150-185`, `pages/QuickCapture.jsx:55-75`, `features/object/hooks/useObjectActions.ts` (`duplicate`) and `features/object/ObjectPage.tsx`
- Test: `features/object/ObjectPage.test.tsx`, `features/object/hooks/useObjectActions.test.tsx`, and the page tests if they exist (`pages/ObjectNew.test.jsx`, `pages/QuickCapture.test.jsx`)

**Interfaces:**
- Consumes: `createObject`, `useCreateState` (Task 7).

Behaviour:
- Each caller builds the same insert fields as today (ObjectNew keeps its slug and template logic), calls `createObject`, clears its draft, toasts as before, and navigates **immediately**.
- The audit, webhook and notification calls move into `onCreated`.
- Duplicate still runs `await queue?.flush()` first.
- `ObjectPage`: when `useCreateState(id).status === 'failed'`, it shows an `role="alert"` bar above the content: "Couldn't create this object: {getErrorMessage(error)}" with a **Retry** button that calls `retry()`. The editor stays usable (its edits wait in the queue).

- [ ] **Step 1: Write failing tests.**
  - ObjectNew submit navigates before the insert resolves (deferred mock).
  - ObjectPage, with a failed create state, shows the alert and Retry, and clicking Retry calls the retry.
  - Duplicate navigates to the new id before the insert resolves, and its domains and tags are passed through.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/pages src/features/object`, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(object): new objects open at once; failed creates offer Retry`.

### Task 9: R11, the route-aware error boundary and chunk-load recovery

**Files:**
- Modify: `components/ErrorBoundary.jsx`, `routeConfig.jsx:13`, `main.jsx` (`onCaughtError`) and `lib/reportError.ts`
- Test: `components/ErrorBoundary.test.jsx` and `lib/reportError.test.ts`

**Interfaces:**
- Produces: `reportError(err): boolean`. It's true when the error was sent, queued, or deduped as already sent, and false when it was skipped (expected kinds, app messages) or the reporter is offline.
- Produces: `ErrorBoundary` props `{ resetKey?: string; fallback? }`. A change of `resetKey` clears the error.
- Produces: `isChunkLoadError(err): boolean`. It matches `name === 'ChunkLoadError'` or a message matching `/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i`.

Behaviour:
- `withErrorBoundary` wraps the children in a small `RouteErrorBoundary` that passes `resetKey={useLocation().pathname}`. The public routes are outside AppShell but still inside the router, so `useLocation` works.
- `componentDidCatch` calls `reportError` and stores whether it returned true. `main.jsx`'s `onCaughtError` stops calling `reportError` (no double report), but `onUncaughtError` keeps it.
- On a chunk error, if sessionStorage `pks-chunk-reload` is absent or older than **10 s**, the boundary sets it to `Date.now()` and calls `location.reload()`. Otherwise it renders "A new version of PKS is available." with a **Reload** button, which removes the key and reloads.
- The generic fallback says "We've recorded the error." only when the report returned true, and otherwise "Something went wrong.". It keeps "Try again".

- [ ] **Step 1: Write failing tests.**
  - After a throw, changing `resetKey` renders the children again.
  - A chunk error with no flag calls `reload` (stub `window.location`) and sets the flag.
  - A chunk error with a flag set 2 s ago shows "A new version of PKS is available." and doesn't reload (Review focus 5).
  - When `reportError` returns false, the text has no "recorded".
  - `reportError` returns false for `new Error('Name is required')` and true for `serverErr()`.
- [ ] **Step 2: Run** `npx vitest run src/components/ErrorBoundary.test.jsx src/lib/reportError.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests plus the full `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(reliability): route-aware error boundary and stale-chunk recovery (R11)`.

### Task 10: R13, the config-error screen

**Files:**
- Create: `frontend/src/lib/config.ts`, `frontend/src/lib/config.test.ts`, `frontend/src/components/ConfigError.jsx` and `frontend/src/bootstrap.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Produces: `missingSupabaseConfig(env = import.meta.env): string[]`, which returns the names of the empty variables among `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Behaviour:
- `bootstrap.jsx` holds everything `main.jsx` has today, exported as `start()`.
- `main.jsx` imports only React, the CSS and `config.ts`. If config is missing, it renders `<ConfigError missing={…} />` ("PKS isn't configured", listing the variable names and "Set them in `frontend/.env` or the hosting settings, then rebuild.").
- Otherwise it calls `import('./bootstrap.jsx').then((m) => m.start())`.
- `lib/supabase.js` keeps its throw as a backstop.

- [ ] **Step 1: Write failing tests.**
  - `missingSupabaseConfig({})` returns both names, one missing returns one name, and both set returns `[]`.
  - `ConfigError` renders each name.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm run build` with the variables unset (`VITE_SUPABASE_URL= npm run build && npx vite preview`, then open it by hand or check with `curl`, which is enough to show the bundle builds). Expected: tests PASS and the build succeeds. Then run `npm run build` with the real env.
- [ ] **Step 5: Commit** `fix(reliability): show a config error instead of a blank page (R13)`.

### Task 11: P2, cheaper dashboard and search re-renders

**Files:**
- Modify: `components/DashboardObjectCard.jsx` (`export default memo(DashboardObjectCard)`), `features/dashboard/components/DashboardView.jsx:403-440` and `features/dashboard/hooks/useDashboardPage.js`
- Test: `components/DashboardObjectCard.test.jsx`

Behaviour:
- Cards receive only stable props. Hoist `objectLink` out of the row loop into a `useCallback` keyed on `runPromptTemplate?.id`, or pass `to` strings, which are stable already. `toggleSelect` is a `useCallback`, and `selected` stays a boolean.
- `useDashboardPage` keeps the latest filter values in a ref that `runSearch` reads, so typing in the search box doesn't change `runSearch`'s identity or anything the card list receives.
- Do the same for the list-view rows if they're a separate component: find them with `grep -n "Row" features/dashboard/components/Views`.

- [ ] **Step 1: Write a failing test.** Render a parent that holds a `query` state and three memoised cards with fixed props, and count renders with a `vi.fn` render probe or React's `<Profiler>`. Changing the parent's `query` doesn't re-render the cards.
- [ ] **Step 2: Run** it. Expected: FAIL (the card isn't memoised).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/components src/features/dashboard`. Expected: PASS.
- [ ] **Step 5: Commit** `perf(dashboard): memoise cards and keep filter state in a ref (P2)`.

### Task 12: Whole-branch check and PR

- [ ] Run `npm run typecheck && npm run lint && npx vitest run --pool=threads --maxWorkers=1` in `frontend/`, and `bash supabase/local-test/run.sh`. Expected: all green.
- [ ] Push the branch and open a PR. The PR body lists the owner's prod step: **push migration `20261115000005` before or with the deploy**. The client works either way: an old trigger just ignores the `timezone` metadata.
- [ ] Wait for CI (the e2e smoke now covers Undo). Expected: all checks pass.
