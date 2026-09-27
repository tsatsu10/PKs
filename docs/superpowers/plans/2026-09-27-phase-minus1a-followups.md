# Phase −1A Follow-ups: Audit Fixes

Fixes for the gaps found by the post-merge audit of Phase −1A (2026-09-27). Branch `phase-minus1a-followups`, working directory `frontend/` unless noted.

**Checks after every group:** `npm run lint`, `npm test`, `npm run build`, `npm run check:bundle`.
**Commits:** one per group, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
**Out of scope (owned elsewhere):** D1 draft metadata revert → plan −1B1 `revision` column. B6 dashboard date presets (`toISOString().slice(0,10)`) → B16 in plan −1B1.

## Todo

### Group A: mobile layout, contrast, drawer focus
- [ ] A1 Bottom nav on notched iPhones: `.app-layout-bottom-nav` height becomes `calc(56px + env(safe-area-inset-bottom, 0px))` so the 44px links fit (`AppLayout.css`).
- [ ] A2 Contrast: the Auth submit button, dashboard FAB, active pagination page, error-boundary button and any other rule pairing `--accent-gradient` with light text use `--accent-strong-start/end` + `--on-accent` (`Auth.css`, `Dashboard.css`, `App.css`).
- [ ] A3 Widen `designTokens.test.js`: any rule that sets `background: var(--accent-gradient)` together with a text colour fails.
- [ ] A4 M7 remnant: `.app-layout-sidebar-collapsed` rules apply only on desktop (≥769px), so the mobile drawer shows headings and left-aligned links.
- [ ] A5 Activity drawer (`Dashboard.css`, `bottom: 0`) sits above the bottom nav on mobile via `--mobile-nav-offset`.
- [ ] A6 `.update-prompt` is full-width-capped on phones (the `max-width` was ineffective with `left: 50%`).
- [ ] A7 A4 focus: opening the mobile drawer moves focus into it; closing returns focus to the menu button.

### Group B: object pages and copy
- [ ] B1 B7: owners see one "Run prompt" button on ObjectDetail, not two.
- [ ] B2 Single-object export filenames keep non-Latin titles (shared helper with `zipEntryName`).
- [ ] B3 Bulk delete copy says "Move to Trash" / "Moved N to Trash" (modal + toast).
- [ ] B4 ObjectNew template draft restore also works under React StrictMode (`npm run dev`).

### Group C: session and per-user data
- [ ] C1 Drafts and the run-prompt key are also cleared on session expiry and on a logout from another tab.
- [ ] C2 Per-user localStorage (saved filters and similar) is keyed by user id or cleared on logout.
- [ ] C3 R4 cross-tab: a logout in another tab doesn't show "session expired" or keep a return-to page.
- [ ] C4 R1 residual: re-verifying an un-enriched user doesn't reset the Settings form when nothing changed.
- [ ] C5 Settings doesn't save the default timezone before the profile has loaded.
- [ ] C6 `refreshUser` bumps the verify generation so an older verify can't overwrite it.
- [ ] C7 Logout race: an auth event arriving while `signOut` is pending can't restore the user.

### Group D: PWA, tests, CI, dependencies, docs
- [ ] D1 Service-worker tests don't leak intervals or document listeners.
- [ ] D2 CI's production audit step fails the run on high/critical advisories.
- [ ] D3 Dev dependencies patched (vite ≥ 7.3.6, vitest past the critical advisory); `npm audit` clean or explained.
- [ ] D4 README deploy note: users on the old build get the update after closing all PKS tabs once.

### Group E: dead code
- [ ] E1 Remove the duplicate `public/manifest.json` link/file (keep the PWA-generated manifest).
- [ ] E2 Remove unused `template-picker*` CSS, `getStream*Height`, `useLinkedObjects`, `OBJECT_TYPE_ICONS`, `window.__reportError` (verify each is unused first).
- [ ] E3 Remove the ActivityPulse sparklines (audit §2).
