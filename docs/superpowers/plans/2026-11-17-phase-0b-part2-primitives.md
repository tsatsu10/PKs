# Phase 0b part 2: UI primitives, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `frontend/src/components/ui/`, a small set of accessible, token-styled primitives, and prove the hard ones at three call sites. The AI panel becomes a real dialog (A5). The dashboard activity drawer becomes a real drawer (M9). The domain, tag and link pickers stop committing on change (A6). Toasts move to a Toaster where error toasts stay until dismissed (A12).

**Architecture:**
- One primitive per file: `components/ui/<Name>.tsx`, `<Name>.css` (imported by the .tsx) and `<Name>.test.tsx`. There is no barrel file; callers import `components/ui/Button`, and so on.
- Every class is prefixed `ui-` and every colour, radius, space and font size comes from a `--pks-*` token (`styles/tokens.css`). A Vitest guard enforces the prefix and the colour/variable rule; spacing in raw px is caught only in review.
- Stacking order (there are no z-index tokens): Dialog layers use `z-index: 1000` (today's overlay value) and the Toaster `9998` (today's toast value), so toasts sit above dialogs.
- Dialog owns its own focus handling: initial focus, a Tab trap, Escape, focus restore, a scroll lock and `inert` on `#root`. Its keyboard handling is a **native** `keydown` listener attached to the panel through a ref in an effect, not a React `onKeyDown` prop: jsx-a11y rejects `onKeyDown` on `role="dialog"`, and React synthetic events bubble through portals, so a nested ConfirmDialog's keys would reach the outer panel. It does not use `@mantine/hooks` `useFocusTrap`, whose visibility check finds no tabbable elements in jsdom, so its behaviour can't be tested. Dialogs and the Toaster portal into `document.body`, outside `#root`.
- Page migration and the CSS sweep are part 3. This part touches pages only at the three proving call sites, plus the mechanical toast import move.

