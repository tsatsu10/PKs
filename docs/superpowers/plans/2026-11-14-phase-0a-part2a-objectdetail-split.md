# Phase 0a part 2a: split ObjectDetail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1,433-line `src/pages/ObjectDetail.jsx` with small TypeScript components and hooks under `src/features/object/`, without changing what users see. The only behavior changes are four audit fixes (P3, R16, D7, B13).

**Architecture:**
1. Lock in today's behavior with page-level tests first.
2. Move pure code (the export builders) into `lib/export.js`.
3. Move each group of handlers into a focused hook, then each section of markup into a component.
4. `ObjectPage.tsx` composes them.
5. Each task keeps the page tests green.

**Tech Stack:** React 19, react-router 7, TanStack Query (part 1 `src/data`), BlockNote 0.55, Vitest + Testing Library, TypeScript strict for new files (`tsconfig.app.json`).

**Spec:** `docs/superpowers/specs/2026-11-14-phase-0a-part2-editor-design.md` (section "2a").

## Global Constraints

- **No visible change** except P3, R16, D7 and B13. Same routes and URLs, same CSS class names, same button labels and toasts.
- **New files are TypeScript** (`.ts` / `.tsx`), and `npm run typecheck` (`tsc -b`) must pass. Importing existing `.js`/`.jsx` modules is allowed.
- **No new file over ~300 lines.**
- **Keep the part 1 perf marks:** `performance.mark('pks:object-open')` when the id changes, and `performance.mark('pks:object-visible')` once per object id.
- **Supabase reads stay in `src/data`** (part 1 lint rule). Writes may stay in the hooks.
- **Every task ends green:** `npm run lint`, `npm run typecheck` and `npm test` all pass. The last task also runs `npm run build` and `npm run check:bundle`.
- **Run commands from** `frontend/`.

## Review Focus

1. **Moving from one object to another** (`/objects/o1` → `/objects/o2`): edit mode, panels and link search reset, and the new title shows. Test in Task 1.
2. **Ctrl+Shift+R while typing in an input** does not open the run-prompt panel. Test in Task 4.
3. **Export with no tags, domains, links or summary** leaves those sections out entirely (no empty headings). Test in Task 2.
4. **The link-search dropdown** closes on Escape and on a click outside. Test in Task 3.
5. **Download when the popup is blocked** (`window.open` returns `null`) shows "Allow pop-ups…", with no crash and no orphan window. Test in Task 7.

---

## File map

