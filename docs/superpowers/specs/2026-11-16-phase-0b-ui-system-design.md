# Phase 0b: UI system and accessibility, design

**Source:** roadmap `docs/plans/2026-09-26-ultimate-knowledge-base-roadmap.md` ("Phase 0b"), audit rows in `docs/plans/2026-09-26-codebase-audit.md` (A5–A15, M5–M11, U2–U14, S14, P6).
**Status of every item re-verified against `main` at 9990354 on 2026-11-16.** The audit's file:line references predate the 0a split; the current locations are below.

## Exit criteria (roadmap, unchanged)

1. axe shows 0 serious or critical violations on the smoke routes, in both themes.
2. CSS total at least 35% smaller than the start of −1A.
3. Lint is clean with jsx-a11y.

Baselines, measured 2026-11-16 (git blob bytes, LF):

| | Start of −1A (`96f1451`) | Now | Target (−35%) |
|---|---|---|---|
| CSS bytes (`frontend/src/**/*.css`) | 218,818 | 210,099 (−4%) | **≤ 142,232** |
| CSS lines | 10,858 | 10,408 | ≤ 7,058 |

The CSS target is the largest piece of work in the phase: about 68 KB more must go. The biggest files are `pages/Dashboard.css` (1,741 lines), `features/object/ObjectPage.css` (1,624), `pages/Templates.css` (813), `index.css` (627), `AppLayout.css` (598), `ObjectForm.css` (597), `PromptBank.css` (597). Primitives that own their styles are what make the cut possible, so the sweep happens as each page migrates (part 3), not as a separate pass.

## Verified status (2026-11-16)

