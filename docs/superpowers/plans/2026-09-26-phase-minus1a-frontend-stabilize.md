# Phase −1A: Frontend Stabilize & Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the data-loss, security-patch, bundle, mobile and contrast problems in the PKS frontend, and delete dead features, without touching the database schema.

**Architecture:** Small pure helpers go in `frontend/src/lib/` and are unit-tested with Vitest. Pages and components are then rewired to use them. Deleted features are removed end to end (files, imports, CSS, routes). A build-output checker (`scripts/check-bundle.mjs`) and a CSS token test lock in the bundle and design-token fixes. CI runs all of it.

**Tech Stack:** React 19, Vite 7, vite-plugin-pwa, Vitest 4 + Testing Library (jsdom), plain CSS with tokens in `src/index.css`, Supabase JS client. There is no TypeScript.

**Spec:**
- `docs/plans/2026-09-26-ultimate-knowledge-base-roadmap.md` (Phase −1, plan −1A)
- `docs/plans/2026-09-26-codebase-audit.md` (finding IDs like B2, R6 and D10 refer to it)

## Global Constraints

- **Working directory:** every command runs from `frontend/` unless a step says otherwise.
- **No database changes.** Tables, columns and RPCs stay as they are. Dropping `export_jobs`, the Integrations "generic" type, PromptBank `output_format` and the `openai` constraint belong to plan −1B.
- **No new runtime dependencies.** Dev dependencies are also off-limits, except what `npm audit fix` or the BlockNote upgrade changes.
- **Match the existing code style:** plain JS/JSX, 2-space indent, single quotes, JSDoc comments on exported helpers, and tests beside the module (`foo.js` → `foo.test.js`) using `import { describe, it, expect } from 'vitest'`.
- **Checks that must pass after every task:**
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run check:bundle`, once Task 4 adds it
- **Commits:** one per task. End each message with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Lint rule stays for now.** Keep the `no-unused-vars` `varsIgnorePattern: '^[A-Z_]'` setting. It is Vite's default, needed because core ESLint doesn't count JSX usage, and it is replaced in Phase 0. It hides unused UPPERCASE imports, so remove any import a task leaves unused by hand.
- **Line numbers are hints only.** Earlier tasks shift lines. Always locate an edit by searching for the quoted text, never by line number alone.
- **Edits are verified by the checks, not by the page.** Tests don't process CSS, so a broken `@import` only shows up in `npm run build`. Run the full check line after every task.

## Review Focus

These are the failure modes most likely to hurt a real user that the unit tests alone don't cover. Each has a test or manual check in the task that owns it.

1. **Non-UTC timezone round-trip.** A user in UTC−5 opens an object with a due date, edits only the title, and saves. The due date must not move. Task 6 has a test that pins TZ to America/New_York; Task 7 has a manual check.
2. **Stale draft after "changed elsewhere", and stale tabs.**
   - A restored draft based on an older version must show the conflict message on save, not overwrite the newer version.
   - A stale tab that only changes metadata (e.g. status) must save successfully and pick up the other tab's title.
   - Task 7: draft base-version tests plus a manual two-tab check.
3. **Same-title and non-Latin bulk export.** Two notes titled "Meeting", one titled "meeting" and one titled "会議" must produce 4 files in the ZIP, including on case-insensitive filesystems. Task 9 test.
4. **Deploy during an edit.** A new service worker must never reload a tab on its own. That includes when *another* tab clicks Reload. Task 12 has a unit test for this, plus a manual two-tab check.
5. **Phone with the bottom nav visible.** On a 375 px screen, the Share and Export sheet buttons, the bulk ribbon and the + button must all be tappable above the nav. Task 17 manual check at 390×844 in devtools.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `.gitignore` | modify | Stop ignoring `*.md`/`*.txt` |
| `README.md` | create | Setup, scripts, environment variables |
| `supabase/functions/.env.example` | create | Documents edge-function secrets |
| `frontend/scripts/check-bundle.mjs` | create | Fails if non-editor pages load the editor chunk, or the SW doesn't precache it |
| `frontend/src/components/linkifySetup.js` | create | One-time linkify init, imported only by editor components |
| `frontend/src/lib/keyboard.js` (+test) | create | `isTypingTarget(el)` shared by all shortcut handlers |
| `frontend/src/lib/datetime.js` (+test) | create | `isoToDateTimeLocal`, `dateTimeLocalToIso` |
| `frontend/src/lib/objectForm.js` (+test) | create | `objectToEditForm`, `buildObjectPatch`, `draftFromForm`, `formFromDraft` |
| `frontend/src/lib/download.js` (+test) | create | `downloadBlob`, `printHtml` |
| `frontend/src/lib/export.js` (+test) | modify | Add `zipEntryName` |
| `frontend/src/lib/authEvents.js` (+test) | create | `shouldSkipSessionApply` |
| `frontend/src/lib/draftStorage.js` (+test) | modify | Add `clearAllDrafts` |
| `frontend/src/lib/pwaUpdate.js` (+test) | create | Update-available store for the service worker |
| `frontend/src/lib/registerServiceWorker.js` (+test) | create | Registers `sw.js`; only the tab that clicks Reload reloads |
| `frontend/src/components/UpdatePrompt.jsx` (+test) | create | "New version available · Reload" bar |
| `frontend/src/lib/templateOptions.js` (+test) | create | `parseOptions` |
| `frontend/src/components/OptionsInput.jsx` (+test) | create | Comma-separated options input that commits on blur |
| `frontend/src/constants/navigation.js` (+test) | create | Single nav config for sidebar and palette |
| `frontend/src/test/designTokens.test.js` | create | Contrast, undefined-token, focus-outline and media-query guards |
| Pages/components listed per task | modify/delete | As described in each task |

---

### Task 1: Version the planning docs and add setup docs

**Files:**
- Modify: `.gitignore` (repo root)
- Create: `README.md` (repo root)
- Create: `supabase/functions/.env.example`

**Interfaces:**
- Consumes: none.
- Produces: none (docs only).

- [ ] **Step 1: Stop ignoring Markdown and text files.** In `.gitignore`, delete these five lines exactly:

```
# Markdown (excluded from repo)
*.md

# Plain text docs (excluded from repo)
*.txt
```

- [ ] **Step 2: Confirm only the plan docs become visible.**

Run (from the repo root): `git status --short`

Expected: `?? docs/`, and nothing under `node_modules` or `dist`.

- [ ] **Step 3: Create `README.md` at the repo root:**

````markdown
# PKS: Personal Knowledge System

A personal knowledge base: typed knowledge objects, domains and tags, links, full-text search, prompts (DeepSeek and Claude), templates, sharing and export. React 19 + Vite frontend on Supabase (Postgres, Auth, Storage, Edge Functions).

## Layout

| Path | What |
|---|---|
| `frontend/` | React app (Vite). Deployed to Vercel (`frontend/vercel.json`). |
| `supabase/migrations/` | Postgres schema, RLS policies and RPCs |
| `supabase/functions/` | Edge functions: `run-prompt`, `webhook-deliver` |
| `docs/plans/` | Roadmap and codebase audit |
| `docs/superpowers/plans/` | Task-by-task implementation plans |

## Frontend setup

```bash
cd frontend
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` | Production build + service worker |
| `npm run check:bundle` | Verifies the editor chunk stays off non-editor pages (run after build) |

## Edge function secrets

Copy `supabase/functions/.env.example` to `supabase/functions/.env` for local runs (`supabase functions serve --env-file supabase/functions/.env`). Set the same names in the hosted project with `supabase secrets set`.
````

- [ ] **Step 4: Create `supabase/functions/.env.example`:**

```bash
# Allowed browser origin for CORS (required in production; e.g. https://your-app.vercel.app)
PKS_APP_ORIGIN=http://localhost:5173
# Server-side AI keys used when a user has not added their own key
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
# Max server-key prompt runs per user per day
SERVER_KEY_DAILY_LIMIT=50
# Provided automatically by Supabase in hosted functions; needed for local serve
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Commit.**

```bash
git add .gitignore README.md supabase/functions/.env.example docs/
git commit -m "docs: version planning docs, add README and function env example"
```

---

### Task 2: Delete dead code and unused dependencies

**Files:**
- Delete:
  - `frontend/src/components/FormField.jsx`
  - `frontend/src/components/MarkdownEditor.jsx`
  - `frontend/src/components/MarkdownEditor.css`
  - `frontend/src/components/MarkdownContent.jsx`
  - `frontend/src/lib/imports.js`
  - `frontend/src/lib/performance.js`
  - `frontend/src/assets/react.svg`
  - `frontend/public/vite.svg`
  - `frontend/scripts/split-dashboard.mjs`
  - `frontend/scripts/patch-dashboard-view.mjs`
  - `frontend/scripts/extract-dashboard-hooks.mjs`
- Modify:
  - `frontend/src/routeConfig.jsx:88-94`
  - `frontend/src/hooks/useDashboardSearch.js` (lines 3, 164, 212) and `frontend/src/pages/Search.jsx` (lines 10, 64, 92): remove the `performance.js` import and calls. Its marks are never read.
  - `frontend/src/pages/ObjectDetail.css` (the `.markdown-content` rules)
  - `frontend/src/pages/ObjectForm.css` (the `.w-md-editor*` rules)
  - `frontend/package.json`

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Prove nothing imports the files being deleted.**

Run: `CG_OK=1 grep -rnE "FormField|MarkdownEditor|MarkdownContent|lib/imports|lib/performance|react\.svg|vite\.svg" src index.html`

Expected: matches only inside the files being deleted, **plus** `src/hooks/useDashboardSearch.js` and `src/pages/Search.jsx` importing `measureSearchStart` / `measureSearchEnd` from `lib/performance`.

- [ ] **Step 1b: Remove the performance-mark calls.**
  1. In `src/hooks/useDashboardSearch.js` and `src/pages/Search.jsx`, delete the line `import { measureSearchStart, measureSearchEnd } from '../lib/performance';`.
  2. Delete the lines `measureSearchStart();` and `measureSearchEnd();` (one of each per file).
  3. Re-run the Step 1 grep. Expected: matches only inside the files being deleted.

- [ ] **Step 2: Delete the files.**

```bash
git rm src/components/FormField.jsx src/components/MarkdownEditor.jsx src/components/MarkdownEditor.css \
  src/components/MarkdownContent.jsx src/lib/imports.js src/lib/performance.js src/assets/react.svg \
  public/vite.svg scripts/split-dashboard.mjs scripts/patch-dashboard-view.mjs scripts/extract-dashboard-hooks.mjs
```

- [ ] **Step 3: Remove the deprecated export.** Delete the last block of `src/routeConfig.jsx`:

```js
/** @deprecated Use publicRoutes + protectedLayoutRoute — kept for tests importing routeConfig */
/* eslint-disable-next-line react-refresh/only-export-components */
export const routeConfig = [
  ...publicRoutes,
  ...protectedChildRoutes.map(({ path }) => ({ path, element: protectedLayout })),
];
```

- [ ] **Step 4: Remove dead CSS.**
  1. Run: `CG_OK=1 grep -n "markdown-content\|w-md-editor" src/pages/ObjectDetail.css src/pages/ObjectForm.css`
  2. Delete every rule block whose selector contains `.markdown-content` or `.w-md-editor`, from the selector line through its closing `}`.
  3. Re-run the grep. Expected: no output.

- [ ] **Step 5: Uninstall the unused packages.**

Run: `npm uninstall @mantine/utils @uiw/react-md-editor react-markdown remark-gfm @types/dompurify`

Expected: `package.json` no longer lists them.

- [ ] **Step 6: Verify.**

Run: `npm run lint && npm test && npm run build`

Expected: all pass. The build output has no `MarkdownEditor` chunk.

- [ ] **Step 7: Commit.**

```bash
git add -A src public scripts package.json package-lock.json
git commit -m "chore: delete dead components, perf marks, codemod scripts and unused dependencies"
```

---

### Task 3: Patch vulnerable dependencies

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Possibly modify: `frontend/src/components/BlockNoteEditor.jsx`, `BlockNoteViewer.jsx` (only if the upgrade changes APIs)

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Apply the non-breaking fixes.**

Run: `npm audit fix`

- [ ] **Step 2: Check production advisories.**

Run: `npm audit --omit=dev`

Expected: 0 high. If `@tiptap/core ≤3.30.4` is still listed, do Step 3; otherwise skip to Step 5.

- [ ] **Step 3: Upgrade BlockNote** (0.55 depends on `@tiptap/core ^3.31.3`).

Run: `npm install @blocknote/core@^0.55.0 @blocknote/react@^0.55.0 @blocknote/mantine@^0.55.0 @mantine/core@^8 @mantine/hooks@^8`

