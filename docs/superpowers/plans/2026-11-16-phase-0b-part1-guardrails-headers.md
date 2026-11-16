# Phase 0b part 1: guardrails and headers, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the rest of Phase 0b measurable and safe. Lint gains React, jsx-a11y (with a shrinking baseline) and an import boundary. An axe smoke test reports violations per route and theme. The security headers and PWA items close: self-hosted font, theme script in a file, pinned `connect-src` (S14), COOP, HSTS preload, immutable `/assets`, PNG/maskable icons. The cover image stops shifting (P6).

**Architecture:**
- Lint rules are configured in `frontend/eslint.config.js`. Their behaviour is pinned by a Vitest test that runs ESLint's Node API on code strings, so a config edit that silently disables a rule fails a test.
- The jsx-a11y baseline is an exported array in `frontend/eslint.a11y-baseline.js`. A test proves every listed file still fails, so the list can only shrink.
- Header and HTML guarantees are pinned by a Vitest test that reads `vercel.json` and `index.html`, because `vite preview` (e2e) doesn't serve Vercel headers.

**Tech stack:** ESLint 9 flat config, eslint-plugin-react, eslint-plugin-jsx-a11y, Vitest, Playwright + @axe-core/playwright (CI only), @fontsource-variable/plus-jakarta-sans, @vite-pwa/assets-generator.

**Spec:** `docs/superpowers/specs/2026-11-16-phase-0b-ui-system-design.md` (decisions 2–5 and "Verified status: Security and PWA").

## Global constraints

- The Supabase project host is `qtsxnipmbuvfflifvusn.supabase.co`. `connect-src` lists exactly `'self' https://qtsxnipmbuvfflifvusn.supabase.co wss://qtsxnipmbuvfflifvusn.supabase.co https://challenges.cloudflare.com`.
- `img-src` stays `'self' https: data: blob:`, because covers are arbitrary user URLs (spec, open question 1). Leave a comment in the plan PR, not in JSON.
- Turnstile (`https://challenges.cloudflare.com`) stays in `script-src`, `connect-src` and `frame-src`.
- No Docker. Playwright runs only in CI (`e2e` job). The unit suite runs with `npx vitest run` (default pool; `--pool=threads` breaks `datetime.test.js`).
- No behaviour change in app code except P6, the font source, and the three moved imports (Task 3).
- `lint` must stay clean (`npx eslint .` exit 0) after every task.

## Review focus

1. **Theme flash.** Moving the theme script to a file must keep it synchronous in `<head>` before any stylesheet paints. Assert there is no `async`/`defer`/`type="module"` on it (Task 5 test).
2. **A stale service worker.** An installed PWA keeps serving its precached `index.html`, which still references Google Fonts, until it updates. With the font hosts gone from CSP, that old page shows fallback fonts until the "Reload" prompt is accepted. This is acceptable, but the Workbox font runtime-caching rules must go in the same deploy (Task 5) so the new worker doesn't keep fetching them.
3. **Only hashed files are immutable.** `Cache-Control: public, max-age=31536000, immutable` applies to `/assets/(.*)` only. `index.html`, `sw.js` and the manifest must not match (Task 6 test).
4. **COOP and popups.** `Cross-Origin-Opener-Policy: same-origin` breaks `window.opener` for cross-origin popups. Auth is redirect-based and Turnstile is an iframe, so nothing breaks today. The Task 6 test records that no `window.open` exists in `src`, so a future popup flow trips it.
5. **Offline font.** The self-hosted woff2 must be in the Workbox precache (`globPatterns` already include `woff2`). The Task 7 manifest check also asserts that a `.woff2` is in the precache list.

---

### Task 1: eslint-plugin-react and the narrowed unused-vars pattern

**Files:**
- Modify: `frontend/package.json` (devDependency `eslint-plugin-react`)
- Modify: `frontend/eslint.config.js`
- Create: `frontend/src/test/lintRules.test.ts`
- Modify: whatever files the narrowed pattern flags

**Interfaces:**
- Produces: the `lintText(code: string, filePath: string): Promise<string[]>` helper in `lintRules.test.ts` (returns rule ids). Tasks 2 and 3 add cases to this file.

- [ ] **Step 1: Write the failing tests** in `src/test/lintRules.test.ts`. Use `new ESLint({ cwd: <frontend root> })` and `lintText(code, { filePath })`, and collect `messages.map(m => m.ruleId)`:
  - `it('flags an unused PascalCase variable in JSX files')`: `const Unused = 1; export default function A() { return null; }` with path `src/x.jsx` gives a result containing `no-unused-vars`.
  - `it('counts JSX usage as a use')`: `import Foo from './Foo'; export default function A() { return <Foo />; }` with path `src/x.jsx` has no `no-unused-vars`.
  - `it('allows a leading underscore')`: `const _skip = 1;` gives no `no-unused-vars`, in both `.jsx` and `.ts`.