| File | Responsibility |
|---|---|
| `src/features/object/ObjectPage.tsx` | Route component: loads data through `useObjectPage`, wires hooks to components, and handles loading/error/empty states |
| `src/features/object/ObjectPage.test.tsx` | Page-level behavior tests (Task 1) |
| `src/features/object/ObjectPage.css` | Moved from `pages/ObjectDetail.css`, unchanged |
| `src/features/object/useObjectPage.ts` | Moved from `hooks/useObjectDetail.js` (same return shape) |
| `src/features/object/hooks/useEditSession.ts` | Edit mode, form, draft save/restore, before-unload, save with the revision check, cancel |
| `src/features/object/hooks/useObjectActions.ts` | Restore version, duplicate, delete, pin |
| `src/features/object/hooks/useTaxonomyActions.ts` | Add/remove domain and tag |
| `src/features/object/hooks/useLinks.ts` | Add/remove link, plus link-search state |
| `src/features/object/hooks/useAttachments.ts` | Attach, download (R16), detach |
| `src/features/object/hooks/useShares.ts` | Load, add and revoke shares |
| `src/features/object/hooks/useRunPrompt.ts` | Run-prompt state, the Ctrl+Shift+R shortcut, the `?runPrompt=` param, generate/save handlers |
| `src/features/object/hooks/useObjectExport.ts` | Export panel state and `handleExport` |
| `src/features/object/Header.tsx` | Breadcrumbs, link search slot, action buttons |
| `src/features/object/LinkSearch.tsx` | Header link-search input and dropdown |
| `src/features/object/ReadOnlyBody.tsx` | Title, cover, source, summary, content viewer |
| `src/features/object/MetaLine.tsx` | Type, status, due, remind, updated, version |
| `src/features/object/EditForm.tsx` | Today's edit form (title … content); it goes away in 2b |
| `src/features/object/Editor.tsx` | BlockNote wrapper that writes into a ref (P3) |
| `src/features/object/AiPanel.tsx` | Synthesize CTA + run-prompt panel (moved from `components/ObjectDetailRunPromptPanel.jsx`) |
| `src/features/object/Taxonomy.tsx` | Domains and Tags cards |
| `src/features/object/Attachments.tsx` | Attachments card |
| `src/features/object/Links.tsx` | Links card + "Related you might link" card |
| `src/features/object/History.tsx` | Both version-history cards + Prompt runs card |
| `src/features/object/SharePanel.tsx` | Moved from `components/ObjectDetailSharePanel.jsx` |
| `src/features/object/ExportPanel.tsx` | Moved from `components/ObjectDetailExportPanel.jsx` |
| `src/features/object/types.ts` | Shared types: `ObjectRow`, `Named`, `OutgoingLink`, `IncomingLink`, `FileRow`, `ExportInclude`, `PageError` |
| `src/lib/export.js` | Gains the four object export builders + `escapeHtml` |
| `src/data/objectDetail.ts` | `fetchLinks` drops trashed targets (D7) |
| `src/components/BlockNoteMantineProvider.jsx` | Hoisted theme object (P3) |
| `src/routeConfig.jsx` | Imports `ObjectPage` instead of `pages/ObjectDetail` |
| deleted | `src/pages/ObjectDetail.jsx`, `src/pages/ObjectDetail.css`, `src/hooks/useObjectDetail.js`, the three `components/ObjectDetail*Panel.jsx` |

**Shared prop conventions** (every hook and component):
- `object: ObjectRow`.
- `isOwner: boolean`.
- `canEdit: boolean`.
- `setError: (msg: string) => void`, the page-level error banner from `useObjectPage().setError`.
- Hooks never import each other. `ObjectPage` passes values between them.

---

### Task 1: Page tests and the `ObjectPage` entry point

**Files:**
- Create: `src/features/object/ObjectPage.tsx` (temporary: `export { default } from '../../pages/ObjectDetail';`)
- Create: `src/features/object/ObjectPage.test.tsx`
- Modify: `src/routeConfig.jsx` (the import of `ObjectDetail` becomes `ObjectPage` from `./features/object/ObjectPage`; `ObjectDetailRoute` renders `<ObjectPage key={id} />`)

**Interfaces:**
- Produces: `default export ObjectPage` (no props; reads `:id` from the route). Every later task keeps these tests passing.

**Test harness** (top of `ObjectPage.test.tsx`):
- `vi.mock('../../lib/supabase')` with `mockSupabase()` (as in `data/objectDetail.test.tsx`).
- `vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: currentUser } }) }))`, where `currentUser` is a mutable test variable.
- `vi.mock('../../components/BlockNoteEditor')` → a `<textarea aria-label="Content">` that calls `onChange(value)`.
- `vi.mock('../../components/BlockNoteViewer')` → `<div data-testid="viewer">{content}</div>`.
- `vi.mock` of `../../lib/audit`, `../../lib/notifications`, `../../lib/webhooks` and `../../lib/objectView` (no-ops), and of `../../lib/download` (`downloadBlob: vi.fn()`).
- Render inside the real `ToastProvider`, `createTestQueryClient()` and `<MemoryRouter initialEntries={['/objects/o1']}>` with `<Route path="/objects/:id" element={<ObjectPage />} />` (key by id as `routeConfig` does).
- `respond(call)` returns:
  - `OBJ = { id:'o1', user_id:'owner', type:'note', title:'First', content:'body', summary:'S', key_points:[], is_deleted:false, revision:3, current_version:2, status:'active', updated_at:'2026-11-01T00:00:00Z', created_at:'2026-11-01T00:00:00Z', is_pinned:false }` for the object `maybeSingle`;
  - `myShare` from a test variable;
  - one version row `{ id:'v1', version:1, title:'Old', created_at:'2026-10-01T00:00:00Z' }`;
  - otherwise `[]`.