None of the 26 items was fully fixed on 2026-11-16. "Partly" means the item is partly fixed. **Update 2026-11-24 (after part 2, PR #22):** A5, A12 and M9 are fixed; A6 is fixed at Taxonomy and Links (ObjectNew and EntityComboBox remain for part 3). The jsx-a11y baseline has 14 files. CSS is 225,436 bytes before part 3. **Update 2026-11-24 (after part 3, branch `phase-0b-part3-migration`):** A6, A7, A10, A11, A15, M5, M6, M8, M10 and M11 are fixed. CSS is 152,373 bytes, 30.4% below the start of −1A; exit criterion 2 (−35%, ≤ 142,232) is **not met**, by 10,141 bytes. The legacy variable and class layer in `index.css` is gone, every stylesheet passes the token-value stylelint rules with an empty baseline, and CI enforces the byte budget (`css-budget.json`). The jsx-a11y baseline has 5 files left for part 4 (AppLayout, CommandPalette, DashboardCommandPalette, InPlaceFields, ObjectPage).

**Accessibility**
- A5 **Fixed in part 2.** Was: `features/object/AiPanel.tsx:69-77` has dialog roles but no Escape and no focus trap. A backdrop click or Cancel clears the AI output (`hooks/useRunPrompt.ts:120-123`). The "Template", "Prompt" and "Output" labels are not tied to their controls.
- A6 **Partly (Taxonomy and Links fixed in part 2).** Was: the add-domain, add-tag and add-link selects commit on change (`Taxonomy.tsx:40,79`, `Links.tsx:24`, `pages/ObjectNew.jsx:505,527`). `components/EntityComboBox.jsx:30-40` also commits on change.
- A7 Open: the card body is a `<Link>` containing a checkbox and LinkedBar's links/button (`components/DashboardObjectCard.jsx:68-146`). PromptBank has a `div role=button` around three buttons (`pages/PromptBank.jsx:284-342`).
- A8 Open: no `document.title` is set anywhere, focus doesn't move on route change, and ObjectNew, Journal, PasteBin and the auth pages have no h1. The object page has an h1 only in read mode.
- A9 Partly: CommandPalette options are fixed. Still open: the CommandBar radiogroup with `aria-pressed` (`CommandBar.jsx:65,72`), no `aria-activedescendant` in either palette, and the Journal grid with no rows (`Journal.jsx:197-216`).
- A10 Open: no `aria-setsize`/`aria-posinset` (`DashboardView.jsx:401-498`, `Search.jsx:159-172`).
- A11 Open: `.chip-remove` is about 15×18 px (`ObjectPage.css:514`, `ObjectForm.css:449`, `.prompt-bank-editor-tag-remove`).
- A12 **Fixed in part 2.** Was: toasts pause on hover/focus (PR #15), but error toasts still expire after 4 s. Every toast is both `role=alert` and `aria-live=polite` (`context/ToastContext.jsx:84-85`).
- A13 Open: Remove/Restore labels are unscoped (`Links.tsx:77,92`, `Attachments.tsx:33`, `Trash.jsx:106`, `History.tsx:42`, `Integrations.jsx:219`). ⌘K is hard-coded (`CommandBar.jsx:60`, `AppLayout.jsx:159,203`) while `keyboardMap.js:2 modKey` sits unused. The card's aria-label omits status, due date and summary.
- A14 Open: Settings domain/tag inputs are placeholder-only (`Settings.jsx:573,635`). Import radios and webhook checkboxes have no fieldset. The integration toggle's label is "On"/"Off".
- A15 Open: overdue vs soon is shown by colour only (`Dashboard.css:1139`). The theme picker has no `aria-pressed` (`Settings.jsx:508`). The selected paste has no `aria-current` (`PasteBin.jsx:150`).

**Mobile**
- M5 Open: padding is doubled (`AppLayout.css:533` + page roots), `min-height:100vh` on page roots, nested scroll boxes `calc(100vh-280px)` (`DashboardView.jsx:401`) and `calc(100vh-260px)` (`Search.jsx:159`).
- M6 Open: the sticky object header (`ObjectPage.css:120-128`) wraps to about 200 px on mobile.
- M8 Open: selection checkboxes have `opacity:0` until hover (`TableView.css:17`, `StreamView.css:53`, `Dashboard.css:1023`).
- M9 **Fixed in part 2.** Was: the activity drawer is a plain `<aside>` (`DashboardView.jsx:520-527`).
- M10 Open: ObjectNew's editor min-height is 520 px or more with properties after it, and submit is only in the header.
- M11 Open: "press /", ⌥1–3 `HotkeyHint` and ⌘K show on touch. `.hotkey-hint` has no CSS.

**Copy**
- U2 Open: "Start your rhythm / tend what matters", "Spark", "Synthesize", "Stakeholder", "Soft-deleted", raw "v3", "Comfy", "Field key", and the "server … key" copy (exact locations are in the part 4 plan).
- U3 Open: Dashboard vs Home (bottom nav), Notifications vs Alerts, Prompts vs Prompt Bank, object/note/entry, Delete vs Move to Trash, "More filters" vs "Filters" vs "+ Filter".
- U4 Partly: `formatObjectTypeLabel` exists (lowercase), but status, relationship, audit entity/action and integration type are raw.
- U8 Partly: load errors are inline per card. Action errors still go to one top banner (`ObjectPage.tsx:99-105,154`).
- U11 Open: there is no shared formatter. About 30 call sites use `toLocaleString`/`toLocaleDateString` with five option shapes, there are three relative-time copies, and raw ISO appears in the Journal breadcrumb.
- U14 Open: `pages/Settings.jsx` (665 lines) separates Domains (:569) and Tags (:632), says "contact support" (:403), and has no account deletion.

**Security and PWA**
- S14 Open: `connect-src https://*.supabase.co wss://*.supabase.co` (`vercel.json`).
- Fonts: Google Fonts via `index.html:8-11`. `'unsafe-hashes'` exists only for the preload `onload` handler. Workbox caches the font hosts.
- The inline theme script is at `index.html:14-24` (hash-allowed). `img-src 'self' https: data: blob:`. There is no COOP, HSTS has no `preload`, and `/assets` has no `Cache-Control`.
- The manifest is generated by vite-plugin-pwa with only `pks-logo.svg` (`any maskable`). There are no PNG 192/512 icons and the description says "synthesize".
- P6 Open: `ReadOnlyBody.tsx:13` cover `<img>` has no aspect-ratio and no `onError`.

**Infrastructure today**
- There is no `components/ui/`, no shared Dialog, and no icon library (icons are text glyphs and emoji).
- `@mantine/hooks` `useFocusTrap` is used in only 2 of about 13 modal-like surfaces.
- Lint has no eslint-plugin-react, jsx-a11y, stylelint or import-boundary rule. 3 `components → features` imports exist (`DashboardObjectCard.jsx:5,6`, `ShortcutsModal.jsx:3`).

## Decisions

1. **Four parts, each its own plan and PR series**, in this order (each is shippable alone):
   - **0b-1 Guardrails and headers**: lint plugins with ratchets, the import boundary, an axe smoke test in report mode, security headers, self-hosted font, theme script to file, PWA icons, P6. These have no dependency on primitives and make the later parts measurable.
   - **0b-2 Primitives**: `components/ui/` (Button, IconButton, Field, Input, Select, Combobox, Card, Dialog, ConfirmDialog, Popover, Tabs, Badge, EmptyState, Spinner, Pagination, Toaster, Kbd), Lucide icons, Toaster replacing ToastContext (A12), Dialog with focus trap and Escape (used for A5 and M9), Combobox that commits explicitly (A6). Each primitive comes with its own CSS file (`components/ui/<Name>.css`, class prefix `ui-`) and tests. No page migration yet beyond the three call sites that prove each one: AiPanel, activity drawer, Taxonomy/Links.
   - **0b-3 Page migration and CSS sweep**: migrate page by page (dashboard, object page, ObjectNew, Templates, PromptBank, Settings, Search, Journal, PasteBin, auth), deleting the page CSS each primitive replaces. This folds in A7, A10, A11, A15, M5, M6, M8, M10, M11 and stylelint's strict token values. A CSS-size check in CI fails above the target once the part ends.
   - **0b-4 Navigation and copy**: `useTitle` and h1 focus (A8), ARIA fixes (A9, A13, A14), glossary (U2, U3), `lib/labels.ts` (U4), inline action errors per card (U8), `lib/formatDate.ts` (U11), Settings split (U14). The axe test switches from report mode to failing.
2. **Ratchets, not big bangs.** jsx-a11y and stylelint arrive in 0b-1 and 0b-3 as errors, with an explicit list of files allowed to fail (`a11yBaseline` in `eslint.config.js`). The list may only shrink, and 0b-4 ends with it empty, which is exit criterion 3. The axe test records counts in 0b-1 and fails on serious/critical in 0b-4.
3. **Self-host Plus Jakarta Sans** with `@fontsource-variable/plus-jakarta-sans` (bundled into `/assets`). This removes all Google Fonts hosts from CSP and Workbox and makes `'unsafe-hashes'` unnecessary.
4. **Theme script moves to `public/theme-init.js`**, loaded with a plain `<script src>` (synchronous, before paint). Its CSP hash is removed.
5. **`connect-src` is pinned** to `https://qtsxnipmbuvfflifvusn.supabase.co wss://qtsxnipmbuvfflifvusn.supabase.co` plus `https://challenges.cloudflare.com`.
6. **Icons:** `lucide-react`, imported per icon (tree-shaken). Emoji and text glyphs used as controls are replaced in 0b-2/0b-3. TypeMark stays.
7. **Primitives are TypeScript** (roadmap decision 4: new `features/*` and new files in TS) and style with tokens from `styles/tokens.css` / `index.css` only.

## Open questions for the owner (defaults used unless told otherwise)

- **img-src.** Covers are arbitrary user URLs (`Properties.tsx:74`), so narrowing `img-src` to known hosts would break existing covers. **Default:** keep `https:` in `img-src` for now and record the reason; narrowing comes with uploaded covers (stored in Supabase Storage) in a later phase.
- **U14 account deletion** needs a server path that deletes the auth user, storage and rows. That's a −1B-style security change, not UI work. **Default:** 0b-4 fixes the Settings grouping and the "contact support" copy and adds no deletion; deletion becomes its own item.
- **Glossary (U3).** **Default:** "Home" (nav, breadcrumbs), "Notifications", "Prompts", "object" in UI copy (types stay as type names), "Move to Trash" for the soft delete and "Delete forever" for the permanent one, and "Filters".