- [ ] **Step 2: Run** `npx vitest run src/test/lintRules.test.ts`. Expected: the first test FAILS (`^[A-Z_]` ignores `Unused`).
- [ ] **Step 3: Install and configure.**
  - `npm i -D eslint-plugin-react`.
  - In both the JS and TS blocks, add `react.configs.flat['jsx-runtime']` and the rule `'react/jsx-uses-vars': 'error'`, with `settings: { react: { version: 'detect' } }`.
  - Narrow `varsIgnorePattern` to `'^_'` in both blocks.
- [ ] **Step 4: Run** `npx eslint .`, and fix each newly flagged unused variable by deleting it, or prefixing it with `_` if it is a deliberately unused binding.
- [ ] **Step 5: Run** `npx vitest run src/test/lintRules.test.ts && npx eslint .`. Expected: PASS, and lint exits 0.
- [ ] **Step 6: Commit** `chore(lint): eslint-plugin-react, unused vars only exempt with _`.

### Task 2: jsx-a11y with a shrinking baseline

**Files:**
- Modify: `frontend/package.json` (devDependency `eslint-plugin-jsx-a11y`)
- Create: `frontend/eslint.a11y-baseline.js`
- Modify: `frontend/eslint.config.js`, `frontend/src/test/lintRules.test.ts`

**Interfaces:**
- Produces: `export const a11yBaseline: string[]` (paths relative to `frontend/`, sorted). In `eslint.config.js`, files in this list get the jsx-a11y rules at `'off'`, and every other file gets `jsxA11y.flatConfigs.recommended` at error level. Parts 2–4 remove entries; part 4 ends with `[]`.

- [ ] **Step 1: Write the failing tests** (add to `lintRules.test.ts`):
  - `it('flags an image without alt outside the baseline')`: `export const A = () => <img src="x" />;` at `src/zz-new.jsx` gives a result containing `jsx-a11y/alt-text`.
  - `it('every baseline file still has a jsx-a11y violation')`: for each path in `a11yBaseline`, lint the real file with a config that forces jsx-a11y on (use `new ESLint({ overrideConfig: [{ files: ['**/*.{jsx,tsx}'], ...jsxA11y.flatConfigs.recommended }] })`) and expect at least one `jsx-a11y/*` message. The failure message is `${path} is clean now: remove it from eslint.a11y-baseline.js`.
- [ ] **Step 2: Run** the test file. Expected: FAIL (the plugin is not installed or configured).
- [ ] **Step 3: Install and configure.**
  - `npm i -D eslint-plugin-jsx-a11y`.
  - Add a config block for `src/**/*.{jsx,tsx}`, spreading `jsxA11y.flatConfigs.recommended`, with `ignores: a11yBaseline`.
- [ ] **Step 4: Generate the baseline.**
  - Temporarily set the baseline to `[]` and run `npx eslint . -f json -o ../a11y.json`.
  - Write the sorted unique `filePath`s that have `jsx-a11y/*` messages (made relative to `frontend/`) into `eslint.a11y-baseline.js`, with the header comment `// Phase 0b: files allowed to fail jsx-a11y. Only remove entries; part 4 ends with [].`
  - Delete `a11y.json`.
- [ ] **Step 5: Run** `npx vitest run src/test/lintRules.test.ts && npx eslint .`. Expected: PASS, and lint exits 0. Record the baseline length in the commit message.
- [ ] **Step 6: Commit** `chore(lint): jsx-a11y with a baseline of N files (only shrinks)`.

### Task 3: components must not import features

**Files:**
- Modify: `frontend/eslint.config.js`, `frontend/src/test/lintRules.test.ts`
- Move: `frontend/src/components/DashboardObjectCard.jsx` (and its test/CSS if present) → `frontend/src/features/dashboard/components/DashboardObjectCard.jsx`
- Move: `frontend/src/features/dashboard/lib/keyboardMap.js` (and its test, if any) → `frontend/src/lib/keyboardMap.js`
- Modify: the importers of both (find them with `grep -rn "DashboardObjectCard\|keyboardMap" src`)

**Interfaces:**
- Produces: the rule `no-restricted-imports` on `src/components/**`, with `patterns: [{ group: ['**/features/**'], message: 'components/ must not import features/; move shared code to lib/ or the component into its feature.' }]`.

- [ ] **Step 1: Write the failing test.** `it('stops components from importing features')`: `import x from '../features/dashboard/lib/keyboardMap';` at `src/components/Z.jsx` gives a result containing `no-restricted-imports`. Also check that the same import at `src/pages/Z.jsx` does not.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Add the rule.**
- [ ] **Step 4: Run** `npx eslint .`. Expected: 3 errors (`DashboardObjectCard.jsx:5,6`, `ShortcutsModal.jsx:3`). Fix them with the two moves (`git mv`), then update the import paths.
- [ ] **Step 5: Run** `npx vitest run && npx eslint .`. Expected: the full suite passes and lint exits 0.
- [ ] **Step 6: Commit** `chore(lint): components may not import features; move the card and keyboard map`.