- [ ] **Step 1: Write the failing tests**

`ObjectPage.test.tsx`, one `it` each:
- `owner sees pin, duplicate, share, edit, delete and link search`: buttons named `Pin`, `Duplicate`, `Share`, `Edit`, `Delete`; the `Search objects to link` input is present.
- `editor sees Edit but not owner-only actions`: `currentUser='ed'`, `myShare={id:'s', role:'editor'}`. `Edit` is present; `Pin`, `Delete`, `Share` and `Duplicate` are absent.
- `viewer sees no edit controls`: `myShare={role:'viewer'}`. No `Edit` button and no link-search input.
- `save sends only changed fields and checks the revision`: click `Edit`, change the `Title` input to `New`, click `Save`. The `knowledge_objects` update call has `ops` containing `['update',[{ title:'New', slug: expect.stringMatching(/^new-/) }]]` and `['eq',['revision',3]]`. The toast `Changes saved` appears.
- `a save that updates no rows reports a conflict`: respond `[]` to the update. The `role="alert"` text contains `changed elsewhere`, and the `Save` button is still shown.
- `a stored draft reopens the editor`: `sessionStorage['pks-draft-o1'] = JSON.stringify({ title:'Drafted', _baseRevision:3 })` before render. The `Title` input value is `Drafted`, and the toast `Draft restored` appears.
- `restore version writes the snapshot guarded by current_version`: `fetchVersionSnapshot` (`knowledge_object_versions` `single`) returns `{ title:'Old', content:'x' }`. Clicking `Restore` sends an update with `['eq',['current_version',2]]`, and the toast `Restored to v1` appears.
- `markdown export downloads a file named after the title`: click `Export`, then the panel's export button. `downloadBlob` is called with a Blob and `'First.md'`.
- `marks the object visible for the perf check`: after the title renders, `performance.getEntriesByName('pks:object-visible').length` is `1`.
- `moving to another object resets the page` (Review Focus 1): start in edit mode on `o1`, navigate (via a test `<Link to="/objects/o2">`) to `o2` with title `Second`. Heading `Second` shows, and no `Save` button.

- [ ] **Step 2: Run the tests: they fail only because `ObjectPage` doesn't exist**

Run: `npx vitest run src/features/object/ObjectPage.test.tsx`
Expected: FAIL, "Failed to resolve import './ObjectPage'".

- [ ] **Step 3: Create the re-export and switch `routeConfig.jsx`**

- [ ] **Step 4: Run the tests and the full suite**

Run: `npx vitest run src/features/object/ObjectPage.test.tsx && npm test && npm run typecheck`
Expected: all PASS. If a test fails because current behavior differs from what's written above, fix the **test** to match today's behavior and note it in the commit. These tests describe what exists.

- [ ] **Step 5: Commit**

```bash
git add src/features/object src/routeConfig.jsx
git commit -m "test(object): pin ObjectDetail behavior before the split; add ObjectPage entry"
```

---

### Task 2: Export builders into `lib/export.js`

**Files:**
- Modify: `src/lib/export.js` (add functions), `src/lib/export.test.js`, `src/pages/ObjectDetail.jsx` (call the new functions; delete lines 730–824 and 869–913)

**Interfaces:**
- Produces (in `lib/export.js`), with `ctx = { object, domains, tags, outgoing, incoming }` (same shapes the page uses today):
  - `buildObjectExportText(ctx, asMarkdown: boolean, include): string`
  - `buildObjectExportHtml(ctx, include): string`
  - `buildObjectExportJson(ctx, include): string`
  - `buildObjectExportDocxBlob(ctx, include): Promise<Blob>`
  - `escapeHtml(s: string): string`