- [ ] **Step 4: Fix compile errors from the upgrade.**
  1. Run: `npm run build`
  2. If the build fails, open the failing file (only `BlockNoteEditor.jsx`, `BlockNoteViewer.jsx` or `BlockNoteMantineProvider.jsx` use BlockNote) and apply the rename from the BlockNote changelog (https://github.com/TypeCellOS/BlockNote/releases) for the reported symbol.
  3. Re-run until the build passes.

- [ ] **Step 5: Verify, including a manual editor check.**
  1. Run: `npm test && npm run lint && npm audit --omit=dev --audit-level=high`. Expected: pass, and "found 0 vulnerabilities" at high or above.
  2. Run `npm run dev` and open an object.
  3. Click Edit, type text, use the `/` slash menu to insert a heading, then Save.
  4. Reload. The heading persists and the read view renders it.

- [ ] **Step 6: Commit.**

```bash
git add package.json package-lock.json src
git commit -m "fix(deps): patch vulnerable dependencies (tiptap, linkify-it, nanoid, ws, vite)"
```

---

### Task 4: Keep the editor off pages that don't edit, and make it work offline

This fixes audit findings B3 (the 1.3 MB editor chunk is preloaded on every page), B4 (offline cold start is broken) and P4 (18 unused Inter font files are precached).

**Root cause (verified by an experimental build):**
- Rollup put Vite's preload helper inside the `blocknote` manual chunk, so every lazy page imported that chunk.
- `@mantine/hooks` (used by the palette and shortcuts modal) was also forced into it.
- `main.jsx` imported `linkifyjs`, which lives there too.

With the three changes below, only BlockNoteEditor, ObjectDetail, ObjectNew and QuickCapture import the chunk.

**Files:**
- Create: `frontend/src/components/linkifySetup.js`
- Create: `frontend/scripts/check-bundle.mjs`
- Modify:
  - `frontend/src/main.jsx:3,17-30`
  - `frontend/vite.config.js`
  - `frontend/src/components/BlockNoteEditor.jsx:2`
  - `frontend/src/components/BlockNoteViewer.jsx:2`
  - `frontend/package.json` (scripts)

**Interfaces:**
- Consumes: none.
- Produces: the `npm run check:bundle` script, used by Task 17 (CI).

- [ ] **Step 1: Write the failing check.** Create `scripts/check-bundle.mjs`:

```js
#!/usr/bin/env node
/**
 * Post-build guard. Fails when:
 *  - index.html (or the entry chunk) loads the BlockNote editor chunk,
 *  - a non-editor page chunk statically imports the editor chunk,
 *  - the service worker does not precache the editor chunk (offline editing),
 *  - unused Inter fonts are precached.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const assets = join(dist, 'assets');
const EDITOR_PAGES = ['BlockNoteEditor-', 'ObjectDetail-', 'ObjectNew-', 'QuickCapture-'];
const STATIC_EDITOR_IMPORT = /(from\s*|import\s*)["']\.\/blocknote-/;
const failures = [];

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/href="\/assets\/blocknote-[^"]+\.js"/.test(html)) failures.push('index.html preloads the editor chunk');

for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  if (file.startsWith('blocknote-')) continue;
  if (EDITOR_PAGES.some((p) => file.startsWith(p))) continue;
  const src = readFileSync(join(assets, file), 'utf8');
  if (STATIC_EDITOR_IMPORT.test(src)) failures.push(`${file} statically imports the editor chunk`);
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
if (!/assets\/blocknote-[\w-]+\.js/.test(sw)) failures.push('service worker does not precache the editor chunk');
if (/inter-v\d+/.test(sw)) failures.push('service worker precaches unused Inter font files');

if (failures.length) {
  console.error('check-bundle failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('check-bundle: ok');
```

In `package.json` `"scripts"`, add: `"check:bundle": "node scripts/check-bundle.mjs",`

- [ ] **Step 2: Run the check and confirm it fails.**

Run: `npm run build && npm run check:bundle`

Expected: FAIL, listing `index.html preloads the editor chunk`, many `… statically imports the editor chunk` lines (Dashboard, Login, AppShell …), `service worker does not precache the editor chunk`, and `service worker precaches unused Inter font files`.

- [ ] **Step 3: Move the linkify init into the editor.** Create `src/components/linkifySetup.js`:

```js
/**
 * One-time linkify setup for BlockNote/Tiptap's Link extension.
 * Imported only by editor components so linkifyjs (bundled with the editor)
 * never loads on pages without an editor. ES modules run once, so this is
 * safe to import from several components.
 */
import { registerCustomProtocol, init } from 'linkifyjs';

const LINK_PROTOCOLS = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp'];
LINK_PROTOCOLS.forEach((scheme) => registerCustomProtocol(scheme));
init();

// Tiptap's Link extension re-registers protocols on every editor mount, which
// linkifyjs reports via console.warn. Filter exactly that message.
const origWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('linkifyjs: already initialized')) return;
  origWarn.apply(console, args);
};
```

- [ ] **Step 4: Remove the linkify code from `src/main.jsx`.**
  1. Delete the line `import { registerCustomProtocol, init } from 'linkifyjs'`.
  2. Delete the block starting at `// Initialize linkify once with default schemes` through the closing `}` of the `console.warn = …` override (the old lines 17–30).
  3. What remains: the imports, the `registerSW` block, and `createRoot(...)`.

- [ ] **Step 5: Wire the setup into the editor components.**
  - In `src/components/BlockNoteEditor.jsx`, replace the line `import '@blocknote/core/fonts/inter.css';` with `import './linkifySetup';`.
  - Do the same in `src/components/BlockNoteViewer.jsx`.
  - The editor already uses `--bn-font-family: inherit`, so Inter is never displayed.

- [ ] **Step 6: Fix chunking and precache in `vite.config.js`.**
  1. Replace the whole `manualChunks(id) { … }` function with:

  ```js
          manualChunks(id) {
            // Vite's preload helper must not live in a lazy vendor chunk, or every
            // page that lazy-loads anything imports that chunk.
            if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'vite-runtime';
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react-vendor';
            if (id.includes('node_modules/@supabase/')) return 'supabase';
            if (id.includes('node_modules/@mantine/hooks')) return 'mantine-hooks';
            if (
              id.includes('node_modules/@blocknote/')
              || id.includes('node_modules/@tiptap/')
              || id.includes('node_modules/prosemirror')
              || id.includes('node_modules/@mantine/core')
            ) return 'blocknote';
          },
  ```

  2. In the `workbox` block, replace the `globPatterns` and `globIgnores` lines with:

  ```js
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Emoji data is lazy-loaded by the editor's emoji picker; skip it.
          globIgnores: ['**/native-*.js'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  ```

- [ ] **Step 7: Run the check and confirm it passes.**

Run: `npm run build && npm run check:bundle`

Expected: `check-bundle: ok`.

- [ ] **Step 8: Check the editor still works in the browser.**
  1. Run: `npm run dev` and open an object.
  2. Edit it and paste `https://example.com` into the text. The URL becomes a link.
  3. The devtools console shows no `linkifyjs: already initialized` warning.

- [ ] **Step 9: Commit.**

```bash
git add scripts/check-bundle.mjs src/components/linkifySetup.js src/main.jsx src/components/BlockNoteEditor.jsx src/components/BlockNoteViewer.jsx vite.config.js package.json
git commit -m "perf(build): keep editor chunk off non-editor pages, precache it for offline, drop unused fonts"
```

---

### Task 5: Shortcuts must not fire while typing in the editor

This fixes audit finding B5: typing `?` in the editor opens the shortcuts modal and swallows the character.

**Files:**
- Create: `frontend/src/lib/keyboard.js`, `frontend/src/lib/keyboard.test.js`
- Modify:
  - `frontend/src/components/AppLayout.jsx:75`
  - `frontend/src/pages/ObjectDetail.jsx:191`
  - `frontend/src/features/dashboard/hooks/useDashboardKeyboard.js:3-6`

**Interfaces:**
- Produces: `isTypingTarget(el: Element | null | undefined): boolean`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/keyboard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './keyboard';

describe('isTypingTarget', () => {
  it('is true for text fields', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true inside a contenteditable editor (BlockNote/ProseMirror)', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const paragraph = document.createElement('p');
    editor.appendChild(paragraph);
    document.body.appendChild(editor);
    expect(isTypingTarget(editor)).toBe(true);
    expect(isTypingTarget(paragraph)).toBe(true);
    editor.remove();
  });

  it('is false for buttons, plain elements and nothing', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });

  it('is false inside contenteditable="false"', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'false');
    expect(isTypingTarget(el)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/lib/keyboard.test.js`

Expected: FAIL, "Failed to resolve import './keyboard'".

- [ ] **Step 3: Implement.** Create `src/lib/keyboard.js`:

```js
/**
 * True when keyboard input is going into a text field or rich-text editor,
 * so global single-key shortcuts (?, /, j, k, 1-3…) must not fire.
 * Checks the contenteditable attribute on ancestors because jsdom and some
 * browsers don't report isContentEditable for nested editor nodes.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isTypingTarget(el) {
  if (!el || typeof el.tagName !== 'string') return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  if (el.isContentEditable === true) return true;
  const editable = el.closest?.('[contenteditable]');
  return editable != null && editable.getAttribute('contenteditable') !== 'false';
}
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx vitest run src/lib/keyboard.test.js`

Expected: 4 passed.

- [ ] **Step 5: Use the helper everywhere.**
  - **`src/components/AppLayout.jsx`:**
    - Add `import { isTypingTarget } from '../lib/keyboard';`.
    - Replace `if (e.key === '?' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {` with `if (e.key === '?' && !isTypingTarget(document.activeElement)) {`.
  - **`src/pages/ObjectDetail.jsx`:**
    - Add `import { isTypingTarget } from '../lib/keyboard';`.
    - Replace `if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;` with `if (isTypingTarget(document.activeElement)) return;`.
  - **`src/features/dashboard/hooks/useDashboardKeyboard.js`:**
    - Delete the local `function isTypingTarget(el) { … }` (lines 3–6).
    - Add `import { isTypingTarget } from '../../../lib/keyboard';`.

- [ ] **Step 6: Verify, including a manual check.**
  1. Run: `npm test && npm run lint`. Expected: pass.
  2. Manual: open an object, click Edit, and type `What?`. The text shows `What?` and no shortcuts modal opens.
  3. Outside the editor, pressing `?` still opens the modal.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/keyboard.js src/lib/keyboard.test.js src/components/AppLayout.jsx src/pages/ObjectDetail.jsx src/features/dashboard/hooks/useDashboardKeyboard.js
git commit -m "fix(shortcuts): ignore shortcut keys while typing in the rich-text editor"
```

---

### Task 6: Timezone-safe date fields and change-only object patches (helpers)

This builds the helpers for audit findings B6 (due/remind times drift by the timezone offset) and D1 (every save writes every field).

**Files:**
- Create: `frontend/src/lib/datetime.js`, `frontend/src/lib/datetime.test.js`
- Create: `frontend/src/lib/objectForm.js`, `frontend/src/lib/objectForm.test.js`

**Interfaces:**
- Produces:
  - `isoToDateTimeLocal(iso: string | null | undefined): string`. Returns `'YYYY-MM-DDTHH:mm'` in local time, or `''`.
  - `dateTimeLocalToIso(value: string | null | undefined): string | null`
  - `objectToEditForm(object): EditForm`, where `EditForm` has the fields `{ title, content, summary, source, status, due_at, remind_at, cover_url }`, all strings.
  - `buildObjectPatch(object, form: EditForm): Record<string, unknown>`. Returns only the changed columns, plus `slug` when the title changed.
  - `draftFromForm(form: EditForm, baseVersion: number): EditForm & { _baseVersion: number }`
  - `formFromDraft(draft, object): { form: EditForm, baseVersion: number }`

- [ ] **Step 1: Write the failing datetime tests.** Create `src/lib/datetime.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isoToDateTimeLocal, dateTimeLocalToIso } from './datetime';

// Node applies TZ changes at runtime. A non-UTC zone reproduces bug B6 even when CI runs in UTC.
// vi.stubEnv avoids the `process` global (not in the browser ESLint globals) and restores cleanly.
beforeAll(() => { vi.stubEnv('TZ', 'America/New_York'); });
afterAll(() => { vi.unstubAllEnvs(); });

describe('datetime-local conversion', () => {
  it('round-trips an ISO instant through the input value unchanged', () => {
    const iso = '2026-03-10T15:30:00.000Z';
    expect(dateTimeLocalToIso(isoToDateTimeLocal(iso))).toBe(iso);
  });

  it('shows local wall-clock time, not UTC', () => {
    // 15:30 UTC on 10 Mar 2026 is 11:30 in New York (EDT, UTC-4)
    expect(isoToDateTimeLocal('2026-03-10T15:30:00.000Z')).toBe('2026-03-10T11:30');
  });

  it('handles empty and invalid values', () => {
    expect(isoToDateTimeLocal(null)).toBe('');
    expect(isoToDateTimeLocal('not a date')).toBe('');
    expect(dateTimeLocalToIso('')).toBeNull();
    expect(dateTimeLocalToIso(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/lib/datetime.test.js`

Expected: FAIL, "Failed to resolve import './datetime'".

- [ ] **Step 3: Implement.** Create `src/lib/datetime.js`:

```js
/**
 * Conversions between stored ISO instants and <input type="datetime-local">
 * values, which are local wall-clock time without a zone.
 */

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {string | null | undefined} iso
 * @returns {string} 'YYYY-MM-DDTHH:mm' in the browser's time zone, or ''
 */
export function isoToDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @param {string | null | undefined} value - datetime-local input value
 * @returns {string | null} ISO instant, or null when empty/invalid
 */
export function dateTimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value); // no zone suffix → parsed as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx vitest run src/lib/datetime.test.js`

Expected: 3 passed.

- [ ] **Step 5: Write the failing objectForm tests.** Create `src/lib/objectForm.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { objectToEditForm, buildObjectPatch, draftFromForm, formFromDraft } from './objectForm';

const object = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  title: 'Q3 plan',
  content: 'Body',
  summary: null,
  source: null,
  status: 'active',
  due_at: '2026-03-10T15:30:00+00:00',
  remind_at: null,
  cover_url: null,
  current_version: 4,
};

describe('buildObjectPatch', () => {
  it('returns an empty patch when nothing changed (including due_at format differences)', () => {
    expect(buildObjectPatch(object, objectToEditForm(object))).toEqual({});
  });

  it('sends only changed fields, so other tabs\' edits are not reverted', () => {
    const form = { ...objectToEditForm(object), status: 'archived' };
    expect(buildObjectPatch(object, form)).toEqual({ status: 'archived' });
  });

  it('adds a slug when the title changes', () => {
    const form = { ...objectToEditForm(object), title: '  Q4 Plan  ' };
    expect(buildObjectPatch(object, form)).toEqual({ title: 'Q4 Plan', slug: 'q4-plan-abcdef12' });
  });

  it('normalizes blank strings to null and clears dates', () => {
    const form = { ...objectToEditForm(object), content: '   ', due_at: '' };
    expect(buildObjectPatch(object, form)).toEqual({ content: null, due_at: null });
  });

  it('treats a null status on the row as active', () => {
    const row = { ...object, status: null };
    expect(buildObjectPatch(row, objectToEditForm(row))).toEqual({});
  });
});

describe('drafts keep the version they were based on', () => {
  it('round-trips form and base version', () => {
    const form = { ...objectToEditForm(object), title: 'Draft title' };
    const draft = draftFromForm(form, 4);
    const restored = formFromDraft(draft, { ...object, current_version: 6 });
    expect(restored.baseVersion).toBe(4);
    expect(restored.form.title).toBe('Draft title');
    expect(restored.form).not.toHaveProperty('_baseVersion');
  });

  it('falls back to the current version for drafts saved before this change', () => {
    const legacy = { title: 'Old draft' };
    const restored = formFromDraft(legacy, object);
    expect(restored.baseVersion).toBe(4);
    expect(restored.form.content).toBe('Body');
  });
});
```

- [ ] **Step 6: Run it and confirm it fails.**

Run: `npx vitest run src/lib/objectForm.test.js`

Expected: FAIL, "Failed to resolve import './objectForm'".

- [ ] **Step 7: Implement.** Create `src/lib/objectForm.js`:

```js
/**
 * Edit-form state for a knowledge object and the minimal update patch to save it.
 */
import { slugify } from './slugify';
import { isoToDateTimeLocal, dateTimeLocalToIso } from './datetime';

/**
 * @param {object} object - knowledge_objects row
 * @returns {{ title: string, content: string, summary: string, source: string, status: string, due_at: string, remind_at: string, cover_url: string }}
 */
export function objectToEditForm(object) {
  return {
    title: object.title ?? '',
    content: object.content || '',
    summary: object.summary || '',
    source: object.source || '',
    status: object.status || 'active',
    due_at: isoToDateTimeLocal(object.due_at),
    remind_at: isoToDateTimeLocal(object.remind_at),
    cover_url: object.cover_url || '',
  };
}

function normalizeForm(form) {
  return {
    title: form.title.trim(),
    content: form.content.trim() || null,
    summary: form.summary.trim() || null,
    source: form.source.trim() || null,
    status: form.status || 'active',
    due_at: dateTimeLocalToIso(form.due_at),
    remind_at: dateTimeLocalToIso(form.remind_at),
    cover_url: form.cover_url?.trim() || null,
  };
}

/**
 * Columns that differ between the row and the form. Sending only these keeps a
 * save from reverting fields another tab or collaborator changed.
 * @returns {Record<string, unknown>}
 */
export function buildObjectPatch(object, form) {
  const before = normalizeForm(objectToEditForm(object));
  const after = normalizeForm(form);
  const patch = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  if ('title' in patch) {
    const base = slugify(after.title);
    patch.slug = base ? `${base}-${object.id.slice(0, 8)}` : null;
  }
  return patch;
}

/** Draft payload that remembers which version the edit started from. */
export function draftFromForm(form, baseVersion) {
  return { ...form, _baseVersion: baseVersion };
}

/**
 * @returns {{ form: ReturnType<typeof objectToEditForm>, baseVersion: number }}
 */
export function formFromDraft(draft, object) {
  const { _baseVersion, ...fields } = draft;
  return {
    form: { ...objectToEditForm(object), ...fields },
    baseVersion: _baseVersion ?? object.current_version,
  };
}
```

- [ ] **Step 8: Run both test files and confirm they pass.**

Run: `npx vitest run src/lib/objectForm.test.js src/lib/datetime.test.js`

Expected: 10 passed.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/datetime.js src/lib/datetime.test.js src/lib/objectForm.js src/lib/objectForm.test.js
git commit -m "feat(lib): timezone-safe datetime helpers and change-only object patches"
```

---

### Task 7: Safe saves in ObjectDetail

This fixes audit findings B6 (timezone drift), D1 (saves revert other edits) and R6 (a restored draft overwrites a newer version).

**Files:**
- Modify: `frontend/src/pages/ObjectDetail.jsx` (lines 110–155, 297–344, and the Edit/Cancel buttons near 1175–1180)

**Interfaces:**
- Consumes (from Task 6): `objectToEditForm`, `buildObjectPatch`, `draftFromForm` and `formFromDraft` from `../lib/objectForm`.
- Produces: none.

- [ ] **Step 1: Update the imports.**
  1. In `ObjectDetail.jsx`, next to the other `../lib` imports, add:

  ```js
  import { objectToEditForm, buildObjectPatch, draftFromForm, formFromDraft } from '../lib/objectForm';
  ```

  2. Delete `import { slugify } from '../lib/slugify';`. Slug building moves into `buildObjectPatch`, and lint fails on the unused import.

- [ ] **Step 2: Track which version the edit started from.** Directly under `const editInitialContentRef = useRef('');`, add:

```js
  // Version the current edit is based on; used for the optimistic-concurrency check on save.
  const editBaseVersionRef = useRef(null);
```

- [ ] **Step 3: Build the form from the helper.** Replace the effect that fills `editForm` from `object` (lines 110–122) with:

```js
  useEffect(() => {
    if (!object || editing) return;
    setEditForm(objectToEditForm(object));
  }, [object, editing]);
```

- [ ] **Step 4: Restore drafts with their base version.** In the draft-restore effect, replace these three lines:

```js
    editInitialContentRef.current = d.content ?? object.content ?? '';
    setEditForm((prev) => ({ ...prev, ...d }));
    setEditing(true);
```

with:

```js
    const restored = formFromDraft(d, object);
    editInitialContentRef.current = restored.form.content;
    editBaseVersionRef.current = restored.baseVersion;
    setEditForm(restored.form);
    setEditing(true);
```

- [ ] **Step 5: Save the base version with each draft.** In the draft-save timer effect, replace `setDraft(DRAFT_KEYS.object(id), editForm);` with `setDraft(DRAFT_KEYS.object(id), draftFromForm(editForm, editBaseVersionRef.current));`.

- [ ] **Step 6: Replace `handleSave`.** Replace the body of `handleSave` from `const newSlug = …` down to (but not including) `setEditing(false);` with:

```js
      const patch = buildObjectPatch(object, editForm);
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        clearDraft(DRAFT_KEYS.object(object.id));
        return;
      }
      // Optimistic concurrency, only for versioned fields: the DB trigger bumps
      // current_version when title/content/summary change, so a metadata-only
      // patch (status, dates…) must not be rejected just because another tab
      // edited the text. Plan −1B replaces this with a `revision` column that
      // bumps on every update.
      const touchesVersioned = ['title', 'content', 'summary'].some((k) => k in patch);
      let query = supabase.from('knowledge_objects').update(patch).eq('id', object.id);
      if (touchesVersioned) {
        query = query.eq('current_version', editBaseVersionRef.current ?? object.current_version);
      }
      const { data: updatedRows, error: err } = await query.select(
        'id, user_id, type, title, content, source, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at'
      );
      if (err) throw err;
      if (!updatedRows || updatedRows.length === 0) {
        const msg = 'This object was changed elsewhere (another tab or device). Your draft is kept — copy your edits, then reload to get the latest version.';
        setError(msg);
        addToast('error', msg);
        return;
      }
      // Merge the full saved row so a stale tab also picks up other tabs' changes.
      setObject((o) => ({ ...o, ...updatedRows[0] }));
