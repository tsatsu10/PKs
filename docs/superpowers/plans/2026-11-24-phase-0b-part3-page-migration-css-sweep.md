# Phase 0b part 3: page migration and CSS sweep, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** move every page onto the `components/ui/` primitives, delete the page CSS they replace until the total is ≤ 142,232 bytes (exit criterion 2), and fix A6 (remaining sites), A7, A10, A11, A15, M5, M6, M8, M10 and M11 on the way.

**Architecture:**
- A CSS byte budget is a CI ratchet: `frontend/css-budget.json` holds one number, `npm run check:css` fails above it, and every task ends by lowering it to the number in the budget table below. The part ends with it at 142,232.
- Strict token values arrive as a stylelint ratchet with a baseline list of files allowed to fail, the same shape as the jsx-a11y baseline. A file leaves the baseline in the task that migrates its page. The part ends with only `src/index.css` motion variables allowed and the baseline empty.
- Pages are migrated one area per task. A migration means: page root on `Page`, buttons on `Button`/`IconButton`, form controls on `Field` + `Input`/`Textarea`/`Select`, panels on `Card`, hand-rolled modals on `Dialog`, empty blocks on `EmptyState`, removable chips on `Chip`. Then the page's CSS loses every rule those primitives now own, and what remains is layout only, written with `--pks-*` tokens.
- The global legacy layer in `index.css` (`.btn*`, `.form-*`, `.empty-state`, the `--polar-*`/`--glass-*`/`--space-*`/`--radius-*`/`--input-*` variables) is deleted last, in Task 11, when nothing uses it.