- Bodies are moved verbatim from `ObjectDetail.jsx`, replacing closure variables with `ctx.*`. `escapeHtml` keeps its DOM-based implementation.

- [ ] **Step 1: Write the failing tests** in `src/lib/export.test.js`:
  - `buildObjectExportText markdown has the summary, tags and links sections`: with a summary `S`, tag `ai`, and one outgoing link to `Other`, the output contains `## Summary\nS`, `**Tags:** \nai` and `- Out: Other`.
  - `buildObjectExportText leaves out empty sections` (Review Focus 3): with no summary, tags, domains or links, `include` all true, the output contains none of `Summary`, `Tags`, `Domains` or `Links`.
  - `buildObjectExportHtml escapes the title`: title `<script>x</script>` gives `&lt;script&gt;` in the output and no `<script>`.
  - `buildObjectExportJson includes only what include allows`: `include.tags=false` gives no `tags` key, and `links.outgoing[0]` equals `{ title:'Other', type:'references' }`.
- [ ] **Step 2: Run them and see them fail**: `npx vitest run src/lib/export.test.js` → FAIL ("is not a function").
- [ ] **Step 3: Move the four builders and `escapeHtml`; have the page call them with `ctx`**
- [ ] **Step 4: Run** `npx vitest run src/lib/export.test.js src/features/object && npm run lint` → PASS
- [ ] **Step 5: Commit**: `git commit -am "refactor(export): move object export builders into lib/export"`

---

### Task 3: Data hook, shared types, and the taxonomy/link/attachment/share hooks

**Files:**
- Create: `src/features/object/types.ts`, `src/features/object/useObjectPage.ts` (moved from `src/hooks/useObjectDetail.js`; update the import in `src/data/objectDetail.test.tsx`), `src/features/object/hooks/useTaxonomyActions.ts`, `useLinks.ts`, `useAttachments.ts`, `useShares.ts`, and a test file per hook next to it (`*.test.ts(x)`)
- Modify: `src/pages/ObjectDetail.jsx` (replace the moved handlers and state with the hooks)
- Delete: `src/hooks/useObjectDetail.js`

**Interfaces:**
- `types.ts`:
  - `ObjectRow` (the columns in `data/objectDetail.ts` `OBJECT_COLS`, as nullable fields where the DB allows)
  - `Named = { id: string; name: string }`
  - `LinkTarget = { id: string; title: string; type: string }`
  - `OutgoingLink = { id: string; to_object_id: string; relationship_type: string; target: LinkTarget }`
  - `IncomingLink = { id: string; from_object_id: string; relationship_type: string; source: LinkTarget }`
  - `FileRow = { id: string; filename: string; mime_type: string | null; size_bytes: number | null; storage_key?: string | null }`
  - `ExportInclude = Record<'content'|'summary'|'key_points'|'tags'|'domains'|'links', boolean>`
  - `SetError = (msg: string) => void`
- `useObjectPage({ id, userId }: { id?: string; userId?: string })`: same return object as today's `useObjectDetail`, typed.
- `useTaxonomyActions({ object, allDomains, allTags, setObjectDomains, setObjectTags, setError })` → `{ addDomain(id: string): Promise<void>; removeDomain(id: string): Promise<void>; addTag(id: string): Promise<void>; removeTag(id: string): Promise<void> }`
- `useLinks({ object, userId, otherObjects, outgoingLinks, incomingLinks, setOutgoingLinks, setIncomingLinks, setError })` → `{ addLink(toId: string, type?: string): Promise<void>; removeLink(edgeId: string, isOutgoing: boolean): Promise<void>; search: { query: string; setQuery(q: string): void; results: LinkTarget[]; open: boolean; setOpen(o: boolean): void; containerRef: React.RefObject<HTMLDivElement | null> } }`. It keeps the 300 ms debounce, Escape-to-close and click-outside behavior.
- `useAttachments({ object, userId, setAttachedFiles, setError })` → `{ uploading: boolean; attach(e: React.ChangeEvent<HTMLInputElement>): Promise<void>; download(f: FileRow): Promise<void>; detach(fileId: string): Promise<void> }`. `download` keeps today's behavior here; Task 7 changes it.
- `useShares({ object, userId, setError })` → `{ shares: ShareRow[]; email: string; setEmail(s: string): void; role: 'viewer'|'editor'; setRole(r: 'viewer'|'editor'): void; sharing: boolean; load(): Promise<void>; add(e: React.FormEvent): Promise<void>; revoke(id: string): Promise<void> }` (`ShareRow` from `data/objectDetail.ts`)