```

The rest of the function stays as it is: `setEditing(false)`, `clearDraft`, the toast, `logAudit` and the versions refresh.

- [ ] **Step 7: Start edits from the current version.** In the Edit button (near line 1175), replace `onClick={() => { editInitialContentRef.current = editForm.content ?? ''; setEditing(true); }}` with:

```jsx
onClick={() => { editInitialContentRef.current = editForm.content ?? ''; editBaseVersionRef.current = object.current_version; setEditing(true); }}
```

- [ ] **Step 8: Use the helper in Cancel.** In the Cancel button (near line 1180), replace the inline `setEditForm({ title: object.title, … cover_url: object.cover_url || '' });` with `setEditForm(objectToEditForm(object));`.

- [ ] **Step 9: Verify, including manual checks.**
  1. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  2. **Timezone check:** set the OS timezone to a non-UTC zone. Give an object a due date of 09:00, save, and reload: it shows 09:00. Edit only the title, save, and reload: the due date is still 09:00.
  3. **Two-tab check:**
     - Open the same object in tabs A and B.
     - In A, edit the title and save.
     - In B (not reloaded), click Edit, change only the status and save. B's save succeeds, B now shows A's new title, and a reload shows both changes.
     - In B (still not reloaded after a new title save in A), click Edit, change the content and save. B shows the conflict message; A's title is untouched.
     - In B, click Edit, type in the content, and wait 1 s. In A, change the content and save.
     - Reload B. B shows "Draft restored". Save in B: the conflict message appears and A's content is not overwritten.

- [ ] **Step 10: Commit.**

```bash
git add src/pages/ObjectDetail.jsx
git commit -m "fix(object): save only changed fields, keep draft base version, fix due/remind timezone drift"
```

---

### Task 8: Remove export-job bookkeeping from the client

This removes the part of audit §2 where the client writes `export_jobs` rows that nothing processes, and polls them forever if the tab dies. The tables are dropped in −1B.

**Files:**
- Modify:
  - `frontend/src/pages/ObjectDetail.jsx` (lines 98, 157–186, 906–996, 1211–1213)
  - `frontend/src/components/ObjectDetailExportPanel.jsx` (lines 14–16, 64–95)
  - `frontend/src/features/dashboard/hooks/useDashboardBulkActions.js` (lines 103, 114–133, 181, 184, 189)

**Interfaces:**
- Consumes: none.
- Produces: `handleExport(overrides?)` in ObjectDetail, which no longer writes to Supabase before downloading. Task 9 relies on this: the PDF branch must run synchronously inside the click so the print window is allowed.

- [ ] **Step 1: Confirm where the bookkeeping lives.**

Run: `CG_OK=1 grep -rn "export_jobs\|export_job_items\|recentExportJobs\|retryExport\|onRetryExport\|loadRecentExportJobs" src`

Expected: matches in the three files listed above only.

- [ ] **Step 2: Remove it from `ObjectDetail.jsx`.**
  1. Delete the `recentExportJobs` state (line 98).
  2. Delete `loadRecentExportJobs` and the three effects that call it or poll (lines 157–186).
  3. Delete `retryExport` (lines 986–996).
  4. Delete the `recentExportJobs=` and `onRetryExport=` props passed to `ObjectDetailExportPanel`.
  5. In `handleExport`:
     - Delete `const tpl = jobOverrides?.template ?? exportTemplate;` (its only use was the insert; lint fails if it stays).
     - Delete `let jobId = null;`, the `export_jobs` insert (from `const { data: job, error: insertErr }` through `if (insertErr) throw insertErr; jobId = job?.id;`), and the `update({ status: 'processing' })` line.
     - Delete the `update({ status: 'completed' … })` line and the `loadRecentExportJobs();` call.
     - In the `catch`, delete the `if (jobId) { … update({ status: 'failed' … }) }` block.

- [ ] **Step 3: Remove it from `ObjectDetailExportPanel.jsx` and its CSS.**
  1. Delete the `recentExportJobs` and `onRetryExport` props from the destructuring.
  2. Delete the whole `{recentExportJobs.length > 0 && ( … )}` block.
  3. Delete `import { EXPORT_FORMAT_LABELS } from '../lib/export';`, which is now unused. The uppercase lint ignore pattern would hide it.
  4. In `src/pages/ObjectDetail.css`, delete every rule whose selector starts with `.export-recent` or `.export-jobs` / `.export-job`. Check with `CG_OK=1 grep -n "export-recent\|export-job" src/pages/ObjectDetail.css`; expected: no output.

- [ ] **Step 4: Remove it from `useDashboardBulkActions.js`.**
  1. In `handleExportSelected`, delete `let jobId = null;`.
  2. Delete the `export_jobs` insert block (from `const { data: job, error: jobErr }` through `if (itemsErr) throw itemsErr;`).
  3. Delete the `update({ status: 'completed' … })` line.
  4. Delete the `if (jobId) await supabase.from('export_jobs')…` line in the `catch`.
  5. Change the `logAudit(...)` call to use `null` instead of `jobId` for the entity id: `logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.EXPORT_JOB, null, { objectCount: ids.length, format: exportFormat });`.

- [ ] **Step 5: Verify.**
  1. Run: `CG_OK=1 grep -rn "export_jobs\|export_job_items\|recentExportJobs" src`. Expected: no output.
  2. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  3. Manual: export an object as Markdown; the file downloads. Bulk-export 2 selected objects; a ZIP downloads.

- [ ] **Step 6: Commit.**

```bash
git add src/pages/ObjectDetail.jsx src/pages/ObjectDetail.css src/components/ObjectDetailExportPanel.jsx src/features/dashboard/hooks/useDashboardBulkActions.js
git commit -m "refactor(export): drop client-side export_jobs bookkeeping and polling"
```

---

### Task 9: Reliable downloads, working PDF export, unique ZIP names

This fixes audit findings B2 (PDF export never prints), R15 (downloads can be cancelled because the URL is revoked immediately) and D10 (bulk ZIP export overwrites files with the same name).

**Files:**
- Create: `frontend/src/lib/download.js`, `frontend/src/lib/download.test.js`
- Modify: `frontend/src/lib/export.js`, `frontend/src/lib/export.test.js`
- Modify:
  - `frontend/src/pages/ObjectDetail.jsx` (the PDF branch of `handleExport`, and local `downloadBlob`)
  - `frontend/src/features/dashboard/hooks/useDashboardBulkActions.js:160-180`
  - `frontend/src/pages/Settings.jsx:363-368, 408-413, 450-455`

**Interfaces:**
- Consumes (from Task 8): `handleExport` has no `await` before the format branch.
- Produces:
  - `downloadBlob(blob: Blob, filename: string): void`
  - `printHtml(html: string): boolean`. Returns false when the popup was blocked.
  - `zipEntryName(title: string, id: string, ext: string, used: Set<string>): string`

- [ ] **Step 1: Write the failing download tests.** Create `src/lib/download.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, printHtml } from './download';

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('clicks an attached anchor and revokes the URL only later', () => {
    let clickedWhileAttached = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedWhileAttached = document.body.contains(this) && this.download === 'notes.md';
    });
    downloadBlob(new Blob(['x']), 'notes.md');
    expect(clickedWhileAttached).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });
});