**Tech stack:** React 19, TypeScript, Vitest + Testing Library (`fireEvent`; `user-event` is not installed), jsdom, `lucide-react` (new), `@mantine/hooks` `useMediaQuery` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-11-16-phase-0b-ui-system-design.md` (decision 1 "0b-2", decisions 6–7, and verified status A5, A6, A12, M9).

## Global constraints

- Primitives are TypeScript (spec decision 7). Their CSS uses only `--pks-*` tokens, with no hex, `rgb(`, `hsl(` or legacy `index.css` variables such as `--glass-bg` or `--polar-white`. The one allowed exception is `--mobile-nav-offset`, which is runtime layout state set by AppLayout, not a token.
- Every class selector in `components/ui/*.css` starts with `.ui-`.
- Icons come from `lucide-react`, imported by name (`import { X } from 'lucide-react'`). Every icon is `aria-hidden` and gets a numeric `size` of 16, 20 or 24 (matching `--pks-size-icon-*`; Lucide takes a number, not a CSS variable).
- No `rgba(` shadows: a primitive that needs a shadow writes it with `color-mix(in srgb, var(--pks-color-black) calc(var(--pks-opacity-scrim) * 100%), transparent)`, or has none.
- `useMediaQuery` is always called with `{ getInitialValueInEffect: false }`, so the first render already matches the screen. Tests stub it per case with `vi.spyOn(window, 'matchMedia')` returning an object with `matches`, `addEventListener` and `removeEventListener` (the `setup.js` stub only applies when `matchMedia` is missing).
- Interactive targets are at least `--pks-size-min-target` (24px) in every direction, and at least `--pks-size-touch-target` (44px) under `(pointer: coarse)`.
- The theme switch is `[data-theme="light"]` on `<html>`. Primitives need no theme code, because the tokens switch.
- `npx eslint .` exits 0, `npm run typecheck` (`tsc -b`, what CI runs; `tsc -p .` checks nothing because `tsconfig.json` has `files: []`) exits 0, and `npx vitest run` passes after every task (default pool; `--pool=threads` breaks `datetime.test.js`). Playwright runs in CI only. No Docker.
- The a11y baseline (`frontend/eslint.a11y-baseline.js`) may only shrink. Remove `src/features/object/AiPanel.tsx` once Task 9 makes it clean; the baseline test fails if it is clean and still listed.
- `useToast()` keeps its exact API (`addToast(type, message, opts) → id`, `dismiss(id)`, `toasts`) and `UNDO_TTL_MS = 6000`, so none of its call sites (81 `addToast(` hits including tests, in 26 importing files) change except for the import path.

## Review focus

1. **Stacked dialogs.** The AI panel's discard confirmation opens a ConfirmDialog on top of a Dialog. Escape must close only the top one, and closing it must return focus inside the panel, not to the page. Covered by Task 4's `closes only the top dialog on Escape` test.
2. **Live regions present before the message.** Screen readers ignore a live region that is inserted already holding text. The Toaster's two regions must be in the DOM, empty, from mount. Covered by Task 8's `mounts empty live regions` test.
3. **Losing AI output.** Escape, the backdrop and Cancel all close the AI panel. With unsaved output, each one must ask first rather than silently clearing it (the A5 bug). Covered by Task 9's tests.
4. **The wide-screen activity sidebar.** At 1280px and wider, the activity panel is an inline sidebar and must not become a modal or inert the page. Covered by Task 10's `stays inline on wide screens` test.
5. **Combobox and IME/blur.** Leaving the field (Tab, a click elsewhere) or pressing Enter while the list is closed must not commit anything. Only a click on an option or Enter on the active option commits. Covered by Task 7's tests.

---

### Task 1: Foundation, Button, IconButton, Spinner, Kbd

**Files:**
- Modify: `frontend/package.json` (dependency `lucide-react`)
- Create: `frontend/src/components/ui/{Button,IconButton,Spinner,Kbd}.{tsx,css,test.tsx}`
- Create: `frontend/src/test/uiCss.test.ts`

**Interfaces:**
- Produces: `Button` with `{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger' (default 'secondary'); size?: 'sm' | 'md'; loading?: boolean; ...ButtonHTMLAttributes }` and forwarded `ref`. `type` defaults to `"button"`. While `loading`, it has `aria-busy="true"` and `disabled`, and it shows `<Spinner size="sm" />` before its children.
- Produces: `IconButton` with `{ label: string; icon: LucideIcon; variant?: 'ghost' | 'secondary'; ...ButtonHTMLAttributes }`. It renders `<button aria-label={label} title={label}>` with the icon `aria-hidden`.
- Produces: `Spinner` with `{ size?: 'sm' | 'md'; label?: string }`. It is `role="status"` with the visually hidden text `label ?? 'Loading'`, and the animation stops under `prefers-reduced-motion`.
- Produces: `Kbd` with `{ keys: string[] }`. It renders `<kbd className="ui-kbd">` per key, and maps `'mod'` to `modKey` from `src/lib/keyboardMap.js`. It renders `null` under `(pointer: coarse)`, read with `useMediaQuery` (M11 groundwork).
- Produces: the shared hidden-text class `.ui-visually-hidden`, defined in `Spinner.css` (the first primitive that needs it) and reused by later tasks.

- [ ] **Step 1: Write the failing tests.**
  - `uiCss.test.ts`, `it('prefixes every ui class')`: for each `src/components/ui/*.css`, after stripping `/* … */` comments, every class selector token (`/\.([a-zA-Z][\w-]*)/g` in the selector part, before `{`) starts with `ui-`.
  - `uiCss.test.ts`, `it('uses only pks tokens for values')`: no file contains `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`, or `var(--` followed by anything other than `pks-` or `mobile-nav-offset`.
  - `Button.test.tsx`: `it('defaults to type=button')`, `it('is busy and disabled while loading')` (`aria-busy="true"`, `toBeDisabled()`, has `role="status"`), and `it('forwards the ref')`.
  - `IconButton.test.tsx`, `it('is named by its label')`: `getByRole('button', { name: 'Close' })`, and the svg has `aria-hidden="true"`.
  - `Kbd.test.tsx`: `it('shows the platform modifier')` (`keys={['mod','K']}` renders `modKey` and `K`), and `it('renders nothing on touch')` (stub `matchMedia` so `(pointer: coarse)` matches).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/ui src/test/uiCss.test.ts`. Expected: FAIL (modules missing; with no CSS files, `uiCss` passes vacuously, which is fine).
- [ ] **Step 3: Implement.** `npm i lucide-react`. Write the four primitives. Button's visual styles follow `index.css` `.btn*` (lines 324–366) translated to tokens: primary is `--pks-accent-primary` with `--pks-text-on-accent`, and danger is `--pks-status-danger-fill`. Focus is `outline: 2px solid var(--pks-focus-ring); outline-offset: 2px` on `:focus-visible`. The `.btn` classes stay as they are until part 3.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit** `feat(ui): Button, IconButton, Spinner, Kbd with a ui- and token-only CSS guard`.

### Task 2: Field, Input, Select

**Files:**
- Create: `frontend/src/components/ui/{Field,Input,Select}.{tsx,css,test.tsx}`

**Interfaces:**
- Produces: `Field` with `{ label: string; hint?: string; error?: string; labelHidden?: boolean; children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode }`. It uses `useId()`. The label is `<label htmlFor={id}>`, visually hidden when `labelHidden`. The error is `<p id={id+'-error'} role="alert">`, and the hint is `<p id={id+'-hint'}>`. `describedBy` lists whichever of the two exist.
- Produces: `Input` (`InputHTMLAttributes` plus `invalid?: boolean`, which sets `aria-invalid`; forwarded ref) and `Select` (`SelectHTMLAttributes` plus `invalid?`; forwarded ref). Both are at least `--pks-size-control-height` tall (`--pks-size-control-height-touch` under coarse pointers), with `font-size: var(--pks-text-size-input)` so iOS doesn't zoom.

- [ ] **Step 1: Write the failing tests** in `Field.test.tsx`:
  - `it('labels its control')`: `getByLabelText('Name')` returns the input.
  - `it('describes the control with hint and error')`: with both set, the input's `aria-describedby` contains both ids, and the error has `role="alert"`.
  - `it('hides the label visually but keeps the name')`: with `labelHidden`, the label has class `ui-visually-hidden`, and `getByRole('textbox', { name: 'Name' })` still resolves.
  - `Input.test.tsx`, `it('marks invalid')`: `aria-invalid="true"`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/Field.test.tsx src/components/ui/Input.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Field, Input, Select`.

### Task 3: Card, Badge, EmptyState

**Files:**
- Create: `frontend/src/components/ui/{Card,Badge,EmptyState}.{tsx,css,test.tsx}`

**Interfaces:**
- Produces: `Card` with `{ as?: 'section' | 'div' | 'article'; title?: string; titleLevel?: 2 | 3 (default 3); actions?: ReactNode; children }`. With `title` and `as="section"`, it sets `aria-labelledby` to the heading's id.
- Produces: `Badge` with `{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'ai'; icon?: LucideIcon; children: string }`. Text is required, so a tone is never colour alone (A15 groundwork).
- Produces: `EmptyState` with `{ icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }`. The title is a `<p className="ui-empty-title">`, not a heading, so it doesn't break page outlines.

- [ ] **Step 1: Write the failing tests:** `it('labels a titled section by its heading')` (`getByRole('region', { name: 'Domains' })`), `it('renders the heading level asked for')`, `it('renders badge text')`, and `it('renders the empty state action')`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Card, Badge, EmptyState`.

### Task 4: Dialog and ConfirmDialog

**Files:**
- Create: `frontend/src/components/ui/{Dialog,ConfirmDialog}.{tsx,css,test.tsx}`
- Create: `frontend/src/components/ui/dialogStack.ts`

**Interfaces:**
- Produces: `Dialog` with `{ open: boolean; onClose: (reason: 'escape' | 'backdrop' | 'close-button') => void; title: string; description?: string; variant?: 'center' | 'drawer' (default 'center'); size?: 'sm' | 'md' | 'lg' (max-width 420 / 560 / 720px, default 'md'; ignored for drawer); initialFocusRef?: RefObject<HTMLElement>; footer?: ReactNode; children }`. When `open`, it renders through `createPortal(…, document.body)`:
  - a backdrop (`<div role="presentation" className="ui-dialog-backdrop">`, click → `onClose('backdrop')`; the role keeps jsx-a11y clean);
  - a panel `role="dialog" aria-modal="true" aria-labelledby` (the h2 title) and `aria-describedby` (when `description` is set);
  - an `IconButton` "Close" (`X` icon) → `onClose('close-button')`.
  
  `drawer` slides in from the right (inline-end), full height minus `--mobile-nav-offset`, `width: min(20rem, 92vw)`. Motion is off under `prefers-reduced-motion`.
- Produces: `dialogStack.ts`: `pushDialog(id: string): void`, `popDialog(id: string): void`, `isTopDialog(id: string): boolean`. While the stack is non-empty, `#root` gets `setAttribute('inert', '')` (jsdom 28 has no `inert` property, so don't assign `root.inert`) and `document.body.style.overflow = 'hidden'`. Both are undone, restoring the previous overflow, when the stack empties. A missing `#root` is skipped, not an error. The stack is popped and focus restored both when `open` turns false **and** on unmount (RunPromptPanel is mounted conditionally, `ObjectPage.tsx:234`).
- Focus behaviour:
  - On open, focus moves to `initialFocusRef`, or else the first focusable in the panel body, or else the panel (`tabIndex={-1}`).
  - Tab and Shift+Tab wrap within the panel. The focusables selector is `a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary`; it is selector-based, not a visibility check.
  - On close, focus returns to the element that was focused at open, if it is still connected.
  - Tab and Escape are handled only when `isTopDialog(id)`. Escape calls `onClose('escape')`.
  - The panel listener calls `stopPropagation()` on **every** keydown, so document-level shortcuts (`?` and Ctrl/⌘K in `AppLayout.jsx`, Ctrl/⌘K in `useDashboardKeyboard.js:47`) don't open modals behind the dialog.
- Produces: `ConfirmDialog` with `{ open; title; message: ReactNode; confirmLabel: string; cancelLabel?: string (default 'Cancel'); danger?: boolean; onConfirm: () => void; onCancel: () => void }`. It is a `Dialog` whose initial focus is the **cancel** button (the safe default). Escape, the backdrop and the close button all call `onCancel`.

- [ ] **Step 1: Write the failing tests** in `Dialog.test.tsx` (render a `<div id="root">` page with a trigger button, and append the root to `document.body` in `beforeEach`):
  - `it('is a labelled modal dialog')`: `getByRole('dialog', { name: 'Run prompt' })` has `aria-modal="true"`.
  - `it('moves focus in and returns it on close')`: after open, `document.activeElement` is inside the dialog. After rerendering with `open={false}`, the trigger has focus.
  - `it('cleans up on unmount')`: unmounting an open dialog removes `inert` from `#root`, restores overflow and returns focus to the trigger.
  - `it('keeps page shortcuts out')`: with a `document` keydown listener spy, a `?` keydown inside the panel never reaches it.
  - `it('traps Tab at both ends')`: with focus on the last focusable, `fireEvent.keyDown(panel, { key: 'Tab' })` puts focus on the first; Shift+Tab on the first puts it on the last.
  - `it('reports why it closed')`: Escape → `'escape'`, a backdrop click → `'backdrop'`, the Close button → `'close-button'`.
  - `it('inerts the page and locks scroll while open')`: `#root` has the `inert` attribute and `body.style.overflow` is `'hidden'`. After close, neither remains and the old overflow is restored.
  - `it('closes only the top dialog on Escape')` (Review focus 1): with a Dialog and a ConfirmDialog both open, Escape calls the confirm's `onCancel` once and the Dialog's `onClose` zero times.
  - `ConfirmDialog.test.tsx`, `it('focuses Cancel first')` and `it('confirms and cancels')`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/Dialog.test.tsx src/components/ui/ConfirmDialog.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the native panel listener described under Architecture. Ids come from `useId()`.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Dialog with focus trap, Escape, stack and inert; ConfirmDialog`.

### Task 5: Popover and Tabs

**Files:**
- Create: `frontend/src/components/ui/{Popover,Tabs}.{tsx,css,test.tsx}`

**Interfaces:**
- Produces: `Popover` with `{ trigger: (props: { ref; 'aria-expanded': boolean; 'aria-controls': string; onClick }) => ReactNode; label: string; align?: 'start' | 'end'; children: ReactNode | ((close: () => void) => ReactNode) }`.
  - It is non-modal: no trap and no inert. The panel is `role="dialog"` with `aria-label={label}`, absolutely positioned under the trigger (CSS only).
  - It closes on Escape (focus returns to the trigger), on a `pointerdown` outside both, and when focus leaves the panel. Escape is handled by a native listener on the panel (same reason as Dialog: jsx-a11y rejects `onKeyDown` on `role="dialog"`).
- Produces: `Tabs` with `{ label: string; tabs: { id: string; label: string; panel: ReactNode }[]; value?: string; onChange?: (id) => void }`. This is the WAI-ARIA tabs pattern:
  - roving `tabIndex`;
  - ArrowLeft and ArrowRight wrap, Home and End go to the ends, and selection follows focus (automatic activation);
  - each panel is `role="tabpanel" aria-labelledby` its tab, with `tabIndex={0}`;
  - it is uncontrolled when `value` is absent.

- [ ] **Step 1: Write the failing tests:**
  - `it('toggles aria-expanded and closes on Escape with focus back on the trigger')`
  - `it('closes on an outside pointerdown')`
  - `it('moves selection with arrows and wraps')`
  - `it('only the selected tab is tabbable')`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Popover and Tabs`.

### Task 6: Pagination

**Files:**
- Create: `frontend/src/components/ui/Pagination.{tsx,css,test.tsx}`
- Create: `frontend/src/lib/pageNumbers.ts`, `frontend/src/lib/pageNumbers.test.ts` (moved from `buildPageNumbers` in `components/DashboardPagination.jsx`; DashboardPagination imports it from there)

**Interfaces:**
- Produces: `buildPageNumbers(page: number, totalPages: number): Array<number | '…'>`, with exactly today's output (it emits the `'…'` string, `DashboardPagination.jsx:96`).
- Produces: `Pagination` with `{ page: number; totalPages: number; onPageChange: (p: number) => void; label: string; disabled?: boolean }`.
  - It is a `<nav aria-label={label}>` with Previous and Next `Button`s using the lucide `ChevronLeft`/`ChevronRight` icons and visible text.
  - The current page is `aria-current="page"`.
  - It renders `null` when `totalPages <= 1`.
  - The summary text ("Showing…") stays with the caller; Pagination is only the controls.

- [ ] **Step 1: Write the failing tests:** `pageNumbers.test.ts` covers the existing outputs (copy cases by reading the current function: page 1 of 1; page 1 of 10; page 5 of 10; page 10 of 10). `Pagination.test.tsx` has `it('marks the current page')`, `it('disables Previous on the first page')` and `it('renders nothing for a single page')`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and switch `DashboardPagination.jsx` to the moved helper. Its own markup is unchanged (it migrates in part 3).
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Pagination; share buildPageNumbers`.

### Task 7: Combobox that commits explicitly (A6 primitive)

**Files:**
- Create: `frontend/src/components/ui/Combobox.{tsx,css,test.tsx}`

**Interfaces:**
- Produces: `Combobox` with `{ label: string; labelHidden?: boolean; options: { value: string; label: string; hint?: string }[]; onSelect: (value: string) => void; placeholder?: string; maxResults?: number (default 50); emptyText?: string (default 'No matches'); disabled?: boolean }`. This is the ARIA 1.2 combobox with a listbox popup:
  - The input is `role="combobox" aria-expanded aria-controls aria-autocomplete="list" aria-activedescendant`, labelled via `Field`.
  - Typing filters by case-insensitive substring on `label`. ArrowDown opens the list or moves down, ArrowUp moves up, and Home and End move to the ends.
  - **Only** Enter on an active option or a click on an option calls `onSelect`. After a select, the input clears and the list closes. Focus stays in the input, so a second item can be added at once.
  - Escape closes the list, and a second Escape clears the text.
  - Blur closes the list without selecting.
  - The options are `role="option"`, with `aria-selected` on the active one. The empty state is a non-option `<li role="presentation">`.
  - A live region (`.ui-visually-hidden`, `aria-live="polite"`) announces `"N results"` after filtering.

- [ ] **Step 1: Write the failing tests:**
  - `it('does not select while arrowing')` (the A6 regression): ArrowDown twice gives `onSelect` not called, and `aria-activedescendant` points at the second option.
  - `it('selects with Enter on the active option and clears')`: `onSelect('b')` is called, and the input value is `''`.
  - `it('selects on option click')`: use `fireEvent.mouseDown` on the option, then `click`. Implement selection on `mouseDown` with `preventDefault`, so the input doesn't blur first.
  - `it('does not select on blur or Enter with the list closed')` (Review focus 5).
  - `it('filters case-insensitively and caps results')`: 60 options give 50 rendered.
  - `it('announces the result count')`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): Combobox that only commits on Enter or click (A6)`.

### Task 8: Toaster replaces ToastContext (A12)

**Files:**
- Create: `frontend/src/components/ui/Toaster.{tsx,css}` (keep the `/* eslint-disable react-refresh/only-export-components */` header that `ToastContext.jsx` has). Move the test with `git mv src/context/ToastContext.test.jsx src/components/ui/Toaster.test.tsx` and convert it to TS. Its five existing cases stay; update its `.closest('.toast')` lookups (lines 50 and 67) to the new class and its `'Dismiss'` button name to `'Dismiss notification'`.
- Delete: `frontend/src/context/ToastContext.jsx` and the `.toast*` rules in `frontend/src/App.css` (lines 88–184, including `@keyframes toastIn`)
- Modify: every file matching `grep -rln "context/ToastContext" src` (26 files including `App.jsx` and the `vi.mock` path in `useNotifyError.test.tsx:5`) to import from `components/ui/Toaster`

**Interfaces:**
- Produces: `ToastProvider`, `useToast(): { toasts; addToast(type: 'success' | 'error' | 'info', message: string, opts?: { action?: { label: string; onClick: () => void }; ttlMs?: number | null }): string; dismiss(id: string): void }`, and `UNDO_TTL_MS = 6000`. The no-provider fallback becomes `{ toasts: [], addToast: () => '', dismiss: () => {} }`.
- Behaviour changes (A12):
  - An `error` toast defaults to `ttlMs: null`, which means it stays until dismissed. `success` and `info` keep 4000 ms.
  - Hover and focus pause, as today.
  - Two live regions are always mounted through a portal to `document.body`: `<div role="status" aria-live="polite">` for success and info, and `<div role="alert">` for errors. Each toast renders inside its region, and no toast element has its own role.
  - Dismiss is an `IconButton` "Dismiss notification" with the `X` icon.
  - A toast with the same type and message as one already showing is not added again; the existing one's timer restarts and its id is returned.
  - Maximum 4 toasts visible: when a fifth is added, the oldest non-error one is dropped, or the oldest error if all four are errors.

- [ ] **Step 1: Write the failing tests** (keep the moved file's existing four cases and add):
  - `it('keeps error toasts until dismissed')`: fake timers, then 60 s later the error is still there.
  - `it('mounts empty live regions')` (Review focus 2): with no toasts, `getByRole('status')` and `getByRole('alert')` exist and are empty.
  - `it('puts errors in the alert region and others in the status region')`.
  - `it('drops the oldest non-error toast past four')` and `it('drops the oldest error when four errors are showing')`.
  - `it('does not stack identical toasts')`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/Toaster.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**, rewrite the imports (`sed` on the grep list), and delete the old context file and its CSS. The regions' container is `position: fixed`, bottom inline-end, above `--mobile-nav-offset`, and `pointer-events: none` except on toasts.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck && npm run build`. Expected: PASS. `grep -rn "ToastContext" src` returns nothing.
- [ ] **Step 5: Commit** `feat(ui): Toaster with sticky errors and permanent live regions (A12)`.

### Task 9: AI panel on Dialog (A5)

**Files:**
- Modify: `frontend/src/features/object/AiPanel.tsx` (`RunPromptPanel`), `frontend/src/features/object/hooks/useRunPrompt.ts` (`closeRunPanel`, lines 120–123), `frontend/src/features/object/ObjectPage.css` (delete the `.run-prompt-overlay`, `-backdrop` and `-panel` positioning rules that Dialog now owns, around lines 860–880, and their media overrides at about 1444–1468; keep the inner layout classes)
- Modify: `frontend/eslint.a11y-baseline.js` (remove `src/features/object/AiPanel.tsx`)
- Test: `frontend/src/features/object/AiPanel.test.tsx` (create; follow `ObjectPage.test.tsx` render helpers, and stub `run` with the hook's shape) and the existing `frontend/src/features/object/hooks/useRunPrompt.test.tsx`

**Interfaces:**
- Consumes: `Dialog`, `ConfirmDialog` (Task 4), `Field`, `Select` (Task 2), `Button` (Task 1).
- Produces: `useRunPrompt` returns `requestCloseRunPanel(): void` in place of passing `closeRunPanel` to the UI. It closes at once when `runOutput.trim() === ''`, and otherwise sets `confirmDiscard: true`. It also returns `confirmDiscard: boolean`, `discardAndClose(): void` (calls `closeRunPanel`) and `keepEditing(): void`. `closeRunPanel` also resets `confirmDiscard`. The two save paths (`useRunPrompt.ts` around lines 211 and 240) switch from inline `setShowRunPanel(false)` to `closeRunPanel()`, so a save never leaves the confirm open.

- [ ] **Step 1: Write the failing tests:**
  - `it('is a dialog named "Run prompt on this object"')`
  - `it('closes on Escape when there is no output')`
  - `it('asks before discarding output on Escape, backdrop and Cancel')` (Review focus 3): with `runOutput: 'x'`, each path calls `requestCloseRunPanel`. With `confirmDiscard: true`, `getByRole('dialog', { name: 'Discard the AI output?' })` is shown with buttons "Keep editing" and "Discard".
  - `it('labels every field')`: `getByLabelText('Prompt')` and `getByLabelText('Output')` are textareas; `getByLabelText('Template')`, `getByLabelText('Provider')` and `getByLabelText('AI model')` are selects. All five use `Field` (forced jsx-a11y today flags `AiPanel.tsx` lines 69, 76, 121, 152, 184, 202 and 225; 184 and 202 are Provider and AI model).
  - In `hooks/useRunPrompt.test.tsx`: `requestCloseRunPanel` with empty output closes, with output sets `confirmDiscard`, and a successful save closes and clears `confirmDiscard`.
- [ ] **Step 2: Run** `npx vitest run src/features/object`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `RunPromptPanel` renders `<Dialog open title="Run prompt on this object" description={`Running against: ${objectTitle}`} onClose={run.requestCloseRunPanel}>`. Fields use `Field`.
  - The discard confirmation is `<ConfirmDialog title="Discard the AI output?" message="The generated text hasn't been saved." confirmLabel="Discard" cancelLabel="Keep editing" danger …>`.
  - Remove the hand-rolled overlay markup. The dialog uses `size="lg"` (today's panel is 720px wide).
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS. The baseline test confirms `AiPanel.tsx` is clean.
- [ ] **Step 5: Commit** `fix(object): AI panel is a real dialog and asks before discarding output (A5)`.

### Task 10: Activity drawer on Dialog (M9)

**Files:**
- Modify: `frontend/src/features/dashboard/components/DashboardView.jsx` (around lines 181–183 and 520–527), `frontend/src/pages/Dashboard.css` (delete `.dashboard-sidebar--open-mobile` at about lines 141–155, and inside the 1024–1279px block at 186–196 delete only the two `.dashboard-sidebar` rules; keep `.dashboard-layout { display: block }` there, so that range's layout doesn't change)
- Test: `frontend/src/features/dashboard/components/ActivityDrawer.test.jsx`, with a new `ActivityDrawer.jsx` beside DashboardView

**Interfaces:**
- Consumes: `Dialog` (variant `drawer`, Task 4).
- Produces: `ActivityDrawer` with `{ open: boolean; onClose: () => void; children }`.
  - At `(min-width: 1280px)` (`useMediaQuery`), it renders `<aside className="dashboard-sidebar" aria-label="Activity">{children}</aside>` and ignores `open`.
  - Below that, it renders `<Dialog variant="drawer" title="Activity" open={open} onClose={onClose}>{children}</Dialog>`.
  - The toggle button in DashboardView keeps `aria-expanded`, and adds `aria-haspopup="dialog"` below 1280px.

- [ ] **Step 1: Write the failing tests** (stub `matchMedia` per case):
  - `it('opens as a modal drawer on narrow screens')`: `getByRole('dialog', { name: 'Activity' })` is shown when `open`.
  - `it('closes on Escape')`
  - `it('stays inline on wide screens')` (Review focus 4): with `open` false, `getByRole('complementary', { name: 'Activity' })` is present, there is no dialog, and `#root` has no `inert`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and replace the `<aside>` in DashboardView with `<ActivityDrawer open={showActivityPanel} onClose={() => setShowActivityPanel(false)}>`.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(dashboard): activity panel is a real drawer below 1280px (M9)`.

### Task 11: Domain, tag and link pickers on Combobox (A6 call sites)

**Files:**
- Modify: `frontend/src/features/object/Taxonomy.tsx` (both `<select className="chip-select">`), `frontend/src/features/object/Links.tsx` (`AddLinkSelect`)
- Modify: `frontend/src/features/object/ObjectPage.css` (delete `.detail-links-add` if grep shows no other user; keep `.chip-select`, which `ObjectNew.jsx` and `ObjectForm.css` still use until part 3)
- Test: extend `frontend/src/features/object/Sidebar.test.tsx` (its `describe('Taxonomy')` at line 15 and `describe('Links')` at line 43)

**Interfaces:**
- Consumes: `Combobox` (Task 7).
- Labels:
  - The domain picker is `label="Add domain"` with `labelHidden` and placeholder "Add domain…".
  - The tag picker is "Add tag" with placeholder "Add tag…".
  - The link picker is "Link to object" with placeholder "Search objects…". Its options are `{ value: o.id, label: o.title, hint: formatObjectTypeLabel(o.type) }`, over **all** of `availableToLink`; the combobox caps the rendered list at 50.

- [ ] **Step 1: Write the failing tests:**
  - `it('adds a domain only on Enter, not on arrow')`: ArrowDown leaves `addDomain` uncalled; Enter calls it with the active id.
  - `it('adds a tag on option click')`
  - `it('can link to an object beyond the first 50')`: with 60 targets, typing the 60th title and pressing Enter calls `addLink` with its id.
- [ ] **Step 2: Run** `npx vitest run src/features/object`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(object): domain, tag and link pickers commit explicitly (A6)`.

### Finish

- [ ] Run `npx vitest run && npx eslint . && npm run typecheck && npm run build` in `frontend/`. Record the CSS byte total, `git ls-files 'frontend/src/**/*.css' | xargs cat | wc -c`, against 210,099. Part 2 may add up to about 8 KB net. If it exceeds that, trim the primitives' CSS before opening the PR.
- [ ] Open one PR for part 2. Wait for **every** check to finish (`gh pr checks <n> --watch`; the repo has no branch protection), and paste the `[axe]` lines from the e2e log next to part 1's baseline.
- [ ] After merging, update the spec's "Verified status": A5, M9 and A12 are fixed. A6 is fixed at Taxonomy and Links, while ObjectNew and EntityComboBox remain for part 3. Record the a11y baseline length.