### Task 4: axe smoke test (report mode)

**Files:**
- Modify: `frontend/package.json` (devDependency `@axe-core/playwright`)
- Create: `frontend/e2e/a11y.e2e.ts`

**Interfaces:**
- Produces: `A11Y_ROUTES` (`/`, `/objects/<seeded id>`, `/search`, `/settings`, `/trash`, `/prompts`, plus `/login` in a fresh context without storage state), each run in `dark` and `light`. Set the theme with `localStorage.setItem('pks-theme', theme)` in an init script.
- Produces: the env flag `A11Y_STRICT`. Unset means report mode: log a table and pass. `1` means fail on serious/critical. Part 4 sets it in `ci.yml`.

- [ ] **Step 1: Write the test.**
  - For each route × theme, open the route, wait for `main` to be visible, and run `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`.
  - Collect `{route, theme, serious, critical, ids}`.
  - `console.log` one `[axe]` line per route and theme, and attach the JSON with `test.info().attach('axe', …)`.
  - When `process.env.A11Y_STRICT === '1'`, `expect(serious + critical, ids.join(', ')).toBe(0)`.
- [ ] **Step 2: Typecheck and lint** `npx tsc -p tsconfig.e2e.json --noEmit && npx eslint e2e`. Expected: clean.
- [ ] **Step 3: Push, and confirm in the CI log** that the `e2e` job prints 14 `[axe]` lines and passes. Copy the table into the PR description as the 0b baseline.
- [ ] **Step 4: Commit** `test(e2e): axe smoke report per route and theme`.

### Task 5: self-hosted font and theme script in a file

**Files:**
- Modify: `frontend/package.json` (dependency `@fontsource-variable/plus-jakarta-sans`)
- Modify: `frontend/src/main.jsx` (`import '@fontsource-variable/plus-jakarta-sans';` before the app CSS), and the three `font-family` declarations: `src/styles/tokens.css:71` (`--pks-font-sans`), `src/index.css:99` and `src/App.css:22`. Each becomes `"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif`. Better still, point `index.css` and `App.css` at `var(--pks-font-sans)`.
- Create: `frontend/public/theme-init.js` (the exact body of the current inline script, `index.html:15-23`)
- Modify: `frontend/index.html` (delete lines 8–11; replace the inline script with `<script src="/theme-init.js"></script>`)
- Modify: `frontend/vite.config.js` (delete the two Google Fonts `runtimeCaching` entries)
- Modify: `frontend/vercel.json` (CSP)
- Create: `frontend/src/test/securityConfig.test.ts`

**Interfaces:**
- Produces: `securityConfig.test.ts` with the helpers `csp(): Map<string, string[]>` (parses the `Content-Security-Policy` value from `vercel.json`) and `header(source: string, key: string): string | undefined`. Task 6 adds cases.

- [ ] **Step 1: Write the failing tests:**
  - `it('serves no Google Fonts')`: `index.html` doesn't contain `fonts.googleapis` or `fonts.gstatic`, and no CSP directive does either.
  - `it('has no inline scripts or handlers')`: `index.html` has no `<script>` without `src`, and no ` on[a-z]+=` attribute. CSP `script-src` has no `'unsafe-hashes'` and no `sha256-` entry.
  - `it('loads the theme before paint')`: `index.html` has `<script src="/theme-init.js"></script>` inside `<head>`, without `async`, `defer` or `type=`.
  - `it('keeps Turnstile allowed')`: `script-src`, `connect-src` and `frame-src` include `https://challenges.cloudflare.com`.
- [ ] **Step 2: Run** `npx vitest run src/test/securityConfig.test.ts`. Expected: the first three FAIL.
- [ ] **Step 3: Make the changes listed under Files.** The CSP keeps everything else verbatim. `style-src` becomes `'self' 'unsafe-inline'` (BlockNote and Mantine inject styles), `font-src` becomes `'self' data:`, and `script-src` becomes `'self' https://challenges.cloudflare.com`.
- [ ] **Step 4: Run** `npx vitest run && npx eslint . && npm run build`. Expected: everything passes, and `dist/assets` contains a `plus-jakarta-sans*.woff2`.
- [ ] **Step 5: Commit** `feat(security): self-host the font, theme script as a file, drop unsafe-hashes`.

### Task 6: S14 and the remaining headers