describe('printHtml', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the HTML into a new window and prints it', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const win = { document: doc, focus: vi.fn(), print: vi.fn(), opener: 'x' };
    vi.spyOn(window, 'open').mockReturnValue(win);
    expect(printHtml('<p>Hi</p>')).toBe(true);
    expect(doc.write).toHaveBeenCalledWith('<p>Hi</p>');
    expect(win.print).toHaveBeenCalled();
    expect(win.opener).toBeNull();
  });

  it('returns false when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printHtml('<p>Hi</p>')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/lib/download.test.js`

Expected: FAIL, "Failed to resolve import './download'".

- [ ] **Step 3: Implement.** Create `src/lib/download.js`:

```js
/**
 * Browser file download and print helpers.
 */

/**
 * Save a Blob as a file. The anchor is attached to the document and the object
 * URL is revoked later: revoking synchronously cancels the download in some browsers.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the browser print dialog (where users pick "Save as PDF") for an HTML
 * document. Must be called synchronously from a click handler, or popup
 * blockers will stop it. `noopener` can't be used: it makes window.open return null.
 * @param {string} html - complete, already-sanitized HTML document
 * @returns {boolean} false when the popup was blocked
 */
export function printHtml(html) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx vitest run src/lib/download.test.js`

Expected: 3 passed.

- [ ] **Step 5: Write the failing ZIP-name tests.** Append to `src/lib/export.test.js`, and add `zipEntryName` to that file's existing multi-line `import { … } from './export.js';` statement.

```js
describe('zipEntryName', () => {
  it('keeps same-titled objects as separate files', () => {
    const used = new Set();
    const a = zipEntryName('Meeting', 'aaaaaaaa-1', 'md', used);
    const b = zipEntryName('Meeting', 'bbbbbbbb-2', 'md', used);
    expect(a).toBe('Meeting.md');
    expect(b).toBe('Meeting-bbbbbbbb.md');
  });

  it('treats names that differ only in case as duplicates (Windows/macOS unzip)', () => {
    const used = new Set();
    zipEntryName('Meeting', 'aaaaaaaa', 'md', used);
    expect(zipEntryName('meeting', 'cccccccc', 'md', used)).toBe('meeting-cccccccc.md');
  });

  it('never ends a long name with a dash', () => {
    const name = zipEntryName(`${'a'.repeat(79)} b`, 'dddddddd', 'md', new Set());
    expect(name.endsWith('-.md')).toBe(false);
  });

  it('keeps non-Latin titles readable instead of collapsing to "-"', () => {
    const used = new Set();
    expect(zipEntryName('会議メモ', 'cccccccc', 'md', used)).toBe('会議メモ.md');
    expect(zipEntryName('日記', 'dddddddd', 'md', used)).toBe('日記.md');
  });

  it('strips characters that are illegal in file names and handles empty titles', () => {
    const used = new Set();
    expect(zipEntryName('a/b:c*?', 'eeeeeeee', 'txt', used)).toBe('abc.txt');
    expect(zipEntryName('   ', 'ffffffff', 'md', used)).toBe('untitled.md');
  });
});
```

- [ ] **Step 6: Run it and confirm it fails.**

Run: `npx vitest run src/lib/export.test.js`

Expected: FAIL, "zipEntryName is not a function" or an import error.

- [ ] **Step 7: Implement.** Append to `src/lib/export.js`:

```js
/**
 * Unique, filesystem-safe name for an entry in an export ZIP. Keeps Unicode
 * letters (e.g. CJK titles) and disambiguates duplicates with the id prefix.
 * @param {string} title
 * @param {string} id
 * @param {string} ext - extension without dot
 * @param {Set<string>} used - lower-cased names already in the archive (mutated);
 *   compared case-insensitively because Windows/macOS unzip is case-insensitive
 * @returns {string}
 */
export function zipEntryName(title, id, ext, used) {
  const chars = Array.from(
    String(title ?? '')
      .normalize('NFKC')
      // eslint-disable-next-line no-control-regex -- strip control chars, illegal in file names
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  ).slice(0, 80); // Array.from splits by code point, so emoji/CJK are never cut in half
  const base = chars.join('').replace(/^[-.]+|[-.]+$/g, '') || 'untitled';
  const shortId = String(id).slice(0, 8);
  const taken = (candidate) => used.has(candidate.toLowerCase());
  let name = `${base}.${ext}`;
  if (taken(name)) name = `${base}-${shortId}.${ext}`;
  for (let n = 2; taken(name); n += 1) name = `${base}-${shortId}-${n}.${ext}`;
  used.add(name.toLowerCase());
  return name;
}
```

- [ ] **Step 8: Run it and confirm it passes.**

Run: `npx vitest run src/lib/export.test.js`

Expected: all pass.

- [ ] **Step 9: Use unique names in the bulk ZIP.** In `useDashboardBulkActions.js`:
  1. Add `import { downloadBlob } from '../../../lib/download';`.
  2. Add `zipEntryName` to the existing `../../../lib/export` import.
  3. Before the `for (let i = 0; …` loop, add `const usedNames = new Set();`.
  4. Replace these two lines:

  ```js
            const slug = obj.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
            const ext = exportFormat === 'txt' ? 'txt' : 'md';
  ```

  with:

  ```js
            const ext = exportFormat === 'txt' ? 'txt' : 'md';
  ```

  5. Replace `zip.file(`${slug}.${ext}`, text);` with `zip.file(zipEntryName(obj.title, obj.id, ext, usedNames), text);`.
  6. Replace the five lines from `const a = document.createElement('a');` through `URL.revokeObjectURL(a.href);` with `downloadBlob(blob, `pks-export-${ids.length}-objects.zip`);`.

- [ ] **Step 10: Use the shared download in Settings.**
  1. In `Settings.jsx`, add `import { downloadBlob } from '../lib/download';`.
  2. There are three places with the pattern `const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = X; a.click(); URL.revokeObjectURL(a.href);`. Replace each with `downloadBlob(blob, X);`, keeping each file name expression X exactly as it is.

- [ ] **Step 11: Fix PDF export in ObjectDetail.**
  1. Add `import { downloadBlob, printHtml } from '../lib/download';`.
  2. Delete the local `function downloadBlob(blob, filename) { … }`.
  3. Replace the final PDF branch of `handleExport` with the block below. The range to replace starts at the `} else {` line just before `const html = buildExportHtml(inc);` and runs through that branch's closing `}`.

  ```js
        } else {
          if (!printHtml(buildExportHtml(inc))) {
            throw new Error('Your browser blocked the print window. Allow pop-ups for this site, then try again.');
          }
        }
  ```

  4. Replace `addToast('success', `Export downloaded as ${formatLabel}`);` with:

  ```js
        addToast('success', fmt === 'pdf' ? 'Print dialog opened: choose "Save as PDF"' : `Export downloaded as ${formatLabel}`);
  ```

  5. For PDF only the print dialog opened; nothing was exported yet. Wrap the `createNotification(…)` and `deliverWebhookEvent('export.completed', …)` calls just above the toast in `if (fmt !== 'pdf') { … }`.

- [ ] **Step 12: Verify, including manual checks.**
  1. Run: `CG_OK=1 grep -rn "revokeObjectURL(a.href)" src`. Expected: no output.
  2. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  3. Manual: export an object as PDF. The print dialog opens with the object's title and content.
  4. Manual: bulk-export two objects both titled "Meeting". The ZIP contains `Meeting.md` and `Meeting-xxxxxxxx.md`.
  5. Manual: the Settings JSON backup downloads.

- [ ] **Step 13: Commit.**

```bash
git add src/lib/download.js src/lib/download.test.js src/lib/export.js src/lib/export.test.js src/pages/ObjectDetail.jsx src/pages/Settings.jsx src/features/dashboard/hooks/useDashboardBulkActions.js
git commit -m "fix(export): working PDF print, reliable downloads, unique ZIP entry names"
```

---

### Task 10: ObjectDetail duplicate UI and delete copy

This fixes audit finding B7 (duplicate UI sections) and the misleading delete message.

**Files:**
- Modify: `frontend/src/pages/ObjectDetail.jsx` (lines 13, 451, 462, 1125, 1496)

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Show the read-only Version history only when the owner card isn't shown.** Owners with at least one version already get the card with Restore buttons (`{isOwner && versions.length > 0 && (`). The second card must still show for owners with zero versions ("No previous versions yet"). Change the opening of the second card (the one containing `className="version-list"`) from:

```jsx
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Version history</h3>
            {versions.length === 0 ? (
```

to:

```jsx
          {!(isOwner && versions.length > 0) && (
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Version history</h3>
            {versions.length === 0 ? (
```

Then close it by changing that card's closing `</div>` (the one just before `</aside>`) to `</div>\n          )}`.

- [ ] **Step 2: Remove the second notification bell.** The sidebar already renders one.
  1. Delete `<NotificationCenter />` from the header (line ~1125).
  2. Delete `import NotificationCenter from '../components/NotificationCenter';` (line 13).

- [ ] **Step 3: Fix the delete copy** to point to Trash.
  - In `handleDelete`, replace the `window.confirm` text with: `'Move this object to Trash? You can restore it from Trash later.'`.
  - Replace `addToast('success', 'Object deleted');` with `addToast('success', 'Moved to Trash');`.

- [ ] **Step 4: Verify, including a manual check.**
  1. Run: `npm run lint && npm run build`. Expected: pass.
  2. Manual: as the owner of an edited object, the page shows one "Version history" card, the one with Restore buttons, and exactly one bell (in the sidebar). On a brand-new object it shows one card saying "No previous versions yet".

- [ ] **Step 5: Commit.**

```bash
git add src/pages/ObjectDetail.jsx
git commit -m "fix(object): remove duplicate version history and bell, clarify Trash copy"
```

---

### Task 11: Auth session stability and clean logout

This fixes audit findings R1 (every tab refocus reloads the profile and resets Settings edits), R2 (boot verifies the user twice), R3 (logging out offline doesn't remove the token), R4 (sign-out shows "session expired" and redirects the next user to the previous user's page) and S11/D12 (drafts survive logout).

**Files:**
- Create: `frontend/src/lib/authEvents.js`, `frontend/src/lib/authEvents.test.js`
- Modify: `frontend/src/lib/draftStorage.js`, and create `frontend/src/lib/draftStorage.test.js`
- Modify: `frontend/src/context/AuthContext.jsx`, `frontend/src/components/ProtectedRoute.jsx`

**Interfaces:**
- Produces:
  - `shouldSkipSessionApply(event: string, session, currentUserId: string | null): boolean`
  - `clearAllDrafts(): void`
  - An `explicitLogout: boolean` field on the `useAuth()` context value.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/authEvents.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { shouldSkipSessionApply } from './authEvents';

const session = { user: { id: 'u1' }, access_token: 't' };

describe('shouldSkipSessionApply', () => {
  it('skips repeat events for the already-loaded user (tab refocus, token refresh, initial session)', () => {
    expect(shouldSkipSessionApply('SIGNED_IN', session, 'u1')).toBe(true);
    expect(shouldSkipSessionApply('TOKEN_REFRESHED', session, 'u1')).toBe(true);
    expect(shouldSkipSessionApply('INITIAL_SESSION', session, 'u1')).toBe(true);
  });

  it('applies when the user changes or none is loaded yet', () => {
    expect(shouldSkipSessionApply('SIGNED_IN', session, 'u2')).toBe(false);
    expect(shouldSkipSessionApply('SIGNED_IN', session, null)).toBe(false);
  });

  it('applies profile-changing events even for the same user', () => {
    expect(shouldSkipSessionApply('USER_UPDATED', session, 'u1')).toBe(false);
  });

  it('never skips when there is no session', () => {
    expect(shouldSkipSessionApply('SIGNED_OUT', null, 'u1')).toBe(false);
  });
});
```

Also create `src/lib/draftStorage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setDraft, getDraft, clearAllDrafts, DRAFT_KEYS } from './draftStorage';