- [ ] **Step 1: Write failing hook tests** (`renderHook` + `mockSupabase` + `createTestQueryClient`):
  - `useTaxonomyActions › addTag inserts the link row and adds the tag sorted by name`: insert call on `knowledge_object_tags` with `{ knowledge_object_id:'o1', tag_id:'t2' }`; `setObjectTags` was given an updater that sorts `[{id:'t1',name:'b'}]` + `{id:'t2',name:'a'}` into `a, b`.
  - `useTaxonomyActions › a failed removeDomain reports through setError`: respond with an error; `setError` called with a non-empty string.
  - `useLinks › search closes on Escape and on an outside click` (Review Focus 4): `setOpen(true)`; dispatching `keydown` Escape on `document` makes `open` false; open again, then `mousedown` on `document.body` makes it false.
  - `useLinks › search waits 300 ms and excludes the current object`: fake timers; `rpc('search_knowledge_objects')` returns `[{id:'o1'},{id:'o9'}]`; after `advanceTimersByTime(300)`, `results` equals `[{id:'o9'}]`.
  - `useShares › revoke of a pending invite deletes from share_invites`: `revoke('invite:i1')` gives a delete on `share_invites` with `eq('id','i1')`.
  - `useShares › add rejects an invalid email without calling the RPC`: `setError('Please enter a valid email address.')`; `rpc` not called.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object/hooks` → FAIL (modules missing).
- [ ] **Step 3: Implement the hooks by moving code** out of `ObjectDetail.jsx` (handlers at lines 222–253, 430–575, 922–979, plus their state at lines 80–113), then wire the page to them.
- [ ] **Step 4: Run** `npx vitest run src/features/object src/data/objectDetail.test.tsx && npm run lint && npm run typecheck` → PASS
- [ ] **Step 5: Commit**: `git commit -am "refactor(object): move data hook and taxonomy, link, attachment and share actions into features/object"`

---

### Task 4: Edit session, object actions, run prompt and export hooks (with P3)

**Files:**
- Create: `src/features/object/hooks/useEditSession.ts`, `useObjectActions.ts`, `useRunPrompt.ts`, `useObjectExport.ts`, and tests next to each
- Modify: `src/pages/ObjectDetail.jsx` (now just state wiring + JSX), `src/components/BlockNoteMantineProvider.jsx`

**Interfaces:**
- `useEditSession({ id, object, isOwner, draft, setObject, setError, userId })` returns:
  - `{ editing: boolean; editForm: EditFormFields; setField<K extends keyof EditFormFields>(k: K, v: EditFormFields[K]): void; contentRef: React.MutableRefObject<string>; initialContent: string; onContentChange(markdown: string): void; start(): void; cancel(): void; save(): Promise<void>; saving: boolean }`
  - `EditFormFields` = today's `editForm` shape: `title`, `content`, `summary`, `source`, `status`, `due_at`, `remind_at`, `cover_url`.
- **P3:** `onContentChange` only writes `contentRef.current`. It does not set state. `save()` and the 500 ms draft timer read `contentRef.current` into `content`. The draft timer is a debounced callback triggered by `setField` and `onContentChange`, not by an effect on `editForm`.
- `useObjectActions({ object, userId, objectDomains, objectTags, reload, setObject, setError })` → `{ restoreVersion(v: { id: string; version: number }): Promise<void>; restoringVersion: string | null; duplicate(): Promise<void>; duplicating: boolean; remove(): Promise<void>; deleting: boolean; togglePin(): Promise<void>; pinning: boolean }`
- `useRunPrompt({ object, userId, promptTemplates, setPromptRuns, setError })` → every run-prompt value and setter `ObjectDetailRunPromptPanel` takes today (same prop names), plus `applicableTemplates`, `showRunPanel`, `openRunPanel(): void`, `closeRunPanel(): void`. It owns the Ctrl+Shift+R listener and the `?runPrompt=` effect.
- `useObjectExport({ object, userId, objectDomains, objectTags, outgoingLinks, incomingLinks, setError })` → `{ show: boolean; setShow(v: boolean | ((p: boolean) => boolean)): void; format; setFormat; template; setTemplate; include: ExportInclude; setInclude; applyTemplate(t: string): void; run(): Promise<void> }`. It calls the Task 2 builders.
- `BlockNoteMantineProvider`: `const MANTINE_THEME = { primaryColor: 'pink' }` at module level, passed as `theme={MANTINE_THEME}`.

- [ ] **Step 1: Write failing tests**:
  - `useEditSession › typing content does not re-render the host`: count renders with a `renderHook` callback counter. Call `onContentChange('a')`, `onContentChange('ab')`, and the render count is unchanged.
  - `useEditSession › save sends the latest typed content`: `start()`, `onContentChange('typed')`, `await save()`. The update payload contains `content:'typed'`, with `['eq',['revision',3]]`.
  - `useEditSession › the draft includes the latest content after 500 ms`: fake timers; `start()`, `onContentChange('x')`, advance 500 ms. `JSON.parse(sessionStorage['pks-draft-o1']).content === 'x'` (set `sessionStorage['pks-drafts-owner']='u1'` first, because `setDraft` needs an owner).
  - `useRunPrompt › Ctrl+Shift+R opens the panel with the first applicable template`: dispatch `keydown` `{ ctrlKey:true, shiftKey:true, key:'R' }` on `document` → `showRunPanel` true and `runTemplateId` is the first applicable template.
  - `useRunPrompt › Ctrl+Shift+R while typing in an input does nothing` (Review Focus 2): focus an `<input>` appended to the body, dispatch the same event → `showRunPanel` false.
  - `useObjectActions › delete is cancelled when confirm returns false`: `vi.spyOn(window,'confirm').mockReturnValue(false)` → no update call.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object/hooks` → FAIL.