**Files:**
- Modify: `frontend/vercel.json`, `frontend/src/test/securityConfig.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `it('pins connect-src to the project')`: `connect-src` equals exactly the global constraint list (order-insensitive), and no directive contains `*.supabase.co`.
  - `it('sends COOP and HSTS preload')`: on `/(.*)`, `Cross-Origin-Opener-Policy` is `same-origin`, and `Strict-Transport-Security` is `max-age=63072000; includeSubDomains; preload`.
  - `it('caches only hashed assets forever')`: a headers entry with `source: "/assets/(.*)"` has `Cache-Control: public, max-age=31536000, immutable`, and no other entry sets `Cache-Control`.
  - `it('has no popup flows that COOP would break')`: no file under `src` (excluding tests) contains `window.open(`.
- [ ] **Step 2: Run.** Expected: the first three FAIL.
- [ ] **Step 3: Edit `vercel.json`.**
- [ ] **Step 4: Run** `npx vitest run src/test/securityConfig.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(security): pin connect-src (S14), COOP, HSTS preload, immutable assets`.
- [ ] **Step 6: After the PR deploys**, check the Vercel preview with `curl -sI <preview>/` and `curl -sI <preview>/assets/<any>.js`, and paste both into the PR. Log in on the preview (Turnstile plus Supabase auth must work under the pinned `connect-src`).

### Task 7: PWA icons and manifest

**Files:**
- Modify: `frontend/package.json` (devDependency `@vite-pwa/assets-generator`; script `"icons": "pwa-assets-generator"`)
- Create: `frontend/pwa-assets.config.js` (preset `minimal2023Preset`, image `public/pks-logo.svg`)
- Create (generated, committed): `frontend/public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`
- Modify: `frontend/vite.config.js` (manifest `icons` and `description`), `frontend/index.html` (`<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`)
- Create: `frontend/scripts/check-pwa.mjs`; modify `.github/workflows/ci.yml` (run it after the e2e job's build)

**Interfaces:**
- Produces: the manifest `icons`. These are `pwa-192x192.png` (192x192, `image/png`, purpose `any`), `pwa-512x512.png` (512x512, purpose `any`), `maskable-icon-512x512.png` (512x512, purpose `maskable`) and `pks-logo.svg` (`any`, purpose `any`). The description is `'Your second brain. Capture, organize, and connect what you learn.'`.

- [ ] **Step 1: Write the check** `scripts/check-pwa.mjs`. It reads `dist/manifest.webmanifest` and `dist/sw.js`, and exits 1 with a message unless:
  - icons include 192 and 512 PNGs with purpose `any`, and a 512 PNG with purpose `maskable`;
  - every icon `src` exists in `dist/`;
  - the description doesn't contain "synthesize" (case-insensitive);
  - `sw.js` precaches at least one `.woff2` (Review focus 5).
- [ ] **Step 2: Run** `npm run build && node scripts/check-pwa.mjs`. Expected: FAIL (no PNG icons).
- [ ] **Step 3:** run `npm run icons`, then update `vite.config.js` and `index.html`.
- [ ] **Step 4: Run** `npm run build && node scripts/check-pwa.mjs`. Expected: exit 0. Add `node scripts/check-pwa.mjs` as a step after "Build against the local stack" in the `e2e` job.
- [ ] **Step 5: Commit** `feat(pwa): PNG and maskable icons, plain-language manifest`.

### Task 8: P6, a cover image that doesn't shift

**Files:**
- Modify: `frontend/src/features/object/ReadOnlyBody.tsx:13`, `frontend/src/features/object/ObjectPage.css` (`.detail-cover`, around lines 314–319)
- Test: `frontend/src/features/object/ReadOnlyBody.test.tsx` (create it if it doesn't exist; follow `ObjectPage.test.tsx`'s render helpers)

- [ ] **Step 1: Write the failing tests:**
  - `it('reserves the cover box before the image loads')`: the rendered `img.detail-cover` has `decoding="async"` and the `width`/`height` attributes `1200`/`675`.
  - `it('hides a cover that fails to load')`: `fireEvent.error(img)` removes the img from the DOM, or its wrapper gets `hidden`.
- [ ] **Step 2: Run** `npx vitest run src/features/object/ReadOnlyBody.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Use `useState` for `failed` and return null when it is set.
  - The `<img>` gets `width={1200} height={675} decoding="async" loading="lazy" onError={() => setFailed(true)}`.
  - The CSS gets `aspect-ratio: 16 / 9; width: 100%; height: auto; object-fit: cover;`.
- [ ] **Step 4: Run** `npx vitest run && npx eslint .`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(object): cover image keeps its box and hides on error (P6)`.

### Finish

- [ ] Open one PR for part 1. Wait for **every** check to finish before merging (`gh pr checks <n> --watch`; the repo has no branch protection).
- [ ] After merging, record in the spec's "Verified status": S14, the fonts/CSP/headers/PWA items and P6 are done, along with the a11y baseline length and the axe baseline table.