describe('clearAllDrafts', () => {
  it('removes every PKS draft and leaves other session keys alone', () => {
    setDraft(DRAFT_KEYS.new, { form: { title: 'a' } });
    setDraft(DRAFT_KEYS.object('123'), { title: 'b' });
    sessionStorage.setItem('other-app-key', 'keep');
    clearAllDrafts();
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(getDraft(DRAFT_KEYS.object('123'))).toBeNull();
    expect(sessionStorage.getItem('other-app-key')).toBe('keep');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.**

Run: `npx vitest run src/lib/authEvents.test.js src/lib/draftStorage.test.js`

Expected: FAIL (`./authEvents` unresolved; `clearAllDrafts` is not a function).

- [ ] **Step 3: Implement the helpers.** Create `src/lib/authEvents.js`:

```js
/**
 * Supabase re-emits SIGNED_IN whenever a tab becomes visible again, and
 * INITIAL_SESSION on subscribe. For the user who is already loaded these carry
 * nothing new: re-applying them wipes the profile and refetches it.
 * @param {string} event - Supabase AuthChangeEvent
 * @param {{ user?: { id?: string } } | null} session
 * @param {string | null} currentUserId
 * @returns {boolean}
 */
export function shouldSkipSessionApply(event, session, currentUserId) {
  const id = session?.user?.id;
  if (!id || !currentUserId || id !== currentUserId) return false;
  return event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION';
}
```

Append to `src/lib/draftStorage.js`:

```js
/** Remove every PKS draft (e.g. on logout, so the next user of this tab never sees them). */
export function clearAllDrafts() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch (_e) { void _e; }
}
```

- [ ] **Step 4: Run them and confirm they pass.**

Run: `npx vitest run src/lib/authEvents.test.js src/lib/draftStorage.test.js`

Expected: 5 passed.

- [ ] **Step 5: Wire it into `AuthContext.jsx`.**
  1. Add the imports:

  ```js
  import { shouldSkipSessionApply } from '../lib/authEvents';
  import { clearAllDrafts } from '../lib/draftStorage';
  import { RUN_PROMPT_STORAGE_KEY } from '../constants';
  ```

  2. Add state next to `sessionExpired`: `const [explicitLogout, setExplicitLogout] = useState(false);`
  3. In the `getSession().then(...)` callback, replace `if (!cancelled) applyFastSession(session);` with:

  ```js
        if (cancelled || shouldSkipSessionApply('INITIAL_SESSION', session, sessionUserIdRef.current)) return;
        applyFastSession(session);
  ```

  4. In `onAuthStateChange`, replace the block `if (event === 'TOKEN_REFRESHED' && session?.user?.id && session.user.id === sessionUserIdRef.current) { … return; }` with:

  ```js
        if (shouldSkipSessionApply(event, session, sessionUserIdRef.current)) {
          setHasValidSession(!!session?.access_token);
          return;
        }
  ```

  5. Replace the whole `logout` callback with:

  ```js
    const logout = useCallback(async () => {
      // Deliberate sign-out: not a session expiry, and no "return to" page for the next user.
      hadUserRef.current = false;
      sessionUserIdRef.current = null;
      setExplicitLogout(true);
      clearAllDrafts();
      try { sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY); } catch (_e) { void _e; }
      const { error } = await supabase.auth.signOut();
      // Offline: auth-js returns a network error *before* removing the stored
      // session, for every scope including 'local'. Remove it directly so a
      // reload can't log the user back in. storageKey is public on GoTrueClient.
      if (error) {
        try {
          localStorage.removeItem(supabase.auth.storageKey);
          localStorage.removeItem(`${supabase.auth.storageKey}-code-verifier`);
        } catch (_e) { void _e; }
      }
      setUser(null);
      setHasValidSession(false);
      setSessionExpired(false);
    }, []);
  ```

  6. Reset the flag whenever a user becomes signed in, whichever path signed them in:
     - In `login`, before `return true;`, add `setExplicitLogout(false);`.
     - In `applyFastSession`, directly after `setHasValidSession(true);`, add `setExplicitLogout(false);`.
  7. Add `explicitLogout` to the `value` object and to its `useMemo` dependency array.

- [ ] **Step 6: Don't carry a "return to" page after a deliberate logout.** In `ProtectedRoute.jsx`:
  1. Destructure `explicitLogout` from `useAuth()`.
  2. Replace the `const to = …` expression with:

  ```js
      const to = sessionExpired
        ? { pathname: '/login', search: '?reason=session_expired', state: { from: location } }
        : explicitLogout
          ? { pathname: '/login' }
          : { pathname: '/login', state: { from: location } };
  ```

- [ ] **Step 7: Verify, including manual checks.**
  1. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  2. **Settings form:** in Settings, type in the display name and switch to another browser tab and back. The typed text stays, and the Network tab shows no new `/auth/v1/user` request.
  3. **Logout while on a page:** open an object, then Sign out. The login page shows no "session expired" message. Log in again: you land on `/`, not on the object.
  4. **Logout while offline:** in devtools set Network to Offline, Sign out, go back online, and reload. You stay logged out.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/authEvents.js src/lib/authEvents.test.js src/lib/draftStorage.js src/lib/draftStorage.test.js src/context/AuthContext.jsx src/components/ProtectedRoute.jsx
git commit -m "fix(auth): stop refocus profile reloads, clean logout (offline, drafts, redirect)"
```

---

### Task 12: Ask before updating the app, never reload mid-edit

This fixes audit finding R5: after a deploy, the PWA reloads every open tab, even mid-edit.

**Why not `registerSW` from `virtual:pwa-register`:** in vite-plugin-pwa 1.2 prompt mode, every tab registers a `controlling` listener that reloads when the new worker takes control. So when tab B clicks Reload, tab A reloads mid-edit too (verified in `node_modules/vite-plugin-pwa/dist/client/build/register.js`). We register the service worker ourselves, and only the tab where the user clicked reloads.

**Files:**
- Create:
  - `frontend/src/lib/pwaUpdate.js`, `frontend/src/lib/pwaUpdate.test.js`
  - `frontend/src/lib/registerServiceWorker.js`, `frontend/src/lib/registerServiceWorker.test.js`
  - `frontend/src/components/UpdatePrompt.jsx`, `frontend/src/components/UpdatePrompt.test.jsx`
- Modify: `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/vite.config.js`

**Interfaces:**
- Produces:
  - `markUpdateAvailable(apply: () => void): void`
  - `isUpdateAvailable(): boolean`
  - `subscribeUpdate(listener: () => void): () => void`
  - `applyUpdate(): void`
  - `resetUpdateStateForTests(): void`
  - `registerServiceWorker({ onUpdateReady, container?, reload?, url? }): Promise<void>`
  - The `<UpdatePrompt />` component.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/pwaUpdate.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markUpdateAvailable, isUpdateAvailable, subscribeUpdate, applyUpdate, resetUpdateStateForTests } from './pwaUpdate';

describe('pwaUpdate store', () => {
  beforeEach(() => resetUpdateStateForTests());

  it('notifies subscribers and applies only on request', () => {
    const listener = vi.fn();
    const apply = vi.fn();
    const unsubscribe = subscribeUpdate(listener);
    expect(isUpdateAvailable()).toBe(false);
    markUpdateAvailable(apply);
    expect(isUpdateAvailable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    applyUpdate();
    expect(apply).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
```

Create `src/lib/registerServiceWorker.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

function fakeContainer({ controlled = true, waiting = true } = {}) {
  const container = new EventTarget();
  container.controller = controlled ? {} : null;
  const registration = new EventTarget();
  registration.waiting = waiting ? { postMessage: vi.fn() } : null;
  registration.installing = null;
  container.register = vi.fn(async () => registration);
  return { container, registration };
}

describe('registerServiceWorker', () => {
  it('offers a waiting worker, and reloads only the tab whose user applied it', async () => {
    const { container, registration } = fakeContainer();
    const reload = vi.fn();
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);

    // Another tab activated the new worker: this tab must NOT reload.
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    // The user clicks Reload in this tab.
    onUpdateReady.mock.calls[0][0]();
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not offer an update on first install (page not yet controlled)', async () => {
    const { container } = fakeContainer({ controlled: false });
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload: vi.fn() });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });
});
```

Create `src/components/UpdatePrompt.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdatePrompt from './UpdatePrompt';
import { markUpdateAvailable, resetUpdateStateForTests } from '../lib/pwaUpdate';

describe('UpdatePrompt', () => {
  beforeEach(() => resetUpdateStateForTests());

  it('stays hidden until an update is available, then reloads on click', () => {
    const apply = vi.fn();
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => markUpdateAvailable(apply));
    expect(screen.getByRole('status')).toHaveTextContent('A new version of PKS is available');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', () => {
    render(<UpdatePrompt />);
    act(() => markUpdateAvailable(vi.fn()));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.**

Run: `npx vitest run src/lib/pwaUpdate.test.js src/lib/registerServiceWorker.test.js src/components/UpdatePrompt.test.jsx`

Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the store.** Create `src/lib/pwaUpdate.js`:

```js
/**
 * Tiny store for "a new service worker is waiting". The app only reloads when
 * the user clicks Reload, so a deploy never discards unsaved edits.
 */
let applyFn = null;
let available = false;
const listeners = new Set();

/** @param {() => void} apply - activates the waiting worker and reloads this tab */
export function markUpdateAvailable(apply) {
  applyFn = apply;
  available = true;
  listeners.forEach((listener) => listener());
}

export function isUpdateAvailable() {
  return available;
}

/** @param {() => void} listener @returns {() => void} unsubscribe */
export function subscribeUpdate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyUpdate() {
  applyFn?.();
}

export function resetUpdateStateForTests() {
  applyFn = null;
  available = false;
  listeners.clear();
}
```

- [ ] **Step 4: Implement registration.** Create `src/lib/registerServiceWorker.js`:

```js
/**
 * Register the Workbox service worker and surface updates without ever
 * reloading a tab the user didn't ask to reload. Only the tab whose user
 * clicks "Reload" reloads; other open tabs keep their state and see the prompt.
 * The generated sw.js (vite-plugin-pwa, registerType 'prompt') activates on
 * a { type: 'SKIP_WAITING' } message.
 * @param {{
 *   onUpdateReady: (apply: () => void) => void,
 *   container?: ServiceWorkerContainer,
 *   reload?: () => void,
 *   url?: string,
 * }} options
 */
export async function registerServiceWorker({
  onUpdateReady,
  container = navigator.serviceWorker,
  reload = () => window.location.reload(),
  url = '/sw.js',
}) {
  if (!container) return;
  let reloadRequested = false;
  container.addEventListener('controllerchange', () => {
    if (reloadRequested) reload();
  });

  const registration = await container.register(url, { scope: '/' });
  const offer = (worker) => {
    // No controller means first install: nothing to update from.
    if (!container.controller) return;
    onUpdateReady(() => {
      reloadRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer(installing);
    });
  });
}
```

- [ ] **Step 5: Implement the component.** Create `src/components/UpdatePrompt.jsx`:

```jsx
import { useState, useSyncExternalStore } from 'react';
import { subscribeUpdate, isUpdateAvailable, applyUpdate } from '../lib/pwaUpdate';

/** Bottom bar shown when a new app version is ready; reloads only on request. */
export default function UpdatePrompt() {
  const available = useSyncExternalStore(subscribeUpdate, isUpdateAvailable, isUpdateAvailable);
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;
  return (
    <div className="update-prompt" role="status">
      <span>A new version of PKS is available.</span>
      <button type="button" className="btn btn-primary btn-small" onClick={applyUpdate}>Reload</button>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => setDismissed(true)}>Later</button>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass.**

Run: `npx vitest run src/lib/pwaUpdate.test.js src/lib/registerServiceWorker.test.js src/components/UpdatePrompt.test.jsx`

Expected: 5 passed.

- [ ] **Step 7: Wire it up.**
  - **`vite.config.js`**, in the `VitePWA({ … })` options:
    - Change `registerType: 'autoUpdate'` to `registerType: 'prompt'`.
    - Add `injectRegister: false,` so the plugin doesn't inject its own registration script.
    - In `workbox`, delete `skipWaiting: true,` and `clientsClaim: true,`.
  - **`main.jsx`:**
    1. Delete `import { registerSW } from 'virtual:pwa-register'`.
    2. Delete the whole `if (typeof registerSW === 'function') { … }` block.
    3. Add the imports:

    ```js
    import { registerServiceWorker } from './lib/registerServiceWorker'
    import { markUpdateAvailable } from './lib/pwaUpdate'
    ```

    4. In place of the deleted block, add:

    ```js
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      const start = () => {
        registerServiceWorker({ onUpdateReady: markUpdateAvailable }).catch((err) => {
          console.error('Service worker registration failed', err)
        })
      }
      if (document.readyState === 'complete') start()
      else window.addEventListener('load', start, { once: true })
    }
    ```

  - **`App.jsx`:**
    - Add `import UpdatePrompt from './components/UpdatePrompt';`.
    - Render `<UpdatePrompt />` directly after `</Suspense>` inside `<BrowserRouter>`.
  - **`App.css`:** append

  ```css
  .update-prompt {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + var(--mobile-nav-offset, 0px));
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-8);
    background: var(--surface-elevated);
    color: var(--polar-white);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    box-shadow: var(--modal-shadow);
  }
  ```

- [ ] **Step 8: Verify, including a manual two-tab check.**
  1. Run: `npm run lint && npm test && npm run build && npm run check:bundle`. Expected: pass.
  2. Run: `CG_OK=1 grep -c "SKIP_WAITING" dist/sw.js`. Expected: at least 1. The generated worker handles the message.
  3. Run `npm run preview`. Open the app in tabs A and B, and start editing an object in tab A.
  4. Change any visible text in a page, run `npm run build` again, and restart preview.
  5. Refresh tab B. Both tabs show the "new version" bar, and neither reloads.
  6. Click **Reload in tab B**. Tab B reloads onto the new version. **Tab A does not reload**, and its unsaved text is still there.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/pwaUpdate.js src/lib/pwaUpdate.test.js src/lib/registerServiceWorker.js src/lib/registerServiceWorker.test.js src/components/UpdatePrompt.jsx src/components/UpdatePrompt.test.jsx src/main.jsx src/App.jsx src/App.css vite.config.js
git commit -m "fix(pwa): prompt before updating; only the tab that asks reloads"
```

---

### Task 13: Template options input and ObjectNew draft restore

This fixes audit findings B9 (dropdown options can't be typed) and B10 (the ObjectNew draft restore is wiped).

**Files:**
- Create:
  - `frontend/src/lib/templateOptions.js`, `frontend/src/lib/templateOptions.test.js`
  - `frontend/src/components/OptionsInput.jsx`, `frontend/src/components/OptionsInput.test.jsx`
- Modify: `frontend/src/pages/Templates.jsx:577-590`, `frontend/src/pages/ObjectNew.jsx:90-110`

**Interfaces:**
- Produces:
  - `parseOptions(text: string): string[]`
  - `<OptionsInput options={string[]} onCommit={(opts: string[]) => void} className ariaLabel />`

- [ ] **Step 1: Write the failing tests.** Create `src/lib/templateOptions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseOptions } from './templateOptions';

describe('parseOptions', () => {
  it('splits on commas, trims, drops blanks and duplicates', () => {
    expect(parseOptions(' Draft, In review ,, Done, Draft ')).toEqual(['Draft', 'In review', 'Done']);
  });
  it('returns [] for empty input', () => {
    expect(parseOptions('')).toEqual([]);
  });
});
```

Create `src/components/OptionsInput.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptionsInput from './OptionsInput';

describe('OptionsInput', () => {
  it('lets the user type commas and commits parsed options on blur', () => {
    const onCommit = vi.fn();
    render(<OptionsInput options={['Draft']} onCommit={onCommit} ariaLabel="Dropdown options" />);
    const input = screen.getByLabelText('Dropdown options');
    fireEvent.change(input, { target: { value: 'Draft, ' } });
    expect(input).toHaveValue('Draft, ');
    fireEvent.change(input, { target: { value: 'Draft, Done' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(['Draft', 'Done']);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.**

Run: `npx vitest run src/lib/templateOptions.test.js src/components/OptionsInput.test.jsx`

Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement.** Create `src/lib/templateOptions.js`:

```js
/**
 * Parse a comma-separated option list typed by the user.
 * @param {string} text
 * @returns {string[]}
 */
export function parseOptions(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s) && seen.add(s));
}
```

Create `src/components/OptionsInput.jsx`:

```jsx
import { useState } from 'react';
import { parseOptions } from '../lib/templateOptions';

/**
 * Comma-separated options field. Keeps the raw text while typing (so commas and
 * trailing spaces survive) and commits the parsed list on blur.
 */
export default function OptionsInput({ options, onCommit, className, placeholder, ariaLabel }) {
  const [text, setText] = useState(() => (Array.isArray(options) ? options.join(', ') : ''));
  return (
    <input
      type="text"
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(parseOptions(text))}
    />
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `npx vitest run src/lib/templateOptions.test.js src/components/OptionsInput.test.jsx`

Expected: 3 passed.

- [ ] **Step 5: Use it in `Templates.jsx`.**
  1. Add `import OptionsInput from '../components/OptionsInput';`.
  2. Replace the `<input type="text" placeholder="e.g. Draft, In review, Done" className="templates-field-options" … aria-label="Dropdown options" />` element with the component below. The `key` matters: field rows are keyed by index and templates switch without unmounting, so without it the input would keep another field's text and commit it on blur.

  ```jsx
                                    <OptionsInput
                                      key={`${editingId}:${i}:${f.key}`}
                                      options={f.options}
                                      onCommit={(opts) => updateField(i, { options: opts })}
                                      className="templates-field-options"
                                      placeholder="e.g. Draft, In review, Done"
                                      ariaLabel="Dropdown options"
                                    />
  ```

- [ ] **Step 6: Keep restored template values in `ObjectNew.jsx`.**
  1. Above the template-reset effect (the one ending with `}, [selectedTemplateId]);`), add:

  ```js
    // Template values restored from a draft; the reset effect below must not wipe them.
    const restoredTemplateValuesRef = useRef(null);
  ```

  2. Make the first lines inside that reset effect:

  ```js
      if (restoredTemplateValuesRef.current) {
        setTemplateValues(restoredTemplateValuesRef.current);
        restoredTemplateValuesRef.current = null;
        return;
      }
  ```

  3. A template draft has no title or content, because those inputs are hidden while a template is selected, so the restore guard currently skips it. In the draft-restore effect, replace

  ```js
      if (!draft.form.title?.trim() && !draft.form.content?.trim()) return;
  ```

  with:

  ```js
      const hasTemplateInput = Object.values(draft.templateValues || {}).some((v) => String(v ?? '').trim());
      if (!draft.form.title?.trim() && !draft.form.content?.trim() && !hasTemplateInput) return;
  ```

  4. In the same effect, replace the two lines

  ```js
      if (draft.selectedTemplateId) setSelectedTemplateId(draft.selectedTemplateId);
      if (draft.templateValues && Object.keys(draft.templateValues).length) setTemplateValues(draft.templateValues);
  ```

  with:

  ```js
      if (draft.templateValues && Object.keys(draft.templateValues).length) {
        if (draft.selectedTemplateId) restoredTemplateValuesRef.current = draft.templateValues;
        setTemplateValues(draft.templateValues);
      }
      if (draft.selectedTemplateId) setSelectedTemplateId(draft.selectedTemplateId);
  ```

- [ ] **Step 7: Verify, including manual checks.**
  1. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  2. **Templates:** add a dropdown field, type `Draft, In review, Done`, and click elsewhere. Save the template, reopen it, and all 3 options are there. Open a different template: its dropdown shows its own options, not the previous template's.
  3. **ObjectNew:** pick a template, fill a field, and reload the page. "Draft restored" appears and the field value is still there.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/templateOptions.js src/lib/templateOptions.test.js src/components/OptionsInput.jsx src/components/OptionsInput.test.jsx src/pages/Templates.jsx src/pages/ObjectNew.jsx
git commit -m "fix(templates): typeable dropdown options; keep template values on draft restore"
```

---

### Task 14: Remove pulse rings, celebration and targets

The audit (§2) found the celebration can never fire in normal use, and the metrics count views as work.

**Files:**
- Delete:
  - `frontend/src/features/dashboard/components/Hero/PulseRings.jsx`, `PulseRings.css`
  - `frontend/src/features/dashboard/components/Settings/PulseTargetsForm.jsx`, `PulseTargetsForm.css`
  - `frontend/src/features/dashboard/hooks/usePulseMetrics.js`, `usePulseCelebration.js`, `usePulseCelebration.test.js`
- Modify:
  - `frontend/src/features/dashboard/components/Hero/DashboardHero.jsx`, `DashboardHero.css:6-30`
  - `frontend/src/features/dashboard/components/DashboardView.jsx:40,63-74`
  - `frontend/src/features/dashboard/hooks/useDashboardPage.js:13-14,98,490-494,564-567`
  - `frontend/src/pages/Settings.jsx:13,649-653`
  - `frontend/src/pages/Dashboard.css:4` (the `PulseRings.css` `@import`)

**Interfaces:**
- Produces: `DashboardHero` props become `{ displayName, resumeObject, pendingObject, sparkObject, runPromptSuffix, isFirstRun }`.

- [ ] **Step 1: Delete the files.**

```bash
git rm src/features/dashboard/components/Hero/PulseRings.jsx src/features/dashboard/components/Hero/PulseRings.css \
  src/features/dashboard/components/Settings/PulseTargetsForm.jsx src/features/dashboard/components/Settings/PulseTargetsForm.css \
  src/features/dashboard/hooks/usePulseMetrics.js src/features/dashboard/hooks/usePulseCelebration.js \
  src/features/dashboard/hooks/usePulseCelebration.test.js
```

- [ ] **Step 2: Simplify `DashboardHero.jsx`.**
  1. Remove `import PulseRings from './PulseRings';`.
  2. Remove the props `pulseValues`, `pulseTargets`, `pulseLoading` and `celebrateRing = null`.
  3. Set the `<section>` className to the plain string `"dashboard-hero-v2"`.
  4. Delete the `<PulseRings … />` element.
  5. Change the hint text to `Create your first object to get started.`.
  6. Change the JSDoc line to `Dashboard hero: greeting + trailheads.`.

- [ ] **Step 3: Remove the celebrate and ring CSS.**
  1. In `src/pages/Dashboard.css`, delete the line `@import '../features/dashboard/components/Hero/PulseRings.css';`. The build fails with ENOENT if it stays; tests would still pass because Vitest doesn't process CSS.
  2. In `DashboardHero.css`:
     - Delete the `.dashboard-hero-v2--celebrate` rule.
     - Delete the `@keyframes dashboard-hero-celebrate` block.
     - Delete the reduced-motion override for `.dashboard-hero-v2--celebrate`.
     - Delete the `.pulse-rings` rule inside the media query near the end of the file.
  3. Check with `CG_OK=1 grep -rn "celebrate\|pulse-rings\|PulseRings" src --include=*.css`; expected: no output.

- [ ] **Step 4: Update `DashboardView.jsx`.**
  1. Remove `pulseValues, pulseTargets, pulseLoading, celebrateRing,` from the props destructuring (line 40).
  2. Delete the four props `celebrateRing={celebrateRing}`, `pulseValues={pulseValues}`, `pulseTargets={pulseTargets}` and `pulseLoading={pulseLoading}` from `<DashboardHero>`.

- [ ] **Step 5: Update `useDashboardPage.js`.**
  1. Delete the `usePulseMetrics` and `usePulseCelebration` imports.
  2. Delete the line `const { values: pulseValues, … } = usePulseMetrics(user?.id ?? null);`.
  3. Delete the `const { celebrateRing } = usePulseCelebration(…);` call.
  4. Delete `pulseValues,`, `pulseTargets,`, `pulseLoading,` and `celebrateRing,` from the returned object.

- [ ] **Step 6: Update `Settings.jsx`.** Delete the `PulseTargetsForm` import, and delete the whole `<section … aria-labelledby="pulse-targets-heading"> … </section>`.

- [ ] **Step 7: Verify, including a manual check.**
  1. Run: `CG_OK=1 grep -rn "Pulse\(Rings\|Metrics\|Celebration\|TargetsForm\)\|celebrateRing\|pulseValues" src`. Expected: no output.
  2. Run: `npm run lint && npm test && npm run build && npm run check:bundle`. Expected: pass.
  3. Manual: the dashboard renders the greeting and trailheads with no rings, and Settings has no "Daily pulse targets".

- [ ] **Step 8: Commit.**

```bash
git add -A src/features/dashboard src/pages/Settings.jsx src/pages/Dashboard.css
git commit -m "refactor(dashboard): remove pulse rings, celebration and targets"
```

---

### Task 15: One navigation config; remove the menu wheel, About and slug route

This implements the MainMenuDeck, About and ObjectBySlug removals from audit §2, puts Trash in the nav, and fixes audit findings M7 (the mobile drawer shows icons only) and A4 (the closed drawer stays in the tab order).

**Files:**
- Create: `frontend/src/constants/navigation.js`, `frontend/src/constants/navigation.test.js`
- Delete:
  - `frontend/src/components/MainMenuDeck.jsx`, `MainMenuDeck.css`, `MainMenuDeckContext.jsx`
  - `frontend/src/pages/About.jsx`, `About.css`
  - `frontend/src/pages/ObjectBySlug.jsx`
- Modify:
  - `frontend/src/components/AppLayout.jsx`, `AppLayout.css:444-447`
  - `frontend/src/components/AppShell.jsx`
  - `frontend/src/components/CommandPalette.jsx:6-22`
  - `frontend/src/pages/Settings.jsx:11,29,571-584`
  - `frontend/src/routeConfig.jsx`

**Interfaces:**
- Produces:
  - `NAV_GROUPS: { label: string, items: NavItem[] }[]`
  - `NAV_ITEMS: NavItem[]`, where `NavItem = { to: string, label: string, icon: string, keywords: string[] }`

- [ ] **Step 1: Write the failing test.** Create `src/constants/navigation.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS } from './navigation';

describe('navigation config', () => {
  it('flattens groups and has unique paths', () => {
    expect(NAV_ITEMS.length).toBe(NAV_GROUPS.reduce((n, g) => n + g.items.length, 0));
    expect(new Set(NAV_ITEMS.map((i) => i.to)).size).toBe(NAV_ITEMS.length);
  });

  it('includes Trash and no longer includes About', () => {
    const paths = NAV_ITEMS.map((i) => i.to);
    expect(paths).toContain('/trash');
    expect(paths).not.toContain('/about');
  });

  it('gives every item a label, icon and search keywords', () => {
    NAV_ITEMS.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.keywords.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/constants/navigation.test.js`

Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement.** Create `src/constants/navigation.js`:

```js
/**
 * Single source of truth for app navigation: the sidebar and the command palette
 * both read this, so a page can't be reachable from one and missing from the other.
 */
export const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: '⌂', keywords: ['home', 'dashboard'] },
      { to: '/search', label: 'Search', icon: '🔍', keywords: ['search', 'find', 'query'] },
      { to: '/quick', label: 'Quick capture', icon: '⚡', keywords: ['quick', 'capture', 'add'] },
      { to: '/objects/new', label: 'New object', icon: '+', keywords: ['new', 'create', 'object'] },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/paste', label: 'Paste bin', icon: '📋', keywords: ['paste', 'pastebin', 'snippet', 'code'] },
      { to: '/journal', label: 'Journal', icon: '📅', keywords: ['journal', 'calendar', 'diary', 'entry'] },
      { to: '/prompts', label: 'Prompts', icon: '◆', keywords: ['prompts', 'prompt'] },
      { to: '/templates', label: 'Templates', icon: '◇', keywords: ['templates', 'template'] },
      { to: '/notifications', label: 'Notifications', icon: '◉', keywords: ['notifications', 'notify', 'alerts'] },
      { to: '/audit-logs', label: 'Audit logs', icon: '▤', keywords: ['audit', 'logs', 'history'] },
      { to: '/integrations', label: 'Integrations', icon: '◈', keywords: ['integrations', 'webhooks'] },
      { to: '/import', label: 'Import', icon: '↓', keywords: ['import', 'upload', 'csv', 'markdown'] },
      { to: '/trash', label: 'Trash', icon: '🗑', keywords: ['trash', 'deleted', 'restore'] },
      { to: '/settings', label: 'Settings', icon: '⚙', keywords: ['settings', 'preferences'] },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx vitest run src/constants/navigation.test.js`

Expected: 3 passed.

- [ ] **Step 5: Use it in the palette.** In `CommandPalette.jsx`:
  1. Replace the whole `const QUICK_ACTIONS = [ … ];` array with:

  ```js
  const QUICK_ACTIONS = NAV_ITEMS.map(({ to, label, keywords }) => ({ label, path: to, keywords }));
  ```

  2. Add `import { NAV_ITEMS } from '../constants/navigation';`.

- [ ] **Step 6: Update `AppLayout.jsx`.**
  1. Delete the local `navGroups` array and add `import { NAV_GROUPS } from '../constants/navigation';`. Use `NAV_GROUPS` in place of `navGroups` in the JSX.
  2. Delete the `MainMenuDeck` and `useDeckEnabled` imports and the line `const { deckEnabled } = useDeckEnabled();`.
  3. Remove `${deckEnabled ? 'app-layout-deck-enabled' : ''}` from the root `className`.
  4. Replace the `{deckEnabled ? ( <MainMenuDeck /> ) : ( <nav className="app-layout-bottom-nav" …> … </nav> )}` expression with only the `<nav className="app-layout-bottom-nav" …> … </nav>` element.
  5. Below `const isMobile = useIsMobile(768);`, add:

  ```js
    // The mobile drawer always shows labels, even if the desktop sidebar is collapsed.
    const showLabels = !collapsed || isMobile;
  ```

  6. Replace every `{!collapsed && (` and `{!collapsed && <` with `{showLabels && (` / `{showLabels && <`. There are 6 occurrences: brand words, command hint, group label, nav label, user email and sign-out label.
  7. Replace `title={collapsed ? label : undefined}` with `title={showLabels ? undefined : label}`, and `title={collapsed ? 'Sign out' : undefined}` with `title={showLabels ? undefined : 'Sign out'}`.
  8. On the `<aside className="app-layout-sidebar" …>`, replace `aria-hidden={isMobile && !mobileMenuOpen}` with `inert={isMobile && !mobileMenuOpen}`. `inert` removes the closed drawer's links from the tab order; `aria-hidden` alone did not.

- [ ] **Step 7: Update `AppShell.jsx`.** Remove the `DeckProvider` import and wrapper. The component returns:

```jsx
    <AppLayout>
      <Outlet />
    </AppLayout>
```

Change the doc comment to `(sidebar, notifications)`.

- [ ] **Step 8: Update `Settings.jsx`.** Delete the `useDeckEnabled` import, the line `const { deckEnabled: mainMenuDeckEnabled, setDeckEnabled } = useDeckEnabled();`, and the whole "Bottom menu" section: from the `<section className="settings-section page-section">` line directly above `<h2 className="page-section-title">Bottom menu</h2>` through its matching `</section>`.

- [ ] **Step 9: Update `routeConfig.jsx`.**
  1. Delete `const About = lazy(...)` and `const ObjectBySlug = lazy(...)`.
  2. Delete the `/objects/by-slug/:slug` route.
  3. Delete the `/about` route.

- [ ] **Step 10: Delete the files and the deck CSS.**
  1. Run:

  ```bash
  git rm src/components/MainMenuDeck.jsx src/components/MainMenuDeck.css src/components/MainMenuDeckContext.jsx \
    src/pages/About.jsx src/pages/About.css src/pages/ObjectBySlug.jsx
  ```

  2. In `AppLayout.css`, delete the comment `/* When menu deck (wheel) is enabled, reserve space above the trigger */` and the `.app-layout-deck-enabled .app-layout-main { … }` rule.

- [ ] **Step 11: Verify, including manual checks.**
  1. Run: `CG_OK=1 grep -rn "MainMenuDeck\|useDeckEnabled\|DeckProvider\|deck-enabled\|/about\|by-slug\|ObjectBySlug" src`. Expected: no output.
  2. Run: `npm run lint && npm test && npm run build && npm run check:bundle`. Expected: pass.
  3. **Sidebar and palette:** Trash appears in the sidebar under Tools, and Ctrl+K → "trash" finds it.
  4. **Collapsed sidebar on mobile:** at 375 px width with the sidebar collapsed on desktop first, the mobile drawer shows labels.
  5. **Closed drawer:** with the drawer closed, Tab from the menu button never lands on hidden drawer links.

- [ ] **Step 12: Commit.**

```bash
git add -A src
git commit -m "refactor(nav): single nav config with Trash; remove menu wheel, About and slug route; fix mobile drawer"
```

---

### Task 16: Design-token contrast, undefined tokens and focus ring

This fixes audit findings A1 (primary button contrast), A2 (faint and status token contrast), A3 (invisible dashboard focus ring) and B20 (CSS tokens used but never defined), plus audit M3 (the invalid Settings media query) is guarded by a test here.

**Files:**
- Create: `frontend/src/test/designTokens.test.js`
- Modify:
  - `frontend/src/index.css` (dark `:root` block, light block, `.btn-primary`)
  - `frontend/src/App.css` (`.toast-success`)
  - `frontend/src/pages/Dashboard.css:1212-1215`
  - `frontend/src/pages/ObjectDetail.css:176,226,1075`
  - `frontend/src/features/dashboard/components/Selection/BulkActionRibbon.css:52`
  - `frontend/src/pages/Settings.css:174`
  - The six page-level `.btn-primary` overrides that re-apply the failing gradient: `Dashboard.css` (`.dashboard-actions .btn-primary`), `Journal.css` (`.journal-page .btn-primary`), `ObjectDetail.css` (`.object-detail .btn-primary`), `ObjectForm.css` (`.object-form-page .btn-primary`), `PasteBin.css` (`.paste-bin-page .btn-primary`), `Settings.css` (`.settings-form .btn-primary`)

**Interfaces:**
- Produces: the new tokens `--on-accent`, `--accent-strong-start`, `--accent-strong-end` and `--mobile-nav-offset` (default `0px`; Task 17 sets it on mobile).

- [ ] **Step 1: Write the failing test.** Create `src/test/designTokens.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8');

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}
const allCss = cssFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

function tokenBlock(re) {
  const m = indexCss.match(re);
  if (!m) throw new Error(`token block not found: ${re}`);
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
const dark = tokenBlock(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/);
const light = { ...dark, ...tokenBlock(/\[data-theme="light"\]\s*\{([^}]*)\}/) };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const blend = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
const t = (theme, name) => rgb(theme[name]);

describe('text contrast meets WCAG AA (4.5:1)', () => {
  it('faint text on dark surfaces', () => {
    expect(ratio(t(dark, '--polar-faint'), t(dark, '--surface'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t(dark, '--polar-faint'), t(dark, '--surface-elevated'))).toBeGreaterThanOrEqual(4.5);
  });
  it('faint text on the light background', () => {
    expect(ratio(t(light, '--polar-faint'), t(light, '--space-black'))).toBeGreaterThanOrEqual(4.5);
  });
  it('primary button text on both gradient stops, in both themes', () => {
    for (const theme of [dark, light]) {
      expect(ratio(t(theme, '--on-accent'), t(theme, '--accent-strong-start'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t(theme, '--on-accent'), t(theme, '--accent-strong-end'))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('success toast text in light theme', () => {
    const toastBg = blend([34, 197, 94], 0.2, t(light, '--space-black'));
    expect(ratio(t(light, '--success-text'), toastBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('stylesheet hygiene', () => {
  it('every var() without a fallback refers to a defined custom property', () => {
    const defined = new Set(allCss.flatMap(({ text }) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
    const missing = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name) && !/^--(bn|mantine)-/.test(name))
        .map((name) => `${name} in ${file.slice(SRC.length + 1)}`));
    expect(missing).toEqual([]);
  });
  it('no :focus-visible rule removes the outline', () => {
    const offenders = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)]
        .filter((m) => /outline:\s*(none|0)\b/.test(m[2]))
        .map((m) => `${m[1].trim()} in ${file.slice(SRC.length + 1)}`));
    expect(offenders).toEqual([]);
  });
  it('no .btn-primary rule re-applies the low-contrast accent gradient', () => {
    const offenders = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/([^{}]*\.btn-primary[^{}]*)\{([^}]*)\}/g)]
        .filter((m) => /--accent-gradient|color:\s*var\(--polar-white\)/.test(m[2]))
        .map((m) => `${m[1].trim()} in ${file.slice(SRC.length + 1)}`));
    expect(offenders).toEqual([]);
  });
  it('no media query uses var(), which browsers ignore', () => {
    const offenders = allCss.filter(({ text }) => /@media[^{]*var\(/.test(text)).map(({ file }) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/test/designTokens.test.js`

Expected: 7 of 8 tests FAIL. "Faint text on the light background" already passes (4.55), and the fix below just adds margin. The failures:
- faint contrast on dark surfaces (3.63 / 3.18)
- `--on-accent` (hex parse of `undefined` throws)
- light success toast (2.66)
- missing `--accent` / `--accent-primary`
- the Dashboard `:focus-visible` outline
- the `Settings.css` media query
- seven `.btn-primary` rules using the gradient: `index.css` plus the six page overrides

- [ ] **Step 3: Fix the tokens in `index.css`.**
  1. In the dark `:root, [data-theme="dark"]` block:
     - Change `--polar-faint: #64748b;` to `--polar-faint: #8391a7;`.
     - After the `--accent-gradient` line, add:

     ```css
       /* Solid-contrast gradient for filled buttons (white text passes AA on both stops) */
       --accent-strong-start: #be185d;
       --accent-strong-end: #4338ca;
       --on-accent: #ffffff;
       /* Height of the fixed mobile bottom nav; 0 on desktop, set in AppLayout.css */
       --mobile-nav-offset: 0px;
     ```

  2. In the `[data-theme="light"]` block:
     - Change `--polar-faint: #64748b;` to `--polar-faint: #5b6b82;`.
     - Change `--success: #16a34a;` to `--success: #15803d;`.
     - Change `--success-text: #16a34a;` to `--success-text: #166534;`.
  3. Replace the two properties of `.btn-primary`

  ```css
    background: var(--accent-gradient);
    color: var(--polar-white);
  ```

  with:

  ```css
    background: linear-gradient(135deg, var(--accent-strong-start) 0%, var(--accent-strong-end) 100%);
    color: var(--on-accent);
  ```

- [ ] **Step 4: Fix undefined tokens, the focus ring, the ribbon colour and the media query.**
  1. **`ObjectDetail.css`:**
     - Line 176: `border-color: var(--accent);` becomes `border-color: var(--cosmic-pink);`.
     - Line 226: `color: var(--accent);` becomes `color: var(--cosmic-pink);`.
     - Line 1075: `accent-color: var(--accent-primary);` becomes `accent-color: var(--cosmic-pink);`.
  2. **`Dashboard.css`:** delete the rule

  ```css
  .dashboard-main .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--cosmic-pink-glow);
  }
  ```

  The global 2 px outline then applies.
  3. **`BulkActionRibbon.css:52`:** `color: #f87171;` becomes `color: var(--error-text);`.
  4. **`Settings.css:174`:** `@media (max-width: var(--bp-md, 768px)) {` becomes `@media (max-width: 768px) {`. This also fixes audit M3: the page's mobile layout now applies.
  5. **The six page overrides:** in each rule listed under Files, delete the `background: var(--accent-gradient);` and `color: var(--polar-white);` declarations, keeping any `box-shadow`. The `.journal-page .btn-primary` and `.paste-bin-page .btn-primary` rules are then empty; delete them entirely.
  6. **`index.css`:** change the comment above `--bp-sm` from `(use in media queries: …)` to `(reference only: custom properties can't be used inside @media)`.

- [ ] **Step 5: Run it and confirm it passes.**

Run: `npx vitest run src/test/designTokens.test.js`

Expected: 8 passed.

- [ ] **Step 6: Verify, including a manual check.**
  1. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  2. Manual, in both themes:
     - Primary buttons have white text on a darker pink→indigo gradient on every page, including Dashboard, the object page, New object, Settings, Journal and Paste bin.
     - Tabbing through dashboard buttons shows a visible outline.
     - Hints and labels are readable.

- [ ] **Step 7: Commit.**

```bash
git add src/test/designTokens.test.js src/index.css src/App.css src/pages/Dashboard.css src/pages/ObjectDetail.css src/pages/Settings.css src/pages/Journal.css src/pages/ObjectForm.css src/pages/PasteBin.css src/features/dashboard/components/Selection/BulkActionRibbon.css
git commit -m "fix(a11y): AA contrast for buttons and faint/success text, visible focus, define missing tokens"
```

---

### Task 17: Mobile layout blockers

This fixes audit findings M1 (the bottom nav covers sheets, the bulk ribbon and the FAB), M2 (`viewport-fit=cover` is missing) and M4 (iOS zooms on focus because inputs are under 16 px). M3 was fixed in Task 16.

**Files:**
- Modify:
  - `frontend/index.html:8`
  - `frontend/src/components/AppLayout.css` (the `@media (max-width: 768px)` block)
  - `frontend/src/pages/ObjectDetail.css:1520-1545`
  - `frontend/src/features/dashboard/components/Selection/BulkActionRibbon.css:59-66`
  - `frontend/src/pages/Dashboard.css:1701-1703`
  - `frontend/src/index.css` (end of file)
- Modify (test): `frontend/src/test/designTokens.test.js`

**Interfaces:**
- Consumes (from Task 16): the `--mobile-nav-offset` token (default `0px`).
- Produces: none.

- [ ] **Step 1: Write the failing test.** Append to `src/test/designTokens.test.js`:

```js
describe('mobile shell', () => {
  it('enables safe-area insets via viewport-fit=cover', () => {
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
  });
  it('sets --mobile-nav-offset on small screens', () => {
    const layout = readFileSync(join(SRC, 'components', 'AppLayout.css'), 'utf8');
    expect(layout).toMatch(/@media \(max-width: 768px\)[\s\S]*--mobile-nav-offset:\s*calc\(56px \+ env\(safe-area-inset-bottom/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx vitest run src/test/designTokens.test.js`

Expected: 2 failures in "mobile shell".

- [ ] **Step 3: Implement.**
  1. **`index.html` line 8:** make it `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.
  2. **`AppLayout.css`:** as the first rule inside the first `@media (max-width: 768px) {` block, add:

  ```css
    :root {
      /* Everything fixed to the bottom must sit above the 56px bottom nav */
      --mobile-nav-offset: calc(56px + env(safe-area-inset-bottom, 0px));
    }
  ```

  3. **`ObjectDetail.css`:** in the mobile `.share-panel, .export-panel` rule, change `bottom: 0;` to `bottom: var(--mobile-nav-offset);` and `max-height: 85vh;` to `max-height: calc(85dvh - var(--mobile-nav-offset));`. In `.run-prompt-overlay-panel` (same media block), change `max-height: calc(100vh - 1.5rem);` to `max-height: calc(100dvh - 1.5rem - var(--mobile-nav-offset));`.
  4. **`BulkActionRibbon.css`:** inside `@media (max-width: 600px) { .bulk-action-ribbon { … } }`, add `bottom: calc(16px + var(--mobile-nav-offset));` below `flex-wrap: wrap;`.
  5. **`Dashboard.css`:** change the mobile rule `.dashboard-fab { display: flex; }` (line ~1701) to:

  ```css
    .dashboard-fab {
      display: flex;
      bottom: calc(1rem + var(--mobile-nav-offset));
    }
  ```

  6. **`index.css`:** append

  ```css
  /* iOS Safari zooms the page when a focused field's font is under 16px.
     !important is deliberate: page styles set smaller sizes with class selectors. */
  @media (max-width: 768px) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select,
    textarea {
      font-size: 16px !important;
    }
  }
  ```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx vitest run src/test/designTokens.test.js`

Expected: 10 passed.

- [ ] **Step 5: Manual check** in devtools device mode, iPhone 12 Pro (390×844), with the default bottom bar:
  - [ ] Object → Export: the sheet's Export/Cancel buttons sit above the bottom nav and are tappable.
  - [ ] Object → Share: the same for its buttons.
  - [ ] Dashboard: select 2 objects; the ribbon's Export/Trash buttons are above the nav.
  - [ ] Dashboard: the + button doesn't cover the Settings tab.
  - [ ] Settings: the forms stack in one column.
  - [ ] Focusing the dashboard search box doesn't zoom (check on a real iPhone if one is available).

- [ ] **Step 6: Run the full checks and commit.**

Run: `npm run lint && npm test && npm run build && npm run check:bundle`. Expected: pass.

```bash
git add index.html src/components/AppLayout.css src/pages/ObjectDetail.css src/features/dashboard/components/Selection/BulkActionRibbon.css src/pages/Dashboard.css src/index.css src/test/designTokens.test.js
git commit -m "fix(mobile): keep sheets, ribbon and FAB above bottom nav; safe areas; no iOS input zoom"
```

---

### Task 18: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml` (repo root)

**Interfaces:**
- Consumes: `npm run lint`, `npm test`, `npm run build` and `npm run check:bundle` (Task 4).
- Produces: none.

- [ ] **Step 1: Create `.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run check:bundle
      # A new upstream advisory must not block unrelated pushes; the step still shows red in the log.
      - run: npm audit --omit=dev --audit-level=high
        continue-on-error: true
```

- [ ] **Step 2: Validate locally the same way CI will run** (a clean install).

Run: `npm ci && npm run lint && npm test && npm run build && npm run check:bundle && npm audit --omit=dev --audit-level=high`

Expected: every command exits 0.

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, test, build, bundle check and prod audit on every push"
```

- [ ] **Step 4: Ask the owner before pushing.** Pushing to `origin` (github.com/tsatsu10/PKs) triggers the first CI run. Once they agree, push and check the run with `gh run watch`.

---

## Deferred to plan −1B (database & edge functions)

These need schema or edge-function changes, so they stay out of −1A:
- B1: opening an object bumps `updated_at`
- B8: `prompt_runs` double insert
- B15: `edited_by` NOT NULL
- B18 / B19: webhook and quota bugs
- S1–S10, S13: security items
- D3–D6: data-integrity items
- Drop `export_jobs` / `export_job_items` and their enums, now unused after Task 8
- The Integrations "generic" type and PromptBank `output_format` (UI and columns removed together)
- The `openai` provider constraint
- The redundant indexes
- `set_updated_at` `search_path`