- [ ] **Step 3: Implement the four hooks by moving code** out of the page (lines 99–220, 255–429, 577–867), wire the page, and hoist the Mantine theme.
- [ ] **Step 4: Run** `npx vitest run src/features/object && npm run lint && npm run typecheck` → PASS (including all Task 1 page tests).
- [ ] **Step 5: Commit**: `git commit -am "refactor(object): move edit session, object actions, run prompt and export into hooks; stop re-rendering the page per keystroke (P3)"`

---

### Task 5: Sidebar components

**Files:**
- Create: `src/features/object/Taxonomy.tsx`, `Attachments.tsx`, `Links.tsx`, `History.tsx`
- Modify: `src/pages/ObjectDetail.jsx` (replace `<aside>` lines 1162–1396 with the components)

**Interfaces** (props only; markup moved verbatim from the listed lines):
- `Taxonomy({ isOwner, objectDomains, objectTags, availableDomains, availableTags, suggestedTags, panelErrors, retryPanel, actions })`, where `actions = ReturnType<typeof useTaxonomyActions>`. Lines 1163–1230.
- `Attachments({ isOwner, files, error, onRetry, attachments })`, where `attachments = ReturnType<typeof useAttachments>`. Lines 1231–1262.
- `Links({ isOwner, outgoing, incoming, availableToLink, suggested, error, onRetry, links, prefetch })`, where `links = ReturnType<typeof useLinks>`. Covers lines 1302–1375 ("Related you might link" and "Links").
- `History({ isOwner, versions, versionsError, onRetryVersions, promptRuns, promptTemplates, runsError, onRetryRuns, restoreVersion, restoringVersion })`. Lines 1263–1301 and 1376–1395 (both version cards and Prompt runs), keeping today's ordering rules.
- `ObjectDetail.jsx` keeps the `<aside className="detail-sidebar">` wrapper and renders `Taxonomy, Attachments, History(owner part), Links, History(read-only part)` in today's order. `History` takes a `variant: 'owner' | 'readonly'` prop to keep the two positions.