**Tech stack:** React 19, TypeScript for new files, Vitest + Testing Library (`fireEvent`; `user-event` is not installed), jsdom, `lucide-react`, `@tanstack/react-virtual`, `stylelint` (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-11-16-phase-0b-ui-system-design.md` (decision 1 "0b-3", decision 2, and verified status A6, A7, A10, A11, A15, M5, M6, M8, M10, M11). The part 2 plan, `docs/superpowers/plans/2026-11-17-phase-0b-part2-primitives.md`, defines every primitive's props; read its Interfaces blocks before using one.

## Global constraints

- All part 2 constraints still hold: `ui-` class prefix and `--pks-*`-only values in `components/ui/*.css` (`src/test/uiCss.test.ts`), icons from `lucide-react` with `aria-hidden` and a numeric size of 16, 20 or 24, targets at least `--pks-size-min-target` (24px) and `--pks-size-touch-target` (44px) under `(pointer: coarse)`, `useMediaQuery` with `{ getInitialValueInEffect: false }`.
- After every task, in `frontend/`: `npx eslint .`, `npm run typecheck`, `npx vitest run --maxWorkers=4` (the default worker count fails locally with `spawn UNKNOWN`), `npm run build`, `npm run check:bundle`, `npm run check:css` and `npm run lint:css` all exit 0. Playwright runs in CI only. No Docker.
- CSS bytes are measured LF-normalised (`check-css.mjs` strips `\r`), so the number matches git blobs. Do not measure with `wc -c` on a Windows working copy.
- The budget in `css-budget.json` may only go down, except in Task 2, which adds primitives. A task that misses its number records the miss in the PR body and sets the budget to what it reached; it does not borrow by deleting comments or reformatting. Deleting a comment is fine when the code it described is gone.
- `eslint.a11y-baseline.js` and `stylelint.baseline.js` may only shrink. Both tests in `src/test/lintRules.test.ts` fail when a listed file is clean, so remove the entry in the same commit.
- No new legacy: migrated CSS uses `--pks-*` tokens, plus `--mobile-nav-offset`, `--dur-*` and `--ease-*` (motion has no pks tokens; `tokens.css` is generated and is not edited by hand).
- Legacy variable to token map, used wherever a rule survives migration:

  | Legacy | Token |
  |---|---|
  | `--polar-white`, `--input-color` | `--pks-text-primary` |
  | `--polar-muted`, `--label-color` | `--pks-text-secondary` |
  | `--polar-dim`, `--polar-faint`, `--input-placeholder` | `--pks-text-muted` |
  | `--space-black` | `--pks-bg-app` |
  | `--surface`, `--glass-bg`, `--panel-overlay*` | `--pks-surface-card` |
  | `--surface-elevated`, `--midnight` | `--pks-surface-raised` |
  | `--input-bg` | `--pks-surface-input` |
  | `--glass-border`, `--input-border` | the border recipe in `components/ui/Card.css` |
  | `--cosmic-pink`, `--input-focus-border` | `--pks-accent-primary` (focus rings: `--pks-focus-ring`) |
  | `--midnight-purple-accent` | `--pks-accent-link` |
  | `--accent-gradient`, `--accent-strong-*` | `--pks-accent-gradient-start` / `-end` |
  | `--on-accent`, `--badge-on-accent` | `--pks-text-on-accent` |
  | `--danger`, `--error-text` | `--pks-status-danger` |
  | `--danger-bg` | `--pks-status-danger-surface` |
  | `--success`, `--success-text` | `--pks-status-success` |
  | `--active-highlight-bg`, `--highlight-subtle` | `--pks-accent-selected-surface` |
  | `--hover-overlay*` | `--pks-surface-raised` |
  | `--backdrop-overlay`, `--modal-shadow` | gone with the hand-rolled modal (Dialog owns both) |
  | `--space-2/4/6/8/10/12/16/20` | `--pks-space-2/3/4/5/6/7/8/9` (4/8/12/16/20/24/32/40px) |
  | `--space-3` (6px) | `--pks-space-2` or `--pks-space-3`, whichever the layout needs |
  | `--radius-sm/md/lg/xl` | the `--pks-radius-*` with the same px value in `tokens.css` |

- Emoji and text glyphs used as controls or icons (×, ✕, ⋯, ▾, 🔔 and the like) are replaced by `lucide-react` icons in the task that migrates their file (spec decision 6). `TypeMark` stays.
- Copy does not change in this part (glossary and labels are part 4), except where a task below gives exact new text.
- One PR per task, in order. Wait for every check (`gh pr checks <n> --watch`; the repo has no branch protection), compare the `[axe]` lines in the e2e log with the previous PR's (no count may rise, in either theme), and open the Vercel preview at 375px and 1440px in both themes for the pages the task touched before merging.

## CSS budget

Measured on `main` at `58e0bcd`: 225,436 bytes. About 16 KB of that is rules whose classes no source file references; the rest has to come from migration.

| After task | Budget (bytes) | Main source of the cut |
|---|---|---|
| 1 Tooling and dead CSS | 211,000 | unreferenced rules |
| 2 Sweep primitives | 213,500 | (adds `Page`, `Chip`, `Textarea`) |
| 3 Dashboard list and shell | 209,500 | `Dashboard.css` page root, scroll box, list |
| 4 Dashboard card | 204,500 | `.object-card*` (7.0 KB), view CSS |
| 5 Dashboard chrome | 197,500 | modals, pagination, quick add, filters |
| 6 Object page | 187,500 | `ObjectPage.css` 27.2 → about 12 KB |
| 7 ObjectNew and QuickCapture | 181,000 | `ObjectForm.css` 11.9 → about 5 KB |
| 8 Templates and PromptBank | 167,500 | 28.0 → about 14 KB |
| 9 Small pages | 156,500 | nine page files 28.5 → about 16 KB |
| 10 App shell | 149,000 | `AppLayout.css`, `NotificationCenter.css`, `ShortcutsModal.css` |
| 11 Legacy layer and auth | **142,232** | `index.css` 15.9 → about 8 KB, `Auth.css` |

The estimates sum to about 140.7 KB, so the margin is about 1.5 KB. Treat a miss of more than 1 KB in any task as a signal to stop and report, not to push on.

## Review focus

1. **Card click target (A7).** After the card stops being one big link, a click anywhere on the card body still opens the object, Ctrl/⌘-click and middle-click still open a new tab, and a click on the checkbox or a LinkedBar control does neither. Covered by Task 4's `opens from the card body but not from its controls` test.
2. **Long lists after the scroll box goes (M5).** With the inner scroll box removed, a 1,000-object list must still render only a window of rows, and keyboard row navigation must still bring the active row into view. Covered by Task 3's `virtualizes against the window` test.
3. **Unsaved edits in migrated modals.** The Templates and PromptBank editors become `Dialog`s, which close on Escape and backdrop. With unsaved changes each path must ask first. Covered by Task 8's `asks before discarding edits` tests.
4. **Touch with no hover (M8, A11).** Selection checkboxes must be visible without hover on `(hover: none)`, and every chip remove button must be at least 24×24 (44 under coarse pointers). Covered by Task 4's `shows selection without hover on touch` CSS assertion and Task 2's Chip tests.
5. **Light theme after the variable swap.** Legacy variables had hand-tuned light values; tokens switch by themselves. A wrong mapping shows up as low contrast in one theme only. Covered by the per-PR `[axe]` comparison in both themes (Global constraints) and the two-theme preview check; there is no unit test for it.

---

### Task 1: Budget ratchet, stylelint baseline, dead CSS

**Files:**
- Create: `frontend/scripts/check-css.mjs`, `frontend/css-budget.json`, `frontend/stylelint.config.js`, `frontend/stylelint.baseline.js`, `frontend/scripts/gen-css-baseline.mjs`
- Modify: `frontend/package.json` (scripts `check:css`, `lint:css`; dev dependency `stylelint`), `.github/workflows/ci.yml` (frontend job: `npm run lint:css` after `npm run lint`, `npm run check:css` after `npm run check:bundle`), `frontend/src/test/lintRules.test.ts`
- Modify: every CSS file with unreferenced rules (largest: `pages/Dashboard.css` about 7.1 KB, `features/object/ObjectPage.css` about 4.9 KB, `pages/ObjectForm.css` about 1.0 KB, `index.css` about 0.9 KB)
- Modify: `docs/superpowers/specs/2026-11-16-phase-0b-ui-system-design.md` ("Verified status": A5, M9, A12 fixed in PR #22; A6 fixed at Taxonomy and Links; a11y baseline length 14)

**Interfaces:**
- Produces: `node scripts/check-css.mjs` sums the LF-normalised byte length of every `src/**/*.css`, prints the total and the ten largest files, and exits 1 when the total exceeds `maxBytes` in `css-budget.json` (`{ "maxBytes": number }`).
- Produces: `node scripts/check-css.mjs --unused` lists, per CSS file, the class selectors that appear as a whole word in no `src/**/*.{js,jsx,ts,tsx}` file (tests excluded). A class is kept when a template literal builds it: any source match of `/([A-Za-z][\w-]*-)\$\{/` whose captured prefix starts the class name. Classes in the `allow` array of `css-budget.json` are skipped. It exits 0; it is a report. With `--json` it prints `[{ file, classes }]` and nothing else.
- Produces: `stylelint.config.js` with `color-no-hex: true`, `function-disallowed-list: ['rgb','rgba','hsl','hsla']` and `declaration-property-value-disallowed-list: { '/.*/': ['/var\\(--(?!pks-|mobile-nav-offset|dur-|ease-)/'] }`; `ignoreFiles: ['src/styles/tokens.css', 'dist/**']`; one `overrides` entry that sets those three rules to `null` for the files in `cssBaseline`.
- Produces: `stylelint.baseline.js` exporting `cssBaseline: string[]` (paths relative to `frontend/`), written by `scripts/gen-css-baseline.mjs` the way `scripts/gen-a11y-baseline.mjs` writes its list.

- [ ] **Step 1: Write the failing tests** in `src/test/lintRules.test.ts`:
  - `it('keeps the CSS total within budget')`: run `check-css.mjs` with `execFileSync`; it exits 0.
  - `it('lists only CSS files that still break the token rules')`: for each `cssBaseline` entry, stylelint with the three rules forced reports at least one warning; the failure message is `` `${rel} is clean now: remove it from stylelint.baseline.js` `` (mirror the jsx-a11y block at line 81).
  - `it('has no unreferenced classes outside the allowlist')`: `check-css.mjs --unused --json` returns an empty list.
- [ ] **Step 2: Run** `npx vitest run src/test/lintRules.test.ts --maxWorkers=4`. Expected: FAIL (script missing).
- [ ] **Step 3: Implement** the scripts and config, set `maxBytes` to 225,436, and generate the baseline.
- [ ] **Step 4: Delete the dead rules.** Run `--unused`. For each reported class, `grep -rn "<class>" src e2e` once more by hand (tests and e2e selectors count as users), then delete every rule whose selectors all contain a reported class, and drop the class from mixed selector lists. A class that is used but built in a way the script can't see goes in an `allow` array in `css-budget.json` with a one-line reason.
- [ ] **Step 5: Run** the full check list from Global constraints. Expected: exit 0, total ≤ 211,000. Set `maxBytes` to 211,000.
- [ ] **Step 6: Commit** `chore(css): byte budget and token-value ratchets; delete unreferenced rules`.

### Task 2: Sweep primitives and the primitive-level review minors

**Files:**
- Create: `frontend/src/components/ui/{Page,Chip}.{tsx,css,test.tsx}`
- Modify: `frontend/src/components/ui/Input.{tsx,css,test.tsx}` (add `Textarea`), `Toaster.tsx`, `ConfirmDialog.tsx`, `Dialog.tsx`, `Button.tsx` and their tests

**Interfaces:**
- Produces: `Page` with `{ title: string; titleHidden?: boolean; actions?: ReactNode; width?: 'narrow' | 'default' | 'wide' (max-width 720 / 1080 / 1440px, default 'default'); children }`. It renders `<div className="ui-page">` with a header holding `<h1 className="ui-page-title" tabIndex={-1}>` and `actions`, then the children. It sets no `min-height` and no outer padding below 768px (AppLayout's main already pads there; this is the M5 double-padding fix). `titleHidden` applies `.ui-visually-hidden`.
- Produces: `Chip` with `{ children: string; onRemove?: () => void; removeLabel?: string; tone?: 'neutral' | 'accent'; href?: string }`. With `onRemove` it renders a `<button aria-label={removeLabel ?? `Remove ${children}`}>` with the lucide `X` at size 16, whose box is at least 24×24 and 44×44 under `(pointer: coarse)` (A11). With `href` the text is a router `Link`.
- Produces: `Textarea` exported from `Input.tsx`: `TextareaHTMLAttributes` plus `invalid?: boolean`, forwarded ref, same sizing and font rules as `Input`.
- Changes (deferred from the part 2 review, PR #22; the expected behaviour below is this plan's reading of each one-line finding, so read the code first and say so in the PR if a reading is wrong):
  - Toaster: a duplicate of a toast that is currently paused (hovered or focused) does not restart its timer.
  - ConfirmDialog: `message` is the dialog's `aria-describedby` target.
  - Dialog: the Tab trap skips focusables inside `[hidden]` or `[inert]` ancestors.
  - Button: while `loading`, the accessible name is still the children text only (the spinner inside a button is `aria-hidden`; `aria-busy` carries the state).

- [ ] **Step 1: Write the failing tests:**
  - `Page.test.tsx`: `it('renders one h1 with the title')`, `it('keeps a hidden title in the accessibility tree')`, `it('renders actions beside the title')`.
  - `Chip.test.tsx`: `it('names the remove button after the chip')` (`getByRole('button', { name: 'Remove Research' })`), `it('has no button without onRemove')`, `it('links when given href')`.
  - `uiCss.test.ts`, `it('gives chip remove a 24px minimum box')`: `Chip.css` contains `min-width: var(--pks-size-min-target)` and `min-height: var(--pks-size-min-target)` on `.ui-chip-remove`, and `--pks-size-touch-target` inside a `(pointer: coarse)` block.
  - `Input.test.tsx`, `it('Textarea marks invalid and forwards its ref')`.
  - `Toaster.test.tsx`, `it('does not restart a paused toast on a duplicate')`: hover, add the duplicate, leave nothing else; after 60 s of fake time the toast is still shown; after mouse leave plus 4 s it is gone.
  - `ConfirmDialog.test.tsx`, `it('describes the dialog with its message')`.
  - `Dialog.test.tsx`, `it('skips hidden content in the Tab trap')`: a button inside a `hidden` div is never focused by Tab or Shift+Tab.
  - `Button.test.tsx`, `it('keeps its name while loading')`: `getByRole('button', { name: 'Save' })` with `loading`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui src/test/uiCss.test.ts --maxWorkers=4`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (it must be ≤ 213,500).
- [ ] **Step 5: Commit** `feat(ui): Page, Chip, Textarea; fix toast, confirm, tab-trap and loading-name minors`.

### Task 3: Dashboard list and shell (A10, M5)

**Files:**
- Modify: `frontend/src/features/dashboard/hooks/useDashboardPage.js` (the `useVirtualizer` call at line 122), `frontend/src/features/dashboard/components/DashboardView.jsx` (list container at line 406), `frontend/src/pages/Dashboard.css`, `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/features/dashboard/components/DashboardView.test.jsx` (create if absent; follow the render helpers the other dashboard tests use)

**Interfaces:**
- Consumes: `Page` (Task 2).
- Produces: the dashboard list scrolls with the window. `useDashboardPage` uses `useWindowVirtualizer` with `scrollMargin` set to the list element's `offsetTop`, and each virtual row's transform subtracts `scrollMargin`. The inline `maxHeight: 'calc(100vh - 280px)'` and `overflow: 'auto'` are removed, and so is `max-height: min(70vh, calc(100vh - 320px))` at `Dashboard.css:22`.
- Produces: every rendered object row, in all three view modes, is `role="listitem"` with `aria-setsize={total count of objects matching the filters}` and `aria-posinset={index + 1}` (1-based, over the whole result, not the rendered window). In card view the item is the card, not the virtual row of cards.

- [ ] **Step 1: Write the failing tests:**
  - `it('virtualizes against the window')` (Review focus 2): with 1,000 objects, fewer than 100 `listitem`s are rendered, and the list container has no inline `max-height`.
  - `it('scrolls the active row into view')`: moving the keyboard cursor to row 500 calls the virtualizer's `scrollToIndex` with 499 (spy on `window.scrollTo` if the virtualizer is not exposed).
  - `it('gives each row its position in the whole result')`: the first rendered item has `aria-posinset="1"` and `aria-setsize="1000"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Wrap the dashboard in `<Page title="Dashboard" titleHidden width="wide">` (the visible hero stays as it is; the copy change to "Home" is part 4). Delete `min-height: 100vh` (`Dashboard.css:34`) and the page-root padding that `Page` now owns, and the scroll-box rules. Convert what remains of the page-root and list rules to tokens.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 209,500).
- [ ] **Step 5: Commit** `fix(dashboard): list scrolls with the page and rows carry set position (A10, M5)`.

### Task 4: Dashboard card (A7, M8, A15)

**Files:**
- Modify: `frontend/src/features/dashboard/components/DashboardObjectCard.jsx`, `Views/{StreamView,TableView,LinkedBar}.{jsx,css}`, `frontend/src/pages/Dashboard.css` (`.object-card*`, about 7.0 KB; the `opacity: 0` rules at lines 649 and 797)
- Modify: `frontend/eslint.a11y-baseline.js` (remove `DashboardObjectCard.jsx`), `frontend/stylelint.baseline.js` (remove `StreamView.css`, `TableView.css`, `LinkedBar.css`)
- Test: `frontend/src/features/dashboard/components/DashboardObjectCard.test.jsx`

**Interfaces:**
- Consumes: `Badge`, `Chip`.
- Produces: the card is an `<article className="object-card">`. Only the title is a `<Link>`; its `::after` covers the card (`position: absolute; inset: 0`), so the whole body is one link target without nesting. The selection checkbox and LinkedBar are siblings of the link with `position: relative; z-index: 1`, so they sit above the stretched link.
- Produces: selection checkboxes (card, stream and table views) are fully visible when selected, on `:focus-visible`, when any item is selected, and always under `@media (hover: none)`. The hover-only `opacity: 0` applies only inside `@media (hover: hover)`.
- Produces: due state is a `Badge` with text, not colour alone: overdue is `<Badge tone="danger" icon={AlertCircle}>Overdue</Badge>` before the date, and due within 3 days is `<Badge tone="warning" icon={Clock}>Due soon</Badge>`. Read the existing day thresholds from `DashboardObjectCard.jsx:30` and keep them.

- [ ] **Step 1: Write the failing tests:**
  - `it('opens from the card body but not from its controls')` (Review focus 1): the card contains exactly one link whose accessible name is the title and whose `href` is `/objects/<id>`; the checkbox and every LinkedBar control are not descendants of any `a`.
  - `it('toggles selection without navigating')`: clicking the checkbox calls the selection handler and the router location is unchanged.
  - `it('says overdue in words')`: an object due yesterday renders the text "Overdue".
  - `it('shows selection without hover on touch')` (Review focus 4), a CSS assertion in `src/test/lintRules.test.ts`: in `Dashboard.css`, `StreamView.css` and `TableView.css`, every `opacity: 0` on a selection checkbox selector sits inside an `@media (hover: hover)` block.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, deleting the card CSS that `Badge` and `Chip` replace and converting the rest to tokens.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 204,500).
- [ ] **Step 5: Commit** `fix(dashboard): card is an article with one link; selection visible on touch; due state in words (A7, M8, A15)`.

### Task 5: Dashboard chrome (M11, drawer minor)

**Files:**
- Modify: `frontend/src/features/dashboard/components/{DashboardModals,DashboardView,ActivityDrawer}.jsx`, `Toolbar/*`, `Hero/*`, `Empty/*`, `Selection/*`, `Sidebar/*` and their CSS; `frontend/src/components/{DashboardPagination,DashboardFilterPanel,DashboardQuickAddForm}.jsx`; `frontend/src/pages/Dashboard.css`
- Delete: `frontend/src/features/dashboard/primitives/HotkeyHint.jsx`
- Modify: `frontend/stylelint.baseline.js` (remove `pages/Dashboard.css` and every `features/dashboard/**` file)

**Interfaces:**
- Consumes: `Dialog`, `ConfirmDialog`, `Pagination`, `Button`, `IconButton`, `Field`, `Input`, `Select`, `EmptyState`, `Kbd`, `Popover`.
- Produces: every modal in `DashboardModals.jsx` is a `Dialog` (confirmations are `ConfirmDialog`); `.dashboard-modal*` is deleted.
- Produces: `DashboardPagination` renders `<Pagination label="Objects pages" …>` and keeps only its "Showing…" summary and page-size select.
- Produces: `DashboardFilterPanel` opens in a `Popover` at 768px and wider and a `Dialog variant="drawer"` below, with label/title "Filters".
- Produces: keyboard hints use `Kbd`, which renders nothing on touch (M11): `HotkeyHint` call sites become `<Kbd keys={['alt','1']} />` and so on, the "or press /" span becomes `<Kbd keys={['/']} />`, and `CommandBar.jsx:60` becomes `<Kbd keys={['mod','K']} />`. Add `'alt'` to `Kbd`'s key map (⌥ on Apple platforms, "Alt" elsewhere). The quick-add `aria-label` loses "(or press /)" and gains `aria-keyshortcuts="/"`.
- Produces (review minor): when the viewport crosses to 1280px or wider, `ActivityDrawer` calls `onClose()`, so narrowing again does not reopen the drawer.

- [ ] **Step 1: Write the failing tests:**
  - `DashboardModals.test.jsx`, `it('opens each modal as a labelled dialog and closes on Escape')` (one case per modal the file defines).
  - `DashboardPagination.test.jsx`, `it('marks the current page')`: `aria-current="page"` on the current page button inside `navigation` named "Objects pages".
  - `Kbd.test.tsx`, `it('maps alt per platform')`.
  - `DashboardView.test.jsx`, `it('shows no keyboard hints on touch')`: with `(pointer: coarse)` matching, no `kbd` element is rendered.
  - `ActivityDrawer.test.jsx`, `it('closes when the screen becomes wide')`: open narrow, flip the `matchMedia` stub to wide, `onClose` was called once.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then delete from `Dashboard.css` everything the primitives now own (`.dashboard-modal*`, `.dashboard-pagination*`, `.dashboard-quick*` control styles, `.filter-panel*` chrome, button and input look-alikes) and convert the remainder to tokens.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 197,500). `Dashboard.css` should be about 16 KB or less.
- [ ] **Step 5: Commit** `refactor(dashboard): modals, pagination, filters and hints on primitives (M11)`.

### Task 6: Object page (M6, A11, two review minors)

**Files:**
- Modify: `frontend/src/features/object/{ObjectPage,Header,InPlaceFields,LinkSearch,Links,Taxonomy,Properties,Attachments,History,SharePanel,ExportPanel,MetaLine,AiPanel}.tsx`, `hooks/useRunPrompt.ts`, `ObjectPage.css`
- Modify: `frontend/eslint.a11y-baseline.js` (remove `LinkSearch.tsx`; remove `InPlaceFields.tsx` and `ObjectPage.tsx` only if they come out clean, their remaining items are part 4), `frontend/stylelint.baseline.js` (remove `ObjectPage.css`)
- Test: the existing `ObjectPage.test.tsx`, `Sidebar.test.tsx`, `AiPanel.test.tsx`, `hooks/useRunPrompt.test.tsx`

**Interfaces:**
- Consumes: `Page`, `Card`, `Chip`, `Button`, `IconButton`, `Field`, `Input`, `Textarea`, `Select`, `Popover`, `Badge`.
- Produces: each sidebar panel (Taxonomy, Links, Properties, Attachments, History, Share, Export) is a `<Card as="section" title=…>`; `.detail-section*`, `.share-panel*`, `.export-panel*` and `.version-history*` chrome is deleted.
- Produces: domain and tag chips are `Chip` with `removeLabel` `Remove domain <name>` / `Remove tag <name>`; `.chip-remove` (`ObjectPage.css:517`) is deleted.
- Produces: `LinkSearch` stops being a fake listbox (it keeps its own inline dropdown, not a `Popover`): the results container is a `<ul aria-label="Search results">` of `<li>`s (title link, type, and a `Button size="sm"` "Link" or the text "Linked"), and the input is a `Field` + `Input type="search"` with `aria-controls` pointing at the list. No `role="listbox"`.
- Produces (M6): below 768px the object header is not sticky and its actions collapse into one `IconButton` "More actions" (`MoreHorizontal`) that opens a `Popover` with the same actions as full-width buttons. At 768px and wider it stays sticky as today.
- Produces (review minor): `requestCloseRunPanel` also sets `confirmDiscard` while `generatingAI` is true. The confirm then reads title "Stop generating?", message "The response in progress will be lost.", buttons "Keep waiting" and "Stop and close".
- Produces (review minor): the domain and tag `Combobox`es stay mounted when no options remain, `disabled` with placeholder "All domains added" / "All tags added", so focus is not dropped after adding the last one.

- [ ] **Step 1: Write the failing tests:**
  - `ObjectPage.test.tsx`, `it('collapses header actions into a menu on narrow screens')`: with `(min-width: 768px)` not matching, `getByRole('button', { name: 'More actions' })` exists and the individual action buttons appear only after it is clicked.
  - `Sidebar.test.tsx`, `it('names each chip remove after its item')` and `it('keeps the picker mounted after the last option is added')` (the combobox is still in the document and disabled).
  - `Sidebar.test.tsx`, `it('lists link search results without a listbox')`: `queryByRole('listbox')` is null and `getByRole('list', { name: 'Search results' })` holds the results.
  - `useRunPrompt.test.tsx`, `it('asks before closing mid-generation')`; `AiPanel.test.tsx`, `it('offers to stop generating')` (dialog named "Stop generating?").
- [ ] **Step 2: Run** `npx vitest run src/features/object --maxWorkers=4`. Expected: FAIL.
- [ ] **Step 3: Implement**, then cut `ObjectPage.css`: `min-height: 100vh` at line 2, the panel chrome above, button and input look-alikes, and the `.run-prompt*` inner rules that `Field` and `Dialog`'s footer now cover (4.9 KB today). Convert the remainder to tokens.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 187,500).
- [ ] **Step 5: Commit** `refactor(object): page on primitives; header menu on mobile; chips with real targets (M6, A11)`.

### Task 7: ObjectNew and QuickCapture (A6 remainder, M10, A11)

**Files:**
- Modify: `frontend/src/pages/ObjectNew.jsx`, `frontend/src/pages/QuickCapture.jsx`, `frontend/src/pages/ObjectForm.css`, `frontend/src/components/OptionsInput.jsx`
- Delete: `frontend/src/components/EntityComboBox.{jsx,css}` after moving its callers to `Combobox`
- Modify: both baselines (remove `ObjectNew.jsx`, `QuickCapture.jsx`, `ObjectForm.css`, `EntityComboBox.css`)
- Test: `frontend/src/pages/ObjectNew.test.jsx`, `QuickCapture.test.jsx`

**Interfaces:**
- Consumes: `Page`, `Combobox`, `Chip`, `Field`, `Input`, `Textarea`, `Select`, `Button`.
- Produces: the domain and tag selects in `ObjectNew.jsx` (lines 505 and 527) and every `EntityComboBox` caller use `Combobox` with the labels from part 2 Task 11 ("Add domain", "Add tag"); nothing commits on change. `.chip-select` is deleted from both CSS files.
- Produces (M10): the BlockNote wrapper's `min-height: 420px` (`ObjectForm.css:305`) applies only at 768px and wider; below, it is `12rem`. The form's actions (`Cancel`, submit) render once at the end of the form in a bar that is `position: sticky; bottom: var(--mobile-nav-offset)` below 768px. The header submit button stays at 768px and wider only, so there is one submit button in the accessibility tree at any width (render it by `useMediaQuery`, not by CSS hiding).

- [ ] **Step 1: Write the failing tests:**
  - `it('adds a domain only on Enter')`: ArrowDown does not add; Enter adds the active option.
  - `it('has exactly one submit button at each width')`: with the 768px query matching and not matching, `getAllByRole('button', { name: /create/i })` has length 1.
  - `it('puts the submit bar after the properties on narrow screens')`: the submit button follows the last property field in document order.
  - `it('names chip removes')`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then cut `ObjectForm.css` to layout only (the `.notion-*` and `.object-form*` control look-alikes go; `.btn-ghost` at 341 bytes goes with `Button variant="ghost"`).
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 181,000).
- [ ] **Step 5: Commit** `fix(object-new): pickers commit explicitly; submit reachable on mobile (A6, M10, A11)`.

### Task 8: Templates and PromptBank (A7, A11)

**Files:**
- Modify: `frontend/src/pages/{Templates,PromptBank}.{jsx,css}`
- Modify: both baselines (remove the four files)
- Test: `frontend/src/pages/Templates.test.jsx`, `PromptBank.test.jsx` (create; mock the data hooks the way `Trash.test.jsx` does)

**Interfaces:**
- Consumes: `Page`, `Card`, `Dialog`, `ConfirmDialog`, `Chip`, `Field`, `Input`, `Textarea`, `Select`, `Button`, `IconButton`, `EmptyState`.
- Produces (A7): list rows (`PromptBank.jsx:286`, `Templates.jsx:346`) are `<li>`s holding a `<button className="…-row-main">` that selects the row (name, description) and, beside it, the row's action buttons as siblings. No `role="button"` on a `div`, and no button inside a button.
- Produces: both editors that are hand-rolled modals become `<Dialog size="lg">`. Closing with unsaved changes (a dirty flag: any field differs from the values at open) opens `<ConfirmDialog title="Discard your changes?" message="Your edits haven't been saved." confirmLabel="Discard" cancelLabel="Keep editing" danger>`. Delete confirmations use `ConfirmDialog` too.
- Produces: prompt tags are `Chip`s; `.prompt-bank-editor-tag-remove` is deleted.

- [ ] **Step 1: Write the failing tests** (each page):
  - `it('has no nested interactive rows')`: no element with `role="button"` contains a `button`, and no `button` contains a `button`.
  - `it('selects a row from its main button and runs actions from their own')`.
  - `it('asks before discarding edits')` (Review focus 3): type in the name field, press Escape: the dialog "Discard your changes?" is shown and the editor is still open. "Keep editing" returns to the editor with the typed text; "Discard" closes it.
  - `it('closes at once when nothing changed')`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then cut both CSS files to layout only: `.templates-modal*`, `.templates-field*` control styles (3.0 KB), `.templates-card*` chrome, `.templates-empty*`, `.templates-loading*`, and the matching `.prompt-bank-*` groups.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 167,500).
- [ ] **Step 5: Commit** `refactor(templates,prompts): rows without nested controls; editors on Dialog (A7, A11)`.

### Task 9: Small pages (A10, A15, M5)

**Files:**
- Modify: `frontend/src/pages/{Settings,Search,Journal,PasteBin,Trash,Import,Integrations,AuditLogs,Notifications}.{jsx,css}`
- Modify: both baselines (remove `Search.jsx`, `PasteBin.jsx` and the nine CSS files)
- Test: the existing page tests, plus new `Search.test.jsx`, `Settings.test.jsx`, `PasteBin.test.jsx` where absent

**Interfaces:**
- Consumes: `Page`, `Card`, `Tabs`, `Field`, `Input`, `Select`, `Button`, `EmptyState`, `Pagination`, `ConfirmDialog`, `Badge`.
- Produces: every page root is `Page` with its current visible heading text as `title`; every `min-height: 100vh` page-root rule is deleted (M5).
- Produces (Search, A10 and M5): the same change as Task 3: `useWindowVirtualizer`, no inline `maxHeight`, and each result `role="listitem"` with `aria-setsize` and `aria-posinset`.
- Produces (Settings, A15): the theme picker buttons are `Button`s with `aria-pressed={theme === value}`; the pressed one is `variant="primary"`. Settings sections are `Card as="section"`. The Settings split and copy are part 4.
- Produces (PasteBin, A15): the selected paste's row button has `aria-current="true"`.
- Journal's calendar grid roles are part 4 (A9); here it only moves to `Page`, `Button` and tokens.

- [ ] **Step 1: Write the failing tests:**
  - `Search.test.jsx`, `it('gives each result its position')` and `it('has no inner scroll box')`.
  - `Settings.test.jsx`, `it('marks the active theme as pressed')`: exactly one of the three theme buttons has `aria-pressed="true"`, and it changes on click.
  - `PasteBin.test.jsx`, `it('marks the selected paste as current')`.
  - `src/test/lintRules.test.ts`, `it('has no full-viewport page roots')`: no file under `src/pages` or `src/features` contains `min-height: 100vh`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** page by page, one commit per page is fine. Each page's CSS keeps layout rules only.
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 156,500).
- [ ] **Step 5: Commit** `refactor(pages): small pages on Page and primitives (A10, A15, M5)`.

### Task 10: App shell (M5, M11)

**Files:**
- Modify: `frontend/src/components/{AppLayout,NotificationCenter,ShortcutsModal,Breadcrumbs,LoadingScreen,QueryError,OfflineBanner}.{jsx,tsx,css}`, `frontend/src/App.css`, `frontend/src/components/{CommandPalette,TypeMark,BlockNoteEditor}.css` (tokens only)
- Modify: both baselines (remove `ShortcutsModal.jsx` and every CSS file touched; `AppLayout.jsx` and `CommandPalette.jsx` stay listed, their items are A9 and A13 in part 4)
- Test: `NotificationCenter.test.jsx`, new `ShortcutsModal.test.jsx`, `AppLayout.test.jsx`

**Interfaces:**
- Consumes: `Dialog`, `Popover`, `IconButton`, `Kbd`, `Spinner`, `Badge`.
- Produces: `ShortcutsModal` is a `<Dialog title="Keyboard shortcuts">` whose rows use `Kbd`; `ShortcutsModal.css` keeps only the two-column row layout.
- Produces: `NotificationCenter` is a `Popover` (label "Notifications") anchored to an `IconButton` with the lucide `Bell`; the unread count is a `Badge` whose text is the number, and the button's label is `Notifications, <n> unread` when n > 0. `.notification-panel*` (2.4 KB) and `.btn-mark*` are deleted.
- Produces (M11): the two hard-coded `⌘K` strings in `AppLayout.jsx` (lines 159 and 203) become `<Kbd keys={['mod','K']} />` and a title built from `modKey`.
- Produces (M5): `.app-layout-main` is the only source of page padding below 768px (it already sets `padding: 1rem` and the bottom-nav offset at `AppLayout.css:533`); this task verifies no migrated page adds its own and converts `AppLayout.css` to tokens.

- [ ] **Step 1: Write the failing tests:**
  - `it('opens shortcuts as a dialog and closes on Escape')`.
  - `it('announces the unread count in the bell label')`: with 3 unread, `getByRole('button', { name: 'Notifications, 3 unread' })`.
  - `it('closes the notifications popover on Escape with focus back on the bell')`.
  - `it('shows the platform modifier in the command hint')`: stub the platform so `modKey` is "Ctrl"; the text "Ctrl" is shown and "⌘" is not.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full check list. Set `maxBytes` to the measured total (≤ 149,000).
- [ ] **Step 5: Commit** `refactor(shell): shortcuts on Dialog, notifications on Popover, platform key hints (M11)`.

### Task 11: Legacy layer, auth, final budget

**Files:**
- Modify: `frontend/src/index.css`, `frontend/src/pages/Auth.css`, `frontend/src/components/auth/*`, any file `grep` still finds using a legacy class or variable
- Modify: `frontend/stylelint.baseline.js` (ends as `[]`), `frontend/css-budget.json` (`maxBytes: 142232`)
- Modify: `docs/superpowers/specs/2026-11-16-phase-0b-ui-system-design.md` (verified status for every item this part closed, and the final CSS number)

**Interfaces:**
- Produces: `index.css` holds only the reset, base element styles, `.skip-link`, `.sr-only`, the reduced-motion block, `--mobile-nav-offset`, and the motion variables (`--dur-*`, `--ease-*`). Deleted: `.btn*`, `.form*`, `.field-error`, `.field-hint`, `.empty-state*`, `.page-section*`, the breadcrumbs rules (moved to tokens beside `Breadcrumbs.jsx` if still needed), and both legacy variable blocks (`:root, [data-theme="dark"]` and `[data-theme="light"]`, about 4.8 KB) except the lines named above. `color-scheme` stays per theme.
- Produces: `Auth.css` uses tokens only; its private `:root` and `[data-theme='light']` variable blocks are replaced by tokens. The auth pages' look, redesigned in PR #21, does not change: no markup moves to `Button`/`Input` here unless the rendered result is identical.

- [ ] **Step 1: Write the failing tests** in `src/test/lintRules.test.ts`:
  - `it('has an empty CSS baseline')`: `cssBaseline` has length 0.
  - `it('uses no legacy button or form classes')`: no `src/**/*.{jsx,tsx}` file outside tests has a `className` containing the whole word `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `form-control`, `form-group`, `form-label` or `empty-state`.
  - `it('meets the phase CSS target')`: `css-budget.json` `maxBytes` is ≤ 142,232.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Migrate any straggler call sites first (`grep -rnE "\bbtn\b|form-control|empty-state" src`), then delete the layer.
- [ ] **Step 4: Run** the full check list. Expected: exit 0 with the total ≤ 142,232. If it is above, stop and report the number and the ten largest files; do not lower quality to reach it.
- [ ] **Step 5: Commit** `refactor(css): remove the legacy variable and class layer; CSS at the −35% target`.

### Finish

- [ ] The CI `check:css` step now enforces 142,232 (spec decision 1: "A CSS-size check in CI fails above the target once the part ends").
- [ ] Record in the last PR body: the final byte total, the a11y baseline length, and the `[axe]` table against part 2's.
- [ ] Items left for part 4, so nobody looks for them here: A8, A9, A13, A14, U2, U3, U4, U8, U11, U14, and the remaining a11y baseline entries.