- [ ] **Step 1: Write failing component tests** (`Taxonomy.test.tsx`, `Links.test.tsx`, `History.test.tsx`):
  - `Taxonomy › non-owner sees chips without remove buttons or add selects`: no `button[aria-label^="Remove"]`, no `+ Add tag` option.
  - `Taxonomy › a panel error shows QueryError with Retry calling retryPanel('tags')`.
  - `Links › outgoing and incoming links render with prefetch props and owner remove buttons`.
  - `History › readonly variant lists at most 10 versions`: 12 versions give 10 `li`.
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object` → FAIL on the new files.
- [ ] **Step 3: Create the components by moving markup; render them from the page**
- [ ] **Step 4: Run** `npx vitest run src/features/object && npm run lint && npm run typecheck` → PASS
- [ ] **Step 5: Commit**: `git commit -am "refactor(object): split the sidebar into Taxonomy, Attachments, Links and History"`

---

### Task 6: Main column, panels and the final `ObjectPage`

**Files:**
- Create: `src/features/object/Header.tsx`, `LinkSearch.tsx`, `MetaLine.tsx`, `ReadOnlyBody.tsx`, `EditForm.tsx`, `Editor.tsx`, `AiPanel.tsx`, `SharePanel.tsx`, `ExportPanel.tsx`, `ObjectPage.css`
- Modify: `src/features/object/ObjectPage.tsx` (the full composition replaces the re-export)
- Delete: `src/pages/ObjectDetail.jsx`, `src/pages/ObjectDetail.css`, `src/components/ObjectDetailSharePanel.jsx`, `ObjectDetailExportPanel.jsx`, `ObjectDetailRunPromptPanel.jsx`

**Interfaces:**
- `Header({ object, isOwner, canLink, editing, saving, actions, edit, exportState, shares, linkSearch, prefetch, outgoingLinks })` holds the markup of lines 987–1048. `canLink` gates `LinkSearch` (Task 7 sets it).
- `LinkSearch({ links, outgoingLinks, prefetch })`: lines 992–1022.
- `MetaLine({ object })`: lines 1083–1099.
- `ReadOnlyBody({ object, synthesize?: ReactNode })`: lines 1117–1157. `synthesize` is the owner's CTA from `AiPanel`.
- `EditForm({ object, isOwner, edit })`, with `edit = ReturnType<typeof useEditSession>`: lines 1101–1114. It renders `<Editor initialValue={edit.initialContent} onChange={edit.onContentChange} />`.
- `Editor({ initialValue: string; onChange(md: string): void })`: thin wrapper over `components/BlockNoteEditor` with today's props (`placeholder`, `minHeight={280}`, `aria-label="Content"`).
- `AiPanel`: exports `SynthesizeCta({ run })` (lines 1141–1156) and `RunPromptPanel({ object, run, error })` (the moved `ObjectDetailRunPromptPanel`, props from `useRunPrompt`).
- `SharePanel` and `ExportPanel`: the moved components, typed props unchanged.
- `ObjectPage`:
  - Calls `useObjectPage` and the eight hooks.
  - Computes `isOwner`, `canEdit`, `availableDomains/Tags/ToLink`.
  - Keeps both perf marks.
  - Renders the loading skeleton and error states (lines 981–983), and passes `canLink={canEdit}` for now.
  - Must stay under ~300 lines. If it's over, move the derived values into `useObjectPage`.

- [ ] **Step 1: Write failing tests**:
  - `Editor.test.tsx › forwards changes without re-rendering its parent`: mocked `BlockNoteEditor`; typing calls `onChange` with the text, and a parent render counter stays at 1.
  - `ObjectPage.test.tsx`: switch the import to the real component. All Task 1 tests must pass unchanged.
- [ ] **Step 2: Run and see the new test fail**: `npx vitest run src/features/object/Editor.test.tsx` → FAIL.
- [ ] **Step 3: Create the components, compose `ObjectPage`, move the CSS (import `./ObjectPage.css`), delete the old files, and fix imports** (`grep -rn "pages/ObjectDetail\|ObjectDetail.*Panel\|hooks/useObjectDetail" src` must print nothing)
- [ ] **Step 4: Run the full gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle` → all PASS. `wc -l src/features/object/*.tsx src/features/object/**/*.ts` shows no file over ~300 lines.
- [ ] **Step 5: Commit**: `git commit -am "refactor(object): compose ObjectPage from features/object and remove pages/ObjectDetail"`

---

### Task 7: The audit fixes R16, D7, B13

**Files:**
- Modify: `src/features/object/hooks/useAttachments.ts` (R16), `src/data/objectDetail.ts` `fetchLinks` (D7), `src/features/object/ObjectPage.tsx` + `Links.tsx` (B13)
- Test: `useAttachments.test.ts`, `src/data/objectDetail.test.tsx`, `ObjectPage.test.tsx`

**Behavior:**
- **R16:** `download(f)` calls `window.open('', '_blank')` **synchronously, before any `await`**.
  - Once the signed URL arrives, it sets `win.location.href = signedUrl`.
  - On error it calls `win.close()` and `setError(...)`.
  - If `window.open` returns `null`, it calls `setError('Your browser blocked the download window. Allow pop-ups for this site, then try again.')` and does not request a signed URL.
- **D7:** in `fetchLinks`, the targets query selects `id, title, type, is_deleted`. Links whose target is deleted are dropped from both lists. Unknown targets (not returned by RLS) keep today's `'Unknown'` placeholder.
- **B13:** the header `LinkSearch` and the "Related you might link" Link buttons render only for the owner (`canLink={isOwner}`). Inserting `link_edges` is owner-only under RLS.

- [ ] **Step 1: Write failing tests**:
  - `useAttachments › download opens the window before awaiting the signed URL`: `const open = vi.spyOn(window,'open').mockReturnValue(fakeWin)`. `createSignedUrl` returns a promise that never resolves. Calling `download(f)` without awaiting it means `open` has already been called once.
  - `useAttachments › download with a blocked popup shows the pop-up message` (Review Focus 5): `open` returns `null` → `setError` called with the text above, and `storage.from().createSignedUrl` is not called. Extend `mockSupabase` with a `storage` stub if needed.
  - `objectDetail › links to trashed objects are hidden`: outgoing to `a` (`is_deleted:false`) and `b` (`is_deleted:true`), incoming from `b` → outgoing ids `['a']`, incoming `[]`.
  - `ObjectPage › editor does not see link search or related Link buttons`: role editor → no `Search objects to link` input, no `Link` button in "Related you might link".
- [ ] **Step 2: Run and see them fail**: `npx vitest run src/features/object src/data/objectDetail.test.tsx` → FAIL on the four new tests.
- [ ] **Step 3: Implement the three fixes**
- [ ] **Step 4: Run the full gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle` → PASS
- [ ] **Step 5: Commit**: `git commit -am "fix(object): open download windows synchronously (R16), hide trashed links (D7), owner-only link controls (B13)"`

---

## After the last task

- Open the PR `feat/phase-0a-part2-editor` → `main` titled "Phase 0a part 2a: split ObjectDetail". The body lists the four fixes and has a manual check list:
  - open an object as owner;
  - edit, save and see the toast;
  - restore a version;
  - export as Markdown;
  - download an attachment;
  - open an object shared as editor (no link search) and as viewer (no Edit).
- No production database steps for 2a.
- Plans for 2b and 2c are written after 2a merges, so they start from the new file layout.
