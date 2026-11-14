# Phase 0a, part 1: Data Layer, Errors and TypeScript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page reads data through one shared, persisted TanStack Query cache. Failed loads show an error with Retry, production errors land in a `client_errors` table, errors read in plain language, and new code is TypeScript. It fixes these audit findings:

| Area | Findings |
|---|---|
| Data layer | B11, P1 (dedupe part), P5, D11, U9 |
| Errors | R8, R9, R10, R12 |
| Tooling | T5 |

**Architecture:**
- **`src/data/`** (TypeScript) holds every Supabase read: one key factory (`keys.ts`), `unwrap()`, paging helpers, and one module per area with typed fetchers, `queryOptions()`, thin `useX` hooks and named invalidation helpers. Pages stay `.jsx` and import these hooks.
- **One `QueryClient`** with retry rules driven by `classifyError()`. The cache is persisted to IndexedDB per user and cleared by the existing `clearUserData()` / `claimUserData()` session rules.
- **Error reporting** goes through a `report_client_error` RPC into a `client_errors` table that only the owner can read.
- **Writes are unchanged** apart from invalidating the cache and using `notifyError()` for failures. Optimistic mutations are part 2.

**Tech Stack:** React 19, Vite 7, Vitest 4 + Testing Library, `@tanstack/react-query` 5.104, `@tanstack/react-query-persist-client` 5.104, `@tanstack/query-async-storage-persister` 5.104, `idb-keyval` 6.3, TypeScript 6.0, `typescript-eslint` 8.71, `fake-indexeddb` 6.2 (tests only), Supabase CLI + pgTAP.

**Spec:** [`docs/superpowers/specs/2026-10-13-phase-0a-part1-data-layer-design.md`](../specs/2026-10-13-phase-0a-part1-data-layer-design.md). Read it before starting; this plan argues from it.

## Global Constraints

- **Working directory:** frontend commands run from `frontend/`; database commands from the repo root.
  - Frontend checks: `npm run lint`, `npm run typecheck` (from Task 1), `npm test`, `npm run build`, `npm run check:bundle`.
  - DB tests: run `supabase/local-test/run.sh` locally (private PG18 on :54329, no Docker). CI runs `supabase test db` on the real stack.
- **Versions (exact ranges):** `@tanstack/react-query@^5.104.2`, `@tanstack/react-query-persist-client@^5.104.2`, `@tanstack/query-async-storage-persister@^5.104.2`, `idb-keyval@^6.3.0`, `typescript@~6.0.3` (**not 7.x**: `typescript-eslint` 8.71 requires `>=4.8.4 <6.1.0`), `typescript-eslint@^8.71.2`, `fake-indexeddb@^6.2.5` (dev).
- **Query defaults:** `staleTime` 30 s, `gcTime` 7 days (= persistence `maxAge`; TanStack drops a query from the saved cache once it's garbage-collected from memory, so a shorter `gcTime` would silently cap the saved cache at that length), `refetchOnWindowFocus: true` (off for `ObjectDetail`'s object query and Journal's day entry), `networkMode: 'online'`.
- **Persistence:** IndexedDB key `pks-query-cache:<userId>`, `buster` = `CACHE_SCHEMA_VERSION` (`'1'`), `maxAge` 7 days. Persisted key roots: `objects`, `object` (except `['object', id, 'versions']`), `taxonomy`, `templates`, `prompts`. Only queries with `status === 'success'`.
- **Retries:** `network` and `server` retry up to 2 times; `auth` once; every other kind never.
- **Reported kinds:** `server`, `permission`, and `unknown` when the error is not an app-authored plain `Error`. Limits: 60 s per fingerprint, 20 per session, nothing while offline; server side 30 per user per hour, 5,000 per day globally, 30-day retention; field caps message 500, stack 4096, route 300, app version 40, user agent 200, fingerprint 64.
- **No `select('*')`** anywhere in `src/data`. Every select lists its columns.
- **Every write refreshes what it changed.** Writes stay imperative, so the cache only learns about them through invalidation. After a successful write that creates, deletes, restores or edits knowledge objects (or their tags, domains, links or files), call `invalidateObjectLists()`; for one object's panels also call `invalidateObject(id)` or the matching setter. Taxonomy, prompts, templates, integrations, notifications, paste bin, journal and AI providers each have their own `invalidate*` helper, and the write that changes them calls it. A write that skips this leaves the dashboard showing old data for up to 30 s, and longer for keys nothing refetches.
- **Owner filters stay.** Every read that filtered `.eq('user_id', …)` keeps that filter: RLS also returns rows visible through sharing, and these pages show the user's own data. Hooks therefore take `userId: string | null` and are enabled only when it is set. The cache is per user, so keys still omit the id.
- **`.maybeSingle()`** for reads that may find nothing; never `.single()` in a read.
- **Key roots never contain the user id** (the cache is cleared on user change), and **pages never build keys by hand**: they call `qk.*` or a named `invalidate*` helper.
- **Migration:** `supabase/migrations/20261013000001_client_errors.sql`. SECURITY DEFINER with `SET search_path = ''`, `REVOKE EXECUTE … FROM PUBLIC, anon`, `GRANT … TO authenticated`. The owner pushes it to production; never use the SQL editor for schema changes.
- **Copy:** user-facing strings are sentence case and plain language; reuse the exact messages in Task 2.
- **Commits:** one per task at minimum, conventional prefixes (`feat`, `fix`, `chore`, `test`, `docs`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Public repo:** don't describe account-enumeration gaps in commit or PR text.

## Review Focus

1. **Two people, one browser tab.** User A's session expires, user B signs in in the same tab: B must never see A's data, in memory or restored from IndexedDB. Pinned by the "different user after expiry" test in Task 5.
2. **Changing a list while paging.** Restoring, deleting or marking items read, then pressing "Load more", must neither skip nor repeat rows. Pinned by the keyset test in Task 12.
3. **Typing while data refreshes.** Refocusing the window, reconnecting, or an invalidation while editing an object or a journal entry must not reset what the user typed. Pinned by the editor-safety tests in Tasks 11 and 13.
4. **Accounts larger than 1,000 rows.** More than 1,000 domains, tags, prompts or templates must all load (PostgREST `max_rows = 1000`). Pinned by the `fetchAll` 2,345-row test in Task 7.
5. **Opening the app offline.** Cached data shows with the offline banner, queries pause instead of erroring, and nothing is reported. Pinned by the offline restore test in Task 5 and the offline reporter test in Task 4.

---

## File Structure

| Path | Responsibility |
|---|---|
| `frontend/tsconfig.json`, `tsconfig.app.json`, `tsconfig.js.json` | Two-project type check (strict TS; non-strict `checkJs` on `lib/` and `hooks/`) |
| `frontend/src/vite-env.d.ts` | `import.meta.env` and `__APP_VERSION__` declarations |
| `frontend/src/lib/errors.ts` | `classifyError`, `getErrorMessage`, `isAppMessage` (replaces `errors.js`) |
| `frontend/src/lib/reportError.ts` | Scrubbing, dedupe, `reportError`, `installGlobalErrorReporting` |
| `frontend/src/lib/useNotifyError.ts` | `useNotifyError()`: toast + report for failed writes |
| `supabase/migrations/20261013000001_client_errors.sql` | `client_errors` table and `report_client_error` RPC |
| `supabase/tests/database/16_client_errors.test.sql` | pgTAP for the reporter |
| `frontend/src/data/database.types.ts` | Generated Supabase types (never hand-edited) |
| `frontend/src/data/client.ts` | Typed view of the existing Supabase client |
| `frontend/src/data/queryClient.ts` | `QueryClient`, `shouldRetry` |
| `frontend/src/data/persistence.ts` | IndexedDB persister, cache lifecycle (`startPersisting`, `stopPersisting`, `dropQueryCache`, `claimQueryCache`) |
| `frontend/src/data/QueryProvider.tsx` | Provider wiring and per-user persistence |
| `frontend/src/data/keys.ts` | `qk` key factory |
| `frontend/src/data/unwrap.ts`, `fetchAll.ts`, `keyset.ts`, `chunk.ts` | Shared fetch helpers |
| `frontend/src/data/{taxonomy,objects,dashboard,objectDetail,trash,notifications,auditLogs,pasteBin,journal,prompts,templates,integrations,settings,profile,exports}.ts` | One module per area |
| `frontend/src/components/QueryError.tsx`, `OfflineBanner.tsx` (+ CSS) | Error and offline UI |
| `frontend/src/test/queryTestUtils.tsx`, `supabaseMock.ts` | Test helpers |

---

### Task 1: TypeScript toolchain and CI type check

**Files:**
- Create: `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.js.json`, `frontend/src/vite-env.d.ts`
- Modify: `frontend/package.json`, `frontend/eslint.config.js`, `frontend/vite.config.js`, `.github/workflows/ci.yml`
- Modify (type fixes only): files under `frontend/src/lib/**/*.js`, `frontend/src/hooks/**/*.js`, and any JS file they import that `tsc` reports

**Interfaces:**
- Produces: `npm run typecheck` (`tsc -b`); global `__APP_VERSION__: string`; `.ts`/`.tsx` files under `src/` are strictly checked and linted.

- [ ] **Step 1: Install the tooling**

```bash
cd frontend
npm install --save-dev typescript@~6.0.3 typescript-eslint@^8.71.2
```

- [ ] **Step 2: Add the TypeScript configs**

`frontend/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.js.json" }]
}
```

`frontend/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

`frontend/tsconfig.js.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.js.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "checkJs": true,
    "strict": false,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src/lib/**/*.js", "src/hooks/**/*.js", "src/vite-env.d.ts"],
  "exclude": ["src/**/*.test.js"]
}
```

`frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Inject the app version**

In `frontend/vite.config.js`, add a `define` block at the top level of `defineConfig({ … })`, before `build`:

```js
  define: {
    // Vercel sets VERCEL_GIT_COMMIT_SHA at build time; local and test builds report "dev".
    __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12)),
  },
```

Also declare it for the JS lint block: in `frontend/eslint.config.js` change `globals: globals.browser,` in the existing block to `globals: { ...globals.browser, __APP_VERSION__: 'readonly' },`.

- [ ] **Step 4: Lint TypeScript files**

Replace `frontend/eslint.config.js` with:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/data/database.types.ts']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
```

- [ ] **Step 5: Add the script**

In `frontend/package.json` `scripts`, add after `"lint"`:

```json
    "typecheck": "tsc -b",
```

- [ ] **Step 6: Run the type check and record the errors**

Run: `npm run typecheck`
Expected: it may report errors in `src/lib/*.js`, `src/hooks/*.js` or JS files they import (for example `src/features/dashboard/lib/dashboardUtils.js`, `src/constants/*`).

- [ ] **Step 7: Fix every reported error with the smallest correct change**

Rules for this step:
- Fix real mistakes (wrong property, wrong argument count, missing import) in code.
- For inference gaps, add a JSDoc annotation (`/** @type {…} */`, `/** @param {…} */`), never `any` unless the value genuinely is unknown (then `/** @type {unknown} */` plus a narrowing check).
- **Never** add `// @ts-nocheck` or `// @ts-ignore`. If a pulled-in `.jsx` component is the source of an error, annotate the import site in the lib/hook instead.
- Don't change behavior. If a fix would change behavior, it's a bug: fix it, and add a test in that file's existing `*.test.js` showing the corrected behavior.

Run `npm run typecheck` until it exits 0.

- [ ] **Step 8: Prove the check catches errors**

Create `frontend/src/typecheck-probe.ts` containing `export const probe: number = 'x';`, run `npm run typecheck`, expect `error TS2322`, then delete the file.

- [ ] **Step 9: Add the CI step**

In `.github/workflows/ci.yml`, frontend job, insert after `- run: npm run lint`:

```yaml
      - run: npm run typecheck
```

- [ ] **Step 10: Run all frontend checks**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/tsconfig*.json frontend/src/vite-env.d.ts frontend/package.json frontend/package-lock.json frontend/eslint.config.js frontend/vite.config.js .github/workflows/ci.yml frontend/src
git commit -m "chore(ts): add TypeScript type checking for new code and checkJs on lib/hooks (T5)"
```

---

### Task 2: Error classifier and plain-language messages

**Files:**
- Create: `frontend/src/lib/errors.ts`, `frontend/src/lib/errors.test.ts`
- Delete: `frontend/src/lib/errors.js` (importers already use `'…/lib/errors'` without an extension, so no import changes)
- Modify: `frontend/package.json` (TanStack Query dependency, needed for `onlineManager`)

**Interfaces:**
- Produces:
  - `type ErrorKind = 'offline' | 'network' | 'auth' | 'permission' | 'not_found' | 'conflict' | 'validation' | 'rate_limited' | 'server' | 'unknown'`
  - `classifyError(err: unknown): ErrorKind`
  - `type MessageOverrides = Partial<Record<ErrorKind, string>> & { fallback?: string; message?: string }`
  - `getErrorMessage(err: unknown, fallbackOrOverrides?: string | MessageOverrides): string` (a string argument keeps today's meaning: the fallback)
  - `isAppMessage(err: unknown): boolean` — true for strings, plain `Error` instances (constructor exactly `Error`) and Postgres `P0001` raised exceptions: messages the app or our SQL wrote for people.
  - `ERROR_MESSAGES: Record<Exclude<ErrorKind, 'unknown'>, string>`

- [ ] **Step 1: Install TanStack Query** (later tasks use it; this task needs `onlineManager`)

```bash
cd frontend
npm install @tanstack/react-query@^5.104.2
```

- [ ] **Step 2: Write the failing test**

`frontend/src/lib/errors.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { classifyError, getErrorMessage, isAppMessage, ERROR_MESSAGES, type ErrorKind } from './errors';

const pg = (code: string, message = 'x') => ({ code, message, details: '', hint: '' });

describe('classifyError', () => {
  afterEach(() => onlineManager.setOnline(true));

  const cases: Array<[string, unknown, ErrorKind]> = [
    ['Chromium fetch failure (supabase-js error object)', { message: 'TypeError: Failed to fetch', code: '' }, 'network'],
    ['Safari fetch failure', { message: 'Load failed', code: '' }, 'network'],
    ['Firefox fetch failure', new TypeError('NetworkError when attempting to fetch resource.'), 'network'],
    ['Functions fetch failure', new FunctionsFetchError(new TypeError('Failed to fetch')), 'network'],
    ['expired JWT (PostgREST)', pg('PGRST301', 'JWT expired'), 'auth'],
    ['401 status', { status: 401, message: 'nope' }, 'auth'],
    ['RLS code', pg('42501', 'permission denied'), 'permission'],
    ['RLS text', 'new row violates row-level security policy for table "x"', 'permission'],
    ['403 status', { status: 403, message: 'forbidden' }, 'permission'],
    ['not found', pg('PGRST116', 'JSON object requested, multiple (or no) rows returned'), 'not_found'],
    ['duplicate key', pg('23505', 'duplicate key value violates unique constraint "tags_name_key"'), 'conflict'],
    ['not-null', pg('23502'), 'validation'],
    ['check', pg('23514'), 'validation'],
    ['bad text representation', pg('22P02'), 'validation'],
    ['PostgREST bad request', pg('PGRST204'), 'validation'],
    ['raised by our SQL', pg('P0001', 'Tag name is required'), 'validation'],
    ['429', { status: 429, message: 'slow down' }, 'rate_limited'],
    ['PostgREST connection error', pg('PGRST000'), 'server'],
    ['statement timeout', pg('57014'), 'server'],
    ['500 status', { status: 500, message: 'boom' }, 'server'],
    ['programming error', new TypeError("Cannot read properties of undefined (reading 'id')"), 'unknown'],
    ['app-authored Error', new Error('Name is required'), 'unknown'],
  ];
  it.each(cases)('%s', (_label, err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });

  it('reports network failures as offline while the browser is offline', () => {
    onlineManager.setOnline(false);
    expect(classifyError({ message: 'TypeError: Failed to fetch' })).toBe('offline');
  });

  it('reads the HTTP status of a FunctionsHttpError', () => {
    const err = new FunctionsHttpError(new Response('{}', { status: 429 }));
    expect(classifyError(err)).toBe('rate_limited');
  });
});

describe('getErrorMessage', () => {
  it('never shows raw database text', () => {
    const msg = getErrorMessage(pg('23505', 'duplicate key value violates unique constraint "tags_name_key"'));
    expect(msg).toBe(ERROR_MESSAGES.conflict);
    expect(msg).not.toMatch(/duplicate key/);
  });

  it('keeps the RLS hint for permission errors', () => {
    expect(getErrorMessage(pg('42501'))).toMatch(/Sign out and sign in again/);
  });

  it('accepts a string fallback for unknown errors (old signature)', () => {
    expect(getErrorMessage(new TypeError('x is undefined'), 'Failed to add tag')).toBe('Failed to add tag');
  });

  it('accepts per-kind overrides', () => {
    expect(getErrorMessage(pg('23505'), { conflict: 'A tag with that name already exists.' }))
      .toBe('A tag with that name already exists.');
  });

  it('a forced message always wins', () => {
    expect(getErrorMessage(pg('23505'), { message: 'Quota reached for today.' })).toBe('Quota reached for today.');
  });

  it('shows app-authored and SQL-raised messages as written', () => {
    expect(getErrorMessage(new Error('Name is required'))).toBe('Name is required');
    expect(getErrorMessage(pg('P0001', 'Too many shares in the last hour. Try again later.')))
      .toBe('Too many shares in the last hour. Try again later.');
    expect(getErrorMessage('Enter a prompt or select one from the Prompt Bank.'))
      .toBe('Enter a prompt or select one from the Prompt Bank.');
  });

  it('falls back for null and empty input', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
    expect(getErrorMessage('', 'Load failed')).toBe('Load failed');
  });
});

describe('isAppMessage', () => {
  it('is false for programming errors and true for plain Errors', () => {
    expect(isAppMessage(new TypeError('boom'))).toBe(false);
    expect(isAppMessage(new Error('Name is required'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: FAIL (`classifyError` is not exported).

- [ ] **Step 4: Implement**

Delete `frontend/src/lib/errors.js` and create `frontend/src/lib/errors.ts`:

```ts
import { onlineManager } from '@tanstack/react-query';

export type ErrorKind =
  | 'offline' | 'network' | 'auth' | 'permission' | 'not_found'
  | 'conflict' | 'validation' | 'rate_limited' | 'server' | 'unknown';

export type MessageOverrides = Partial<Record<ErrorKind, string>> & { fallback?: string; message?: string };

const RLS_HINT =
  'Permission denied. Sign out and sign in again. If you just registered, confirm your email first.';

export const ERROR_MESSAGES: Record<Exclude<ErrorKind, 'unknown'>, string> = {
  offline: "You're offline. This will work again once you're back online.",
  network: "Couldn't reach the server. Check your connection and try again.",
  auth: 'Your session expired. Sign in again.',
  permission: RLS_HINT,
  not_found: "That item doesn't exist or was deleted.",
  conflict: 'That name is already taken.',
  validation: "Some of that input isn't valid. Check it and try again.",
  rate_limited: 'Too many requests. Wait a moment and try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
};

const DEFAULT_FALLBACK = 'Something went wrong';
const NETWORK_TEXT = /Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Failed to send a request to the Edge Function/i;
const SERVER_CODES = /^(PGRST0\d\d|57014|53\d{3}|08\d{3}|XX\d{3})$/;

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown; name?: unknown; context?: unknown };

function fields(err: unknown): { message: string; code: string; status: number | null } {
  if (typeof err === 'string') return { message: err, code: '', status: null };
  if (err == null || typeof err !== 'object') return { message: '', code: '', status: null };
  const e = err as ErrorLike;
  const ctx = e.context as { status?: unknown } | undefined;
  const status = typeof e.status === 'number' ? e.status
    : ctx && typeof ctx.status === 'number' ? ctx.status : null;
  return { message: typeof e.message === 'string' ? e.message : '', code: typeof e.code === 'string' ? e.code : '', status };
}

export function classifyError(err: unknown): ErrorKind {
  const { message, code, status } = fields(err);
  if (NETWORK_TEXT.test(message) || (err as ErrorLike | null)?.name === 'FunctionsFetchError') {
    return onlineManager.isOnline() ? 'network' : 'offline';
  }
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /JWT expired/i.test(message)) return 'auth';
  if (code === '42501' || status === 403 || /row-level security/i.test(message)) return 'permission';
  if (code === 'PGRST116' || status === 404) return 'not_found';
  if (code === '23505' || status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (SERVER_CODES.test(code) || (status !== null && status >= 500)) return 'server';
  if (/^22/.test(code) || code === '23502' || code === '23503' || code === '23514' || code === 'P0001'
    || /^PGRST[12]\d\d$/.test(code) || status === 400 || status === 422) return 'validation';
  return 'unknown';
}

/** Messages written for people: strings, plain `Error`s thrown by app code, and SQL `RAISE EXCEPTION` text. */
export function isAppMessage(err: unknown): boolean {
  if (typeof err === 'string') return true;
  if (err instanceof Error) return err.constructor === Error;
  return fields(err).code === 'P0001';
}

export function getErrorMessage(err: unknown, fallbackOrOverrides?: string | MessageOverrides): string {
  const o: MessageOverrides = typeof fallbackOrOverrides === 'string'
    ? { fallback: fallbackOrOverrides }
    : fallbackOrOverrides ?? {};
  const fallback = o.fallback || DEFAULT_FALLBACK;
  if (o.message) return o.message;
  if (err == null || err === '') return fallback;
  const kind = classifyError(err);
  if (o[kind]) return o[kind] as string;
  if (kind !== 'permission' && isAppMessage(err)) {
    const { message } = fields(err);
    if (message) return message;
  }
  return kind === 'unknown' ? fallback : ERROR_MESSAGES[kind];
}
```

Note: a string or plain `Error` that happens to match a network or RLS pattern is still classified by that pattern (so `'… row-level security …'` strings get the RLS hint, as today).

- [ ] **Step 5: Run the tests and the full suite**

Run: `npx vitest run src/lib/errors.test.ts` → PASS. Then `npm test && npm run typecheck && npm run lint` → PASS. Existing callers like `getErrorMessage(err, 'Update failed')` keep working.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/errors.ts frontend/src/lib/errors.test.ts frontend/src/lib/errors.js frontend/package.json frontend/package-lock.json
git commit -m "feat(errors): classify errors and map them to plain-language messages (R8)"
```

---

### Task 3: `client_errors` table and `report_client_error` RPC

**Files:**
- Create: `supabase/migrations/20261013000001_client_errors.sql`, `supabase/tests/database/16_client_errors.test.sql`

**Interfaces:**
- Produces: `public.report_client_error(p_kind text, p_message text, p_stack text, p_route text, p_app_version text, p_user_agent text, p_fingerprint text) RETURNS boolean` — `true` when stored, `false` when dropped; raises `42501` for signed-out callers.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/database/16_client_errors.test.sql`:

```sql
BEGIN;
SELECT plan(12);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
SELECT tests.create_user('carol');

SELECT ok(NOT has_function_privilege('anon',
  'public.report_client_error(text,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot report');
SELECT ok(has_function_privilege('authenticated',
  'public.report_client_error(text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated can report');
SELECT throws_ok(
  $$SELECT public.report_client_error('server', 'm', NULL, '/', 'v', 'ua', 'fp')$$,
  '42501', NULL, 'signed-out callers are rejected');

SELECT tests.act_as('alice');
SELECT ok(public.report_client_error('server', repeat('m', 600), repeat('s', 5000), '/objects/1',
  'abc123', repeat('u', 300), 'fp-1'), 'alice can report');
SELECT ok(NOT public.report_client_error('network', 'x', NULL, '/', 'v', 'ua', 'fp-n'),
  'expected kinds are dropped');
SELECT throws_ok($$SELECT count(*) FROM public.client_errors$$, '42501', NULL,
  'users cannot read client_errors');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

SELECT results_eq(
  $$SELECT length(message), length(stack), length(user_agent) FROM public.client_errors$$,
  $$VALUES (500, 4096, 200)$$, 'fields are truncated');
SELECT is((SELECT user_id FROM public.client_errors LIMIT 1), tests.uid('alice'), 'user_id comes from the JWT');

SELECT tests.act_as('alice');
SELECT is((SELECT count(*)::int FROM generate_series(1, 29) g
           WHERE public.report_client_error('server', 'm' || g, NULL, '/', 'v', 'ua', 'fp' || g)),
  29, '29 more reports in the hour are accepted');
SELECT ok(NOT public.report_client_error('server', 'over', NULL, '/', 'v', 'ua', 'fp-x'),
  'the 31st report in an hour is dropped');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

-- Carol fills the global budget; bob has no reports of his own, so only the global cap can stop him.
INSERT INTO public.client_errors (user_id, kind, message, fingerprint)
SELECT tests.uid('carol'), 'server', 'bulk', 'fp' FROM generate_series(1, 5000);
SELECT tests.act_as('bob');
SELECT ok(NOT public.report_client_error('server', 'x', NULL, '/', 'v', 'ua', 'fp-b'),
  'the global daily cap drops reports');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

DELETE FROM public.client_errors;
INSERT INTO public.client_errors (user_id, kind, message, fingerprint, created_at)
VALUES (tests.uid('alice'), 'server', 'old', 'fp-old', now() - interval '31 days');
SELECT tests.act_as('bob');
SELECT public.report_client_error('server', 'fresh', NULL, '/', 'v', 'ua', 'fp-fresh');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.client_errors WHERE message = 'old'), 0,
  'rows older than 30 days are purged');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash supabase/local-test/run.sh`
Expected: FAIL in `16_client_errors.test.sql` (function does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261013000001_client_errors.sql`:

```sql
-- Production error reports from the web app (R12). Written only through report_client_error();
-- no user can read the table (RLS on, no policies). The owner reads it with SQL / the MCP.
CREATE TABLE public.client_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,
  message     text NOT NULL,
  stack       text,
  route       text,
  app_version text,
  user_agent  text,
  fingerprint text NOT NULL
);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;

CREATE INDEX idx_client_errors_user_created ON public.client_errors (user_id, created_at);
CREATE INDEX idx_client_errors_created ON public.client_errors (created_at);

COMMENT ON TABLE public.client_errors IS
  'Client error reports (kind, scrubbed message/stack, path-only route). Insert via report_client_error(); owner-read only. 30-day retention.';

CREATE FUNCTION public.report_client_error(
  p_kind text, p_message text, p_stack text, p_route text,
  p_app_version text, p_user_agent text, p_fingerprint text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('server', 'unknown', 'permission') THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.client_errors
      WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.client_errors
      WHERE created_at > now() - interval '1 day') >= 5000 THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_errors (user_id, kind, message, stack, route, app_version, user_agent, fingerprint)
  VALUES (v_uid, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4096), left(p_route, 300),
          left(p_app_version, 40), left(p_user_agent, 200), left(coalesce(p_fingerprint, ''), 64));

  DELETE FROM public.client_errors WHERE created_at < now() - interval '30 days';
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.report_client_error(text, text, text, text, text, text, text) IS
  'Store one client error report for the caller. Drops expected kinds, >30/user/hour and >5000/day globally. Returns true when stored.';
```

- [ ] **Step 4: Run the DB tests**

Run: `bash supabase/local-test/run.sh`
Expected: all files pass, including 12 assertions in `16_client_errors.test.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013000001_client_errors.sql supabase/tests/database/16_client_errors.test.sql
git commit -m "feat(db): client_errors table and rate-limited report_client_error RPC (R12)"
```

---

### Task 4: Error reporter, `useNotifyError` and global hooks

**Files:**
- Create: `frontend/src/lib/reportError.ts`, `frontend/src/lib/reportError.test.ts`, `frontend/src/lib/useNotifyError.ts`, `frontend/src/lib/useNotifyError.test.tsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `classifyError`, `isAppMessage`, `getErrorMessage`, `MessageOverrides` (Task 2); `report_client_error` (Task 3); `useToast()` from `context/ToastContext.jsx` (`addToast(type, message)`).
- Produces:
  - `scrub(text: string): string`
  - `reportError(err: unknown): void` (never throws)
  - `installGlobalErrorReporting(target?: Window): () => void`
  - `resetReporterForTests(): void`
  - `useNotifyError(): (err: unknown, overrides?: string | MessageOverrides) => string` (returns the message shown, so callers can also `setError(msg)` as pages do today)

- [ ] **Step 1: Write the failing reporter tests**

`frontend/src/lib/reportError.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
vi.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));

import { scrub, reportError, resetReporterForTests, installGlobalErrorReporting } from './reportError';

const serverErr = (message = 'boom') => ({ code: 'PGRST000', message, details: 'Key (title)=(Secret)', hint: '' });

describe('scrub', () => {
  it('removes emails, JWTs, row values and URL query/hash', () => {
    const out = scrub(
      'a@b.co eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig Key (title)=(My (private) note) ' +
      'https://pks2.vercel.app/objects/1?x=1#access_token=abc',
    );
    expect(out).not.toMatch(/a@b\.co|eyJ|private|x=1|access_token/);
    expect(out).toContain('[email]');
    expect(out).toContain('[jwt]');
    expect(out).toContain('(title)=([value])');
    expect(out).toContain('https://pks2.vercel.app/objects/1');
  });
});

describe('reportError', () => {
  beforeEach(() => { rpc.mockClear(); resetReporterForTests(); onlineManager.setOnline(true); });
  afterEach(() => { vi.useRealTimers(); onlineManager.setOnline(true); });

  it('sends server errors with path-only route and no details', () => {
    window.history.pushState({}, '', '/objects/1?q=secret#t=1');
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('report_client_error');
    expect(args.p_kind).toBe('server');
    expect(args.p_route).toBe('/objects/1');
    expect(JSON.stringify(args)).not.toContain('Secret');
    expect(args.p_app_version).toBe('dev');
  });

  it('skips expected kinds and app-authored messages', () => {
    reportError({ code: '23505', message: 'duplicate key' });
    reportError({ message: 'TypeError: Failed to fetch' });
    reportError(new Error('Name is required'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports permission errors and programming errors', () => {
    reportError({ code: '42501', message: 'permission denied' });
    reportError(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('sends nothing while offline', () => {
    onlineManager.setOnline(false);
    reportError(serverErr());
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dedupes the same fingerprint for 60 s', () => {
    vi.useFakeTimers();
    reportError(serverErr());
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('caps a session at 20 reports', () => {
    for (let i = 0; i < 25; i += 1) reportError(serverErr(`boom ${i}`));
    expect(rpc).toHaveBeenCalledTimes(20);
  });

  it('never throws, even when the RPC rejects', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('down')));
    expect(() => reportError(serverErr())).not.toThrow();
    await Promise.resolve();
  });

  it('global hooks report window errors and unhandled rejections', () => {
    const remove = installGlobalErrorReporting(window);
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is undefined') }));
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new RangeError('bad');
    window.dispatchEvent(rejection);
    remove();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/reportError.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the reporter**

`frontend/src/lib/reportError.ts`:

```ts
import { onlineManager } from '@tanstack/react-query';
import { supabase } from './supabase';
import { classifyError, isAppMessage, type ErrorKind } from './errors';

const REPORTED_KINDS = new Set<ErrorKind>(['server', 'unknown', 'permission']);
const DEDUPE_MS = 60_000;
const SESSION_CAP = 20;

const lastSent = new Map<string, number>();
let sentThisSession = 0;

export function resetReporterForTests(): void {
  lastSent.clear();
  sentThisSession = 0;
}

/** Remove personal data: emails, JWTs, `(column)=(value)` fragments, URL query strings and hashes. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
    .replace(/\)=\((?:[^()]|\([^()]*\))*\)/g, ')=([value])')
    .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1');
}

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function reportError(err: unknown): void {
  try {
    const kind = classifyError(err);
    if (!REPORTED_KINDS.has(kind)) return;
    if (kind === 'unknown' && isAppMessage(err)) return;
    if (!onlineManager.isOnline() || sentThisSession >= SESSION_CAP) return;

    const message = scrub(messageOf(err)).slice(0, 500);
    const stack = err instanceof Error && err.stack ? scrub(err.stack).slice(0, 4096) : null;
    const fingerprint = hash(`${kind}|${message}|${stack?.split('\n')[1] ?? ''}`);
    const now = Date.now();
    const previous = lastSent.get(fingerprint);
    if (previous !== undefined && now - previous < DEDUPE_MS) return;
    lastSent.set(fingerprint, now);
    sentThisSession += 1;

    void Promise.resolve(
      supabase.rpc('report_client_error', {
        p_kind: kind,
        p_message: message,
        p_stack: stack,
        p_route: window.location.pathname,
        p_app_version: __APP_VERSION__,
        p_user_agent: navigator.userAgent.slice(0, 200),
        p_fingerprint: fingerprint,
      }),
    ).catch(() => undefined);
  } catch {
    // The reporter must never throw or report itself.
  }
}

/** Report errors outside React: uncaught exceptions and unhandled promise rejections. */
export function installGlobalErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
  const onRejection = (event: Event) => reportError((event as PromiseRejectionEvent).reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
```

Vitest needs the `__APP_VERSION__` define: Task 1's `define` in `vite.config.js` applies to Vitest because `test` lives in the same config. If the test reports `__APP_VERSION__ is not defined`, confirm the `define` block is at the top level of the config object.

- [ ] **Step 4: Run the reporter tests**

Run: `npx vitest run src/lib/reportError.test.ts` → PASS.

- [ ] **Step 5: Write the failing `useNotifyError` test**

`frontend/src/lib/useNotifyError.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const addToast = vi.fn();
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ addToast }) }));
const reportError = vi.fn();
vi.mock('./reportError', () => ({ reportError: (e: unknown) => reportError(e) }));

import { useNotifyError } from './useNotifyError';

describe('useNotifyError', () => {
  it('toasts the plain message and reports the error', () => {
    const { result } = renderHook(() => useNotifyError());
    const err = { code: 'PGRST000', message: 'connection refused' };
    result.current(err, 'Failed to save');
    expect(addToast).toHaveBeenCalledWith('error', 'Something went wrong on our side. Try again in a moment.');
    expect(reportError).toHaveBeenCalledWith(err);
  });
});
```

- [ ] **Step 6: Implement it**

`frontend/src/lib/useNotifyError.ts`:

```ts
import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { getErrorMessage, type MessageOverrides } from './errors';
import { reportError } from './reportError';

/** For failed writes: show a plain-language toast and report the error. Returns the message shown. */
export function useNotifyError(): (err: unknown, overrides?: string | MessageOverrides) => string {
  const { addToast } = useToast();
  return useCallback((err, overrides) => {
    const message = getErrorMessage(err, overrides);
    addToast('error', message);
    reportError(err);
    return message;
  }, [addToast]);
}
```
- [ ] **Step 7: Wire the global hooks**

In `frontend/src/main.jsx`, add `import { reportError, installGlobalErrorReporting } from './lib/reportError'`, call `installGlobalErrorReporting()` once before `createRoot`, and pass React 19's root options:

```jsx
createRoot(document.getElementById('root'), {
  // Errors caught by the per-route ErrorBoundary (it still logs them itself).
  onCaughtError: (error) => reportError(error),
  // Errors no boundary caught.
  onUncaughtError: (error) => {
    reportError(error);
    console.error(error);
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Run all checks**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/reportError.ts frontend/src/lib/reportError.test.ts frontend/src/lib/useNotifyError.ts frontend/src/lib/useNotifyError.test.tsx frontend/src/main.jsx
git commit -m "feat(errors): report production errors to client_errors with scrubbing and limits (R12)"
```

---

### Task 5: Query client, IndexedDB persistence and session lifecycle

**Files:**
- Create: `frontend/src/data/queryClient.ts`, `frontend/src/data/persistence.ts`, `frontend/src/data/QueryProvider.tsx`, `frontend/src/data/persistence.test.tsx`, `frontend/src/test/queryTestUtils.tsx`
- Modify: `frontend/src/lib/userStorage.js` (`registerUserDataHooks`, `clearUserData`, `claimUserData`), `frontend/src/lib/userStorage.test.js`, `frontend/src/test/setup.js`, `frontend/src/App.jsx`, `frontend/package.json`

**Interfaces:**
- Consumes: `classifyError` (Task 2), `reportError` (Task 4), `useAuth()` (`user?.id`).
- Produces:
  - `queryClient: QueryClient`, `createQueryClient(): QueryClient`, `shouldRetry(failureCount: number, error: unknown): boolean`
  - `PERSISTED_ROOTS`, `CACHE_PREFIX = 'pks-query-cache:'`, `CACHE_SCHEMA_VERSION = '1'`, `CACHE_MAX_AGE`, `cacheKey(userId)`
  - `shouldPersistQuery(query: Query): boolean`
  - `startPersisting(userId: string, client?: QueryClient): Promise<void>` (resolves when restore finished), `stopPersisting(): void`
  - `dropQueryCache(ownerId: string | null, client?: QueryClient): Promise<void>` (explicit logout)
  - `claimQueryCache(userId: string, client?: QueryClient): Promise<void>` (sign-in)
  - `connectCacheToSession(): () => void`; in `lib/userStorage.js`: `registerUserDataHooks({ onClear, onClaim }): () => void`
  - `<QueryProvider>{children}</QueryProvider>`
  - Test utils: `createTestQueryClient(): QueryClient`, `renderWithClient(ui, client?)`, `wrapperFor(client)`

- [ ] **Step 1: Install**

```bash
cd frontend
npm install @tanstack/react-query-persist-client@^5.104.2 @tanstack/query-async-storage-persister@^5.104.2 idb-keyval@^6.3.0
npm install --save-dev fake-indexeddb@^6.2.5
```

- [ ] **Step 2: Add test utilities**

`frontend/src/test/queryTestUtils.tsx`:

```tsx
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 }, mutations: { retry: false } },
  });
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

export function renderWithClient(ui: ReactNode, client: QueryClient = createTestQueryClient()) {
  return { client, ...render(ui, { wrapper: wrapperFor(client) }) };
}
```

- [ ] **Step 3: Write the failing lifecycle tests**

`frontend/src/data/persistence.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get, set, keys, clear } from 'idb-keyval';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { createTestQueryClient, renderWithClient } from '../test/queryTestUtils';
import {
  cacheKey, startPersisting, stopPersisting, dropQueryCache, claimQueryCache, shouldPersistQuery,
} from './persistence';
import { shouldRetry } from './queryClient';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

const flushPersist = () => new Promise((r) => setTimeout(r, 1200)); // persister throttle is 1000 ms

beforeEach(async () => { stopPersisting(); await clear(); onlineManager.setOnline(true); });

describe('shouldRetry', () => {
  it('retries network and server twice, auth once, others never', () => {
    expect(shouldRetry(0, { message: 'Failed to fetch' })).toBe(true);
    expect(shouldRetry(2, { message: 'Failed to fetch' })).toBe(false);
    expect(shouldRetry(1, { code: 'PGRST000', message: 'x' })).toBe(true);
    expect(shouldRetry(0, { code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(shouldRetry(1, { code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(shouldRetry(0, { code: '42501', message: 'x' })).toBe(false);
    expect(shouldRetry(0, { code: '23505', message: 'x' })).toBe(false);
  });
});

describe('shouldPersistQuery', () => {
  it('persists successful queries under allowed roots only', () => {
    const q = (key: unknown[], status: string) => ({ queryKey: key, state: { status } }) as never;
    expect(shouldPersistQuery(q(['object', '1', 'detail'], 'success'))).toBe(true);
    expect(shouldPersistQuery(q(['search', {}], 'success'))).toBe(false);
    expect(shouldPersistQuery(q(['notifications', 'recent'], 'success'))).toBe(false);
    expect(shouldPersistQuery(q(['object', '1', 'detail'], 'error'))).toBe(false);
    expect(shouldPersistQuery(q(['object', '1', 'versions'], 'success'))).toBe(false);
  });
});

describe('cache lifecycle', () => {
  it('persists, and an explicit logout deletes the entry and clears memory', async () => {
    const client = createTestQueryClient();
    await startPersisting('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1', title: 'A note' });
    await flushPersist();
    expect(await get(cacheKey('A'))).toBeTruthy();

    await dropQueryCache('A', client);
    await flushPersist();
    expect(await get(cacheKey('A'))).toBeUndefined();
    expect(client.getQueryData(['object', '1', 'detail'])).toBeUndefined();
  });

  it('a different user signing in after an expiry never sees the first user\'s data', async () => {
    const client = createTestQueryClient();
    await claimQueryCache('A', client);
    await startPersisting('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1', title: 'A private' });
    await flushPersist();
    stopPersisting(); // session expired: memory and IndexedDB are kept

    await claimQueryCache('B', client);
    expect(client.getQueryData(['object', '1', 'detail'])).toBeUndefined();
    expect((await keys()).filter((k) => String(k).startsWith('pks-query-cache:'))).toEqual([]);
  });

  it('the same user signing back in after an expiry keeps the cache', async () => {
    const client = createTestQueryClient();
    await claimQueryCache('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1' });
    await claimQueryCache('A', client);
    expect(client.getQueryData(['object', '1', 'detail'])).toEqual({ id: '1' });
  });

  it('restores a saved cache and renders it with the network off', async () => {
    const first = createTestQueryClient();
    await startPersisting('A', first);
    first.setQueryData(['object', '1', 'detail'], { id: '1', title: 'Cached title' });
    await flushPersist();
    stopPersisting();

    onlineManager.setOnline(false);
    const second = createTestQueryClient();
    await startPersisting('A', second);
    const queryFn = vi.fn(() => Promise.reject(new Error('should not run')));
    function Probe() {
      const { data } = useQuery({ queryKey: ['object', '1', 'detail'], queryFn, staleTime: Infinity });
      return <p>{(data as { title?: string } | undefined)?.title ?? 'empty'}</p>;
    }
    renderWithClient(<Probe />, second);
    expect(await screen.findByText('Cached title')).toBeInTheDocument();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('ignores a cache written by another schema version', async () => {
    await set(cacheKey('A'), JSON.stringify({ buster: 'old', timestamp: Date.now(), clientState: { queries: [], mutations: [] } }));
    const client = createTestQueryClient();
    await startPersisting('A', client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/data/persistence.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 5: Implement the query client**

`frontend/src/data/queryClient.ts`:

```ts
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { classifyError } from '../lib/errors';
import { reportError } from '../lib/reportError';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const kind = classifyError(error);
  if (kind === 'network' || kind === 'server') return failureCount < 2;
  if (kind === 'auth') return failureCount < 1; // supabase-js may be refreshing the token
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => reportError(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Must be >= the persister's maxAge (persistence.CACHE_MAX_AGE), or saved entries expire early.
        gcTime: 7 * 24 * 60 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
        networkMode: 'online',
      },
    },
  });
}

export const queryClient = createQueryClient();
```

- [ ] **Step 6: Implement persistence and the lifecycle**

`frontend/src/data/persistence.ts`:

```ts
import type { Query, QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, keys, set } from 'idb-keyval';
import { queryClient as defaultClient } from './queryClient';

export const PERSISTED_ROOTS = ['objects', 'object', 'taxonomy', 'templates', 'prompts'] as const;
export const CACHE_PREFIX = 'pks-query-cache:';
/** Bump when a persisted data shape changes; old caches are then ignored. */
export const CACHE_SCHEMA_VERSION = '1';
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const cacheKey = (userId: string) => `${CACHE_PREFIX}${userId}`;

/** Large and rarely needed instantly: version history holds up to 50 full copies of an object. */
const NOT_PERSISTED_LEAVES = new Set(['versions']);

export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === 'success'
    && (PERSISTED_ROOTS as readonly unknown[]).includes(query.queryKey[0])
    && !NOT_PERSISTED_LEAVES.has(String(query.queryKey[2]));
}

let active: { userId: string; enabled: boolean; unsubscribe: () => void } | null = null;
let lastClaimedUserId: string | null = null;

/** Restore this user's saved cache, then keep saving it. Resolves once the restore has finished. */
export async function startPersisting(userId: string, client: QueryClient = defaultClient): Promise<void> {
  if (active?.userId === userId) return;
  stopPersisting();
  const session = { userId, enabled: true, unsubscribe: () => {} };
  const persister = createAsyncStoragePersister({
    key: cacheKey(userId),
    throttleTime: 1000,
    storage: {
      getItem: async (k) => (await get<string>(k)) ?? null,
      // A save already scheduled when persistence stopped must not recreate the entry.
      setItem: async (k, v) => { if (session.enabled) await set(k, v); },
      removeItem: (k) => del(k),
    },
  });
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: client,
    persister,
    maxAge: CACHE_MAX_AGE,
    buster: CACHE_SCHEMA_VERSION,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  });
  session.unsubscribe = unsubscribe;
  active = session;
  await restored.catch(() => undefined);
}

export function stopPersisting(): void {
  if (!active) return;
  active.enabled = false;
  active.unsubscribe();
  active = null;
}

/** Explicit logout: forget everything in memory and delete the owner's saved cache. */
export async function dropQueryCache(ownerId: string | null, client: QueryClient = defaultClient): Promise<void> {
  stopPersisting();
  client.clear();
  lastClaimedUserId = null;
  const all = await keys();
  await Promise.all(all
    .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX) && (ownerId == null || k === cacheKey(ownerId)))
    .map((k) => del(k)));
}

/** Sign-in: a different user than the last one clears memory; other users' saved caches are deleted. */
export async function claimQueryCache(userId: string, client: QueryClient = defaultClient): Promise<void> {
  if (lastClaimedUserId !== null && lastClaimedUserId !== userId) {
    stopPersisting();
    client.clear();
  }
  lastClaimedUserId = userId;
  const all = await keys();
  await Promise.all(all
    .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX) && k !== cacheKey(userId))
    .map((k) => del(k)));
}
```

Note for the reviewer: on a fresh page load `lastClaimedUserId` is `null`, so memory is empty anyway; the IndexedDB sweep in `claimQueryCache` is what removes a previous user's saved cache.

- [ ] **Step 7: Hook the lifecycle into `userStorage.js`**

**Don't import `src/data` from `userStorage.js`.** `persistence.ts` → `queryClient.ts` → `reportError.ts` → `lib/supabase.js`, and `lib/supabase.js` throws when `VITE_SUPABASE_URL` is missing. `userStorage.test.js` and `draftStorage.test.js` import `userStorage.js` without mocking Supabase; they'd still pass locally (because `frontend/.env` exists) and then fail in CI, which has no `.env`. So `userStorage.js` exposes hooks and the data layer registers itself.

In `frontend/src/lib/userStorage.js`, add near the top:

```js
/**
 * Per-user stores outside this module (the TanStack Query cache) register here, so this
 * file stays free of data-layer imports. Hooks must never throw.
 * @type {{ onClear: (ownerId: string | null) => void, onClaim: (userId: string) => void }[]}
 */
const userDataHooks = [];

/** @param {{ onClear: (ownerId: string | null) => void, onClaim: (userId: string) => void }} hooks */
export function registerUserDataHooks(hooks) {
  userDataHooks.push(hooks);
  return () => { userDataHooks.splice(userDataHooks.indexOf(hooks), 1); };
}
```

Change the two functions:

```js
export function clearUserData() {
  const owner = readItem(localStorage, DATA_OWNER_KEY);
  clearTabUserData();
  clearUserLocalData();
  try { sessionStorage.removeItem(DRAFT_OWNER_KEY); } catch (_e) { void _e; }
  removeLocal([DATA_OWNER_KEY]);
  userDataHooks.forEach((h) => h.onClear(owner));
}
```

```js
export function claimUserData(userId) {
  if (!userId) return;
  if (shouldClearForOwner(readItem(sessionStorage, DRAFT_OWNER_KEY), userId)) clearTabUserData();
  writeItem(sessionStorage, DRAFT_OWNER_KEY, userId);
  if (shouldClearForOwner(readItem(localStorage, DATA_OWNER_KEY), userId)) clearUserLocalData();
  writeItem(localStorage, DATA_OWNER_KEY, userId);
  userDataHooks.forEach((h) => h.onClaim(userId));
}
```

At the bottom of `frontend/src/data/persistence.ts`:

```ts
import { registerUserDataHooks } from '../lib/userStorage';

/** Called once from QueryProvider's module: logout and sign-in drive the cache lifecycle. */
export function connectCacheToSession(): () => void {
  return registerUserDataHooks({
    // Async IndexedDB work; nothing waits for it because each user only reads their own key.
    onClear: (owner) => { void dropQueryCache(owner).catch(() => undefined); },
    onClaim: (userId) => { void claimQueryCache(userId).catch(() => undefined); },
  });
}
```

(Move the import to the top of the file with the others.) Update `userStorage.js`'s header comment to list "the TanStack Query cache (memory + IndexedDB, via `registerUserDataHooks`)" among per-user data, with the same expiry rule as drafts.

Add one test to `frontend/src/lib/userStorage.test.js`:

```js
it('runs registered hooks on clear and claim', () => {
  const onClear = vi.fn();
  const onClaim = vi.fn();
  const unregister = registerUserDataHooks({ onClear, onClaim });
  localStorage.setItem(DATA_OWNER_KEY, 'u1');
  clearUserData();
  claimUserData('u2');
  unregister();
  expect(onClear).toHaveBeenCalledWith('u1');
  expect(onClaim).toHaveBeenCalledWith('u2');
});
```

(Add `vi` to its `vitest` import and `registerUserDataHooks`, `DATA_OWNER_KEY` to its `./userStorage` import if missing.) Then add `import 'fake-indexeddb/auto';` as the first line of `frontend/src/test/setup.js`, so any test that reaches `idb-keyval` has an IndexedDB.

- [ ] **Step 8: Provider**

`frontend/src/data/QueryProvider.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { queryClient } from './queryClient';
import { connectCacheToSession, startPersisting, stopPersisting } from './persistence';

// Registered at import time: App.jsx imports this module before AuthProvider's first effect
// can call claimUserData / clearUserData.
connectCacheToSession();

/** The app's query cache. Persistence runs while a session user exists (also offline, from the local session). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void startPersisting(userId);
    return stopPersisting; // session ended: stop saving; logout deletion happens in clearUserData
  }, [userId]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

In `frontend/src/App.jsx`, import `{ QueryProvider } from './data/QueryProvider'` and wrap everything inside `<AuthProvider>`:

```jsx
      <AuthProvider>
        <QueryProvider>
        <ThemeProvider>
        …
        </ThemeProvider>
        </QueryProvider>
      </AuthProvider>
```

- [ ] **Step 9: Run the tests and checks**

Run: `npx vitest run src/data/persistence.test.tsx` → PASS (5 lifecycle tests, plus the retry and persist-filter tests). Then `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/data frontend/src/test/queryTestUtils.tsx frontend/src/test/setup.js frontend/src/lib/userStorage.js frontend/src/lib/userStorage.test.js frontend/src/App.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat(data): query client with per-user IndexedDB persistence tied to the session rules"
```

---

### Task 6: `QueryError` and `OfflineBanner`

**Files:**
- Create: `frontend/src/components/QueryError.tsx`, `frontend/src/components/QueryError.css`, `frontend/src/components/OfflineBanner.tsx`, `frontend/src/components/OfflineBanner.css`, `frontend/src/components/QueryError.test.tsx`, `frontend/src/components/OfflineBanner.test.tsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `getErrorMessage` (Task 2).
- Produces:
  - `<QueryError error={unknown} onRetry={() => void} what?="tags" />` — `role="alert"`, text `Couldn't load {what}. {plain message}`, a `Retry` button when `onRetry` is given.
  - `<OfflineBanner />` — `role="status"`; offline text `You're offline. Showing saved data.`; after reconnecting `Back online.` for 3 s.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/QueryError.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryError from './QueryError';

describe('QueryError', () => {
  it('shows a plain message and retries', () => {
    const onRetry = vi.fn();
    render(<QueryError error={{ code: 'PGRST000', message: 'connection refused' }} onRetry={onRetry} what="tags" />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load tags. Something went wrong on our side.");
    expect(screen.getByRole('alert')).not.toHaveTextContent('connection refused');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

`frontend/src/components/OfflineBanner.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import OfflineBanner from './OfflineBanner';

afterEach(() => { vi.useRealTimers(); act(() => onlineManager.setOnline(true)); });

describe('OfflineBanner', () => {
  it('shows offline, then back online briefly, then nothing', () => {
    vi.useFakeTimers();
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent("You're offline. Showing saved data.");
    act(() => onlineManager.setOnline(true));
    expect(screen.getByRole('status')).toHaveTextContent('Back online.');
    act(() => vi.advanceTimersByTime(3001));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/QueryError.test.tsx src/components/OfflineBanner.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/components/QueryError.tsx`:

```tsx
import { getErrorMessage } from '../lib/errors';
import './QueryError.css';

type Props = { error: unknown; onRetry?: () => void; what?: string };

/** Inline load error with Retry, so a failed fetch never looks like an empty list (R9, R10). */
export default function QueryError({ error, onRetry, what }: Props) {
  return (
    <div className="query-error" role="alert">
      <p className="query-error-message">
        {what ? `Couldn't load ${what}. ` : ''}{getErrorMessage(error)}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
```

`frontend/src/components/QueryError.css`:

```css
.query-error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  border: 1px solid var(--danger, #e5484d);
  border-radius: 8px;
  color: var(--polar, inherit);
}
.query-error-message { margin: 0; }
```

Check `frontend/src/index.css` for the project's danger/text token names (search `--danger`, `--polar`) and use the real ones; `designTokens.test.js` checks contrast of tokens, so don't introduce new colors.

`frontend/src/components/OfflineBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import './OfflineBanner.css';

type State = 'online' | 'offline' | 'back';

/** App-wide connection banner. Queries pause while offline and resume on reconnect. */
export default function OfflineBanner() {
  const [state, setState] = useState<State>(() => (onlineManager.isOnline() ? 'online' : 'offline'));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onlineManager.subscribe((isOnline) => {
      clearTimeout(timer);
      if (!isOnline) { setState('offline'); return; }
      setState((prev) => (prev === 'offline' ? 'back' : prev));
      timer = setTimeout(() => setState('online'), 3000);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);
  if (state === 'online') return null;
  return (
    <div className={`offline-banner offline-banner-${state}`} role="status" aria-live="polite">
      {state === 'offline' ? "You're offline. Showing saved data." : 'Back online.'}
    </div>
  );
}
```

`frontend/src/components/OfflineBanner.css`:

```css
.offline-banner {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  background: var(--surface-elevated);
  border-bottom: 1px solid var(--border, transparent);
}
```

Again, confirm token names in `index.css`.

In `frontend/src/App.jsx`, render `<OfflineBanner />` as the first child inside `<BrowserRouter>` (before the skip link).

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run src/components/QueryError.test.tsx src/components/OfflineBanner.test.tsx` → PASS; `npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/QueryError.* frontend/src/components/OfflineBanner.* frontend/src/App.jsx
git commit -m "feat(ui): inline query errors with Retry and an app-wide offline banner (R8, R9)"
```

---

### Task 7: Data foundation — generated types, typed client, keys and fetch helpers

**Files:**
- Create: `frontend/src/data/database.types.ts` (generated), `frontend/src/data/client.ts`, `frontend/src/data/keys.ts`, `frontend/src/data/unwrap.ts`, `frontend/src/data/fetchAll.ts`, `frontend/src/data/keyset.ts`, `frontend/src/data/chunk.ts`, `frontend/src/data/helpers.test.ts`, `frontend/src/test/supabaseMock.ts`
- Modify: `frontend/package.json` (script), `.github/workflows/ci.yml` (database job)

**Interfaces:**
- Produces:
  - `db: SupabaseClient<Database>` (same instance as `lib/supabase.js`), `type Tables`, `type Row<T>` re-exported from `database.types.ts`
  - `unwrap<T>(res: { data: T; error: unknown }): T`
  - `fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize?: number): Promise<T[]>` (`pageSize` default `MAX_ROWS = 1000`)
  - `quoteFilterValue(v: string): string`, `type Cursor = { value: string; id: string }`, `afterCursorDesc(column: string, cursor: Cursor): string`, `nextCursor<T extends { id: string }>(rows: T[], column: keyof T, pageSize: number): Cursor | null`, `KEYSET_PAGE_SIZE = 50`
  - `chunk<T>(items: T[], size: number): T[][]`, `IN_CHUNK = 100`
  - `qk` (full shape below) and `type SearchPayload`
  - Test helper `mockSupabase()` (below)

- [ ] **Step 1: Generate the types**

In `frontend/package.json` `scripts`, add:

```json
    "gen:types": "supabase gen types typescript --project-id qtsxnipmbuvfflifvusn --schema public > src/data/database.types.ts",
```

Run `npm run gen:types` (needs `supabase login`; reads the production schema, no Docker). Open the file and confirm it starts with `export type Json =` and is UTF-8 (on Windows, run it from Git Bash or cmd, **not** PowerShell 5.1, whose `>` writes UTF-16). It won't contain `client_errors` until the owner pushes Task 3's migration; that's expected.

- [ ] **Step 2: Add the CI drift warning**

In `.github/workflows/ci.yml`, database job, after `- run: supabase test db`:

```yaml
      - name: Generate types from this branch's migrations
        run: supabase gen types typescript --local --schema public > database.types.ts
      - uses: actions/upload-artifact@v4
        with:
          name: database-types
          path: database.types.ts
      - name: Warn when committed types drift from the migrations
        run: |
          if ! diff -q database.types.ts frontend/src/data/database.types.ts > /dev/null; then
            echo "::warning title=Database types drift::frontend/src/data/database.types.ts differs from this branch's migrations. For a migration PR, commit the database-types artifact; otherwise run npm run gen:types."
            echo "⚠️ Committed database types differ from this branch's migrations. See the database-types artifact." >> "$GITHUB_STEP_SUMMARY"
          fi
```

This step only warns (see the spec, section 4).

- [ ] **Step 3: Write the failing helper tests**

`frontend/src/data/helpers.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { unwrap } from './unwrap';
import { fetchAll } from './fetchAll';
import { quoteFilterValue, afterCursorDesc, nextCursor } from './keyset';
import { chunk } from './chunk';

describe('unwrap', () => {
  it('returns data or throws the Supabase error', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
    const error = { code: '42501', message: 'denied' };
    expect(() => unwrap({ data: null, error })).toThrow();
    try { unwrap({ data: null, error }); } catch (e) { expect(e).toBe(error); }
  });
});

describe('fetchAll', () => {
  it('loads every page past the 1,000-row server limit', async () => {
    const all = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
    const page = vi.fn((from: number, to: number) => Promise.resolve({ data: all.slice(from, to + 1), error: null }));
    const rows = await fetchAll(page);
    expect(rows).toHaveLength(2345);
    expect(page.mock.calls.map((c) => c[0])).toEqual([0, 1000, 2000]);
  });

  it('stops after an exactly full last page', async () => {
    const page = vi.fn((from: number) => Promise.resolve({ data: from === 0 ? Array(1000).fill({}) : [], error: null }));
    expect(await fetchAll(page)).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('throws when a page fails', async () => {
    const page = () => Promise.resolve({ data: null, error: { code: 'PGRST000', message: 'down' } });
    await expect(fetchAll(page)).rejects.toMatchObject({ code: 'PGRST000' });
  });
});

describe('keyset', () => {
  it('quotes values so commas, quotes and parentheses are safe in PostgREST or()', () => {
    expect(quoteFilterValue('a,b')).toBe('"a,b"');
    expect(quoteFilterValue('say "hi" (x)')).toBe('"say \\"hi\\" (x)"');
    expect(quoteFilterValue('back\\slash')).toBe('"back\\\\slash"');
  });

  it('builds the after-cursor filter for (column desc, id desc)', () => {
    expect(afterCursorDesc('created_at', { value: '2026-10-13T01:02:03.4+00:00', id: 'b' }))
      .toBe('created_at.lt."2026-10-13T01:02:03.4+00:00",and(created_at.eq."2026-10-13T01:02:03.4+00:00",id.lt."b")');
  });

  it('returns a cursor only when the page is full', () => {
    const rows = [{ id: 'a', created_at: 't2' }, { id: 'b', created_at: 't1' }];
    expect(nextCursor(rows, 'created_at', 2)).toEqual({ value: 't1', id: 'b' });
    expect(nextCursor(rows, 'created_at', 3)).toBeNull();
  });
});

describe('chunk', () => {
  it('splits ids for .in() filters', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/data/helpers.test.ts` → FAIL.

- [ ] **Step 5: Implement the helpers**

`frontend/src/data/client.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, Tables } from './database.types';

/** The app's single Supabase client, typed with the generated schema. Use only inside src/data. */
export const db = supabase as unknown as SupabaseClient<Database>;
export type { Database, Tables };
```

If the generated file doesn't export `Tables`, define `export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];` in `client.ts` instead.

`frontend/src/data/unwrap.ts`:

```ts
/** Throw the Supabase error (so queries enter their error state) or return the data. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
```

`frontend/src/data/fetchAll.ts`:

```ts
import { unwrap } from './unwrap';

/** Must match `max_rows` in supabase/config.toml: a short page means "last page". */
export const MAX_ROWS = 1000;

/** Load every row by paging with .range(). The page query must have a stable order (ending in a unique column). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = MAX_ROWS,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = unwrap(await page(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
```

`frontend/src/data/keyset.ts`:

```ts
export const KEYSET_PAGE_SIZE = 50;
export type Cursor = { value: string; id: string };

/** Double-quote a value for a PostgREST logical filter, escaping backslashes and quotes. */
export function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `or()` filter for rows after the cursor in (column desc, id desc) order. */
export function afterCursorDesc(column: string, cursor: Cursor): string {
  const v = quoteFilterValue(cursor.value);
  return `${column}.lt.${v},and(${column}.eq.${v},id.lt.${quoteFilterValue(cursor.id)})`;
}

export function nextCursor<T extends { id: string }>(rows: T[], column: keyof T, pageSize: number): Cursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return { value: String(last[column]), id: last.id };
}
```

`frontend/src/data/chunk.ts`:

```ts
/** Keeps `.in()` URLs short; matches useDashboardBulkActions' existing chunk size. */
export const IN_CHUNK = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

Check `IN_CHUNK` in `frontend/src/features/dashboard/hooks/useDashboardBulkActions.js` and use the same number (Task 15 switches that file to this helper).

- [ ] **Step 6: Key factory**

`frontend/src/data/keys.ts`:

```ts
/** Arguments of search_knowledge_objects / count_knowledge_objects (built by useDashboardSearch's buildRpcPayload). */
export type SearchPayload = {
  search_query: string | null;
  type_filter: string | null;
  domain_id_f: string | null;
  tag_id_f: string | null;
  date_from_f: string | null;
  date_to_f: string | null;
  status_filter: string | null;
  due_from_f: string | null;
  due_to_f: string | null;
};

/** The only place query keys are built. Roots in persistence.PERSISTED_ROOTS are saved to IndexedDB. */
export const qk = {
  objects: {
    all: ['objects'] as const,
    page: (p: SearchPayload, offset: number) => ['objects', 'page', p, offset] as const,
    count: (p: SearchPayload) => ['objects', 'count', p] as const,
    resume: () => ['objects', 'resume'] as const,
    trailheads: () => ['objects', 'trailheads'] as const,
    linkCandidates: (excludeId: string) => ['objects', 'linkCandidates', excludeId] as const,
  },
  object: {
    all: (id: string) => ['object', id] as const,
    detail: (id: string) => ['object', id, 'detail'] as const,
    domains: (id: string) => ['object', id, 'domains'] as const,
    tags: (id: string) => ['object', id, 'tags'] as const,
    links: (id: string) => ['object', id, 'links'] as const,
    files: (id: string) => ['object', id, 'files'] as const,
    versions: (id: string) => ['object', id, 'versions'] as const,
    runs: (id: string) => ['object', id, 'runs'] as const,
    myShare: (id: string) => ['object', id, 'myShare'] as const,
    shares: (id: string) => ['object', id, 'shares'] as const,
  },
  suggestions: {
    tags: (id: string) => ['suggestions', id, 'tags'] as const,
    links: (id: string) => ['suggestions', id, 'links'] as const,
  },
  search: {
    results: (p: SearchPayload) => ['search', 'results', p] as const,
    linkPicker: (q: string) => ['search', 'linkPicker', q] as const,
  },
  taxonomy: {
    all: ['taxonomy'] as const,
    domains: () => ['taxonomy', 'domains'] as const,
    tags: () => ['taxonomy', 'tags'] as const,
  },
  dashboard: {
    stats: () => ['dashboard', 'stats'] as const,
    activity: () => ['dashboard', 'activity'] as const,
  },
  trash: { list: () => ['trash', 'list'] as const },
  notifications: {
    all: ['notifications'] as const,
    list: (filter: 'all' | 'unread') => ['notifications', 'list', filter] as const,
    recent: () => ['notifications', 'recent'] as const,
    unreadCount: () => ['notifications', 'unreadCount'] as const,
  },
  auditLogs: {
    list: (f: { action: string; dateFrom: string; dateTo: string }) => ['auditLogs', 'list', f] as const,
  },
  pasteBin: {
    all: ['pasteBin'] as const,
    list: () => ['pasteBin', 'list'] as const,
    item: (id: string) => ['pasteBin', 'item', id] as const,
  },
  journal: {
    all: ['journal'] as const,
    month: (start: string, end: string) => ['journal', 'month', start, end] as const,
    day: (date: string) => ['journal', 'day', date] as const,
  },
  prompts: { list: () => ['prompts', 'list'] as const },
  templates: { list: () => ['templates', 'list'] as const },
  integrations: { list: () => ['integrations', 'list'] as const },
  settings: {
    aiProviders: () => ['settings', 'aiProviders'] as const,
    profile: () => ['settings', 'profile'] as const,
  },
} as const;
```

- [ ] **Step 7: Supabase mock for module tests**

`frontend/src/test/supabaseMock.ts`:

```ts
import { vi } from 'vitest';

type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * A chainable fake of supabase.from()/rpc(). Every builder method records itself and returns the
 * chain; awaiting the chain (or calling single/maybeSingle) resolves to `respond(call)`.
 *   const sb = mockSupabase(); vi.mock('../lib/supabase', () => ({ supabase: sb.client }));
 *   sb.respond = (call) => call.table === 'tags' ? { data: [...], error: null } : { data: [], error: null };
 */
export function mockSupabase() {
  const calls: Call[] = [];
  const state = {
    respond: (_call: Call): Result => ({ data: [], error: null }),
    rpc: vi.fn((_name: string, _args?: unknown): Promise<Result> => Promise.resolve({ data: null, error: null })),
  };
  function from(table: string) {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'neq', 'is', 'not', 'in', 'or', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'range', 'insert', 'update', 'upsert', 'delete'];
    for (const m of methods) {
      chain[m] = (...args: unknown[]) => { call.ops.push([m, args]); return chain; };
    }
    chain.single = () => { call.ops.push(['single', []]); return Promise.resolve(state.respond(call)); };
    chain.maybeSingle = () => { call.ops.push(['maybeSingle', []]); return Promise.resolve(state.respond(call)); };
    chain.then = (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
      Promise.resolve(state.respond(call)).then(ok, fail);
    return chain;
  }
  const client = { from: vi.fn(from), rpc: (name: string, args?: unknown) => state.rpc(name, args) };
  return {
    client,
    calls,
    get respond() { return state.respond; },
    set respond(fn) { state.respond = fn; },
    rpc: state.rpc,
  };
}
```

Use it in later tasks with `vi.hoisted`:

```ts
const sb = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../test/supabaseMock').mockSupabase> | null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
```

- [ ] **Step 8: Run tests and checks**

Run: `npx vitest run src/data/helpers.test.ts` → PASS; `npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/data frontend/src/test/supabaseMock.ts frontend/package.json .github/workflows/ci.yml
git commit -m "feat(data): generated types, typed client, query keys and paging helpers"
```

---

### Task 8: Taxonomy module and its consumers

**Files:**
- Create: `frontend/src/data/taxonomy.ts`, `frontend/src/data/taxonomy.test.tsx`
- Modify: `frontend/src/hooks/useDashboardSearch.js` (domains/tags state), `frontend/src/pages/Search.jsx:103-112`, `frontend/src/pages/ObjectNew.jsx:55-60` (domains/tags only; templates move in Task 13), `frontend/src/pages/Settings.jsx:163-180` (domains/tags only; providers move in Task 15) and its add/delete handlers

**Interfaces:**
- Consumes: `db`, `fetchAll`, `qk.taxonomy` (Task 7).
- Produces:
  - `type Entity = { id: string; name: string }`
  - `fetchDomains(userId: string): Promise<Entity[]>`, `fetchTags(userId: string): Promise<Entity[]>`
  - `useDomains(userId: string | null)`, `useTags(userId: string | null)` (TanStack `UseQueryResult<Entity[]>`)
  - `useTaxonomy(userId: string | null): { domains: Entity[]; tags: Entity[]; isPending: boolean; error: unknown; refetch: () => void }`
  - `upsertTaxonomyEntity(kind: 'domains' | 'tags', entity: Entity, client?: QueryClient): void` (keeps the list sorted by name; replaces by id)
  - `removeTaxonomyEntity(kind: 'domains' | 'tags', id: string, client?: QueryClient): void`
  - `invalidateTaxonomy(client?: QueryClient): Promise<void>` (also invalidates `qk.objects.all`, because lists show names)

- [ ] **Step 1: Write the failing test**

`frontend/src/data/taxonomy.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useTaxonomy, upsertTaxonomyEntity } from './taxonomy';
import { qk } from './keys';

describe('useTaxonomy', () => {
  it('loads domains and tags once for any number of consumers, ordered by name then id', async () => {
    sb.current!.respond = (call) => ({ data: call.table === 'domains' ? [{ id: 'd1', name: 'Work' }] : [{ id: 't1', name: 'ai' }], error: null });
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const a = renderHook(() => useTaxonomy('u1'), { wrapper });
    renderHook(() => useTaxonomy('u1'), { wrapper });
    await waitFor(() => expect(a.result.current.isPending).toBe(false));
    expect(a.result.current.domains).toEqual([{ id: 'd1', name: 'Work' }]);
    expect(sb.current!.calls.filter((c) => c.table === 'domains')).toHaveLength(1);
    const ops = sb.current!.calls.find((c) => c.table === 'tags')!.ops.map(([m, args]) => `${m}:${args[0]}`);
    expect(ops).toEqual(['select:id, name', 'eq:user_id', 'order:name', 'order:id', 'range:0']);
  });

  it('surfaces errors instead of an empty list', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result } = renderHook(() => useTaxonomy('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('upsertTaxonomyEntity keeps the cached list sorted', () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.taxonomy.tags(), [{ id: 'b', name: 'beta' }]);
    upsertTaxonomyEntity('tags', { id: 'a', name: 'alpha' }, client);
    expect(client.getQueryData(qk.taxonomy.tags())).toEqual([{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/data/taxonomy.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/data/taxonomy.ts`:

```ts
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';
import { queryClient as defaultClient } from './queryClient';

export type Entity = { id: string; name: string };
type Kind = 'domains' | 'tags';

const fetchEntities = (table: Kind) => (userId: string) =>
  fetchAll<Entity>((from, to) => db.from(table).select('id, name').eq('user_id', userId)
    .order('name').order('id').range(from, to));

export const fetchDomains = fetchEntities('domains');
export const fetchTags = fetchEntities('tags');

export const domainsQuery = (userId: string) => queryOptions({ queryKey: qk.taxonomy.domains(), queryFn: () => fetchDomains(userId) });
export const tagsQuery = (userId: string) => queryOptions({ queryKey: qk.taxonomy.tags(), queryFn: () => fetchTags(userId) });

export const useDomains = (userId: string | null) => useQuery({ ...domainsQuery(userId ?? ''), enabled: !!userId });
export const useTags = (userId: string | null) => useQuery({ ...tagsQuery(userId ?? ''), enabled: !!userId });

export function useTaxonomy(userId: string | null) {
  const domains = useDomains(userId);
  const tags = useTags(userId);
  return {
    domains: domains.data ?? [],
    tags: tags.data ?? [],
    isPending: domains.isPending || tags.isPending,
    error: domains.error ?? tags.error,
    refetch: () => { void domains.refetch(); void tags.refetch(); },
  };
}

const keyFor = (kind: Kind) => (kind === 'domains' ? qk.taxonomy.domains() : qk.taxonomy.tags());

export function upsertTaxonomyEntity(kind: Kind, entity: Entity, client: QueryClient = defaultClient): void {
  client.setQueryData<Entity[]>(keyFor(kind), (prev = []) =>
    [...prev.filter((e) => e.id !== entity.id), entity].sort((a, b) => a.name.localeCompare(b.name)));
}

export function removeTaxonomyEntity(kind: Kind, id: string, client: QueryClient = defaultClient): void {
  client.setQueryData<Entity[]>(keyFor(kind), (prev = []) => prev.filter((e) => e.id !== id));
}

export async function invalidateTaxonomy(client: QueryClient = defaultClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.taxonomy.all }),
    client.invalidateQueries({ queryKey: qk.objects.all }),
  ]);
}

export { useQueryClient };
```

- [ ] **Step 4: Switch the consumers**

- **`useDashboardSearch.js`:** delete the `domains`/`tags` `useState`s, `refreshDomains`, `refreshTags` and the deferred domains/tags effect (lines 98-99, 123-133, 235-254). Add `const { domains, tags } = useTaxonomy(userId);`. `createDomainInline` becomes `const created = await createDomain(name); upsertTaxonomyEntity('domains', created); return created;` (same for tags). Keep returning `domains`, `tags`, `refreshDomains`, `refreshTags` (the latter two as `() => invalidateTaxonomy()`), so `useDashboardPage` is untouched. Remove the now-unused `deferAfterPaint` import if nothing else uses it.
- **`Search.jsx`:** delete the domains/tags state and the effect at lines 103-112; use `const { domains, tags } = useTaxonomy(user?.id ?? null);`.
- **`ObjectNew.jsx`:** replace the domains/tags part of the `Promise.all` at lines 55-60 with `useTaxonomy(user?.id ?? null)`; leave the `templates` read for Task 13.
- **`Settings.jsx`:** replace the domains/tags part of `load()` (lines 166-180) with `useTaxonomy(user?.id ?? null)`; after `addDomain`/`addTag` succeed call `upsertTaxonomyEntity(...)`; after `deleteDomain`/`deleteTag` succeed call `removeTaxonomyEntity(...)` and then `invalidateTaxonomy()` (object lists show names). Leave `user_ai_providers` for Task 15.
- Show `<QueryError what="domains and tags" error={taxonomy.error} onRetry={taxonomy.refetch} />` where each page previously rendered its filter or tag lists, only when `error` is set.
- Update `frontend/src/hooks/search.integration.test.js`: wrap `renderHook` in `wrapperFor(createTestQueryClient())`, and make `mockFromChain`'s chain support `range` (return a promise resolving `{ data: resolvedData, error: null }` from `range`). Keep every existing assertion.

- [ ] **Step 5: Run tests and checks** — `npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data/taxonomy.* frontend/src/hooks frontend/src/pages/Search.jsx frontend/src/pages/ObjectNew.jsx frontend/src/pages/Settings.jsx
git commit -m "feat(data): shared taxonomy query that loads every domain and tag (D11)"
```

---

### Task 9: Dashboard and Search object lists

**Files:**
- Create: `frontend/src/data/objects.ts`, `frontend/src/data/objects.test.tsx`
- Modify: `frontend/src/hooks/useDashboardSearch.js`, `frontend/src/pages/Search.jsx`, `frontend/src/hooks/search.integration.test.js`, `frontend/src/features/dashboard/hooks/useDashboardPage.js`, `frontend/src/features/dashboard/hooks/useDashboardBulkActions.js`, `frontend/src/pages/ObjectNew.jsx`, `frontend/src/pages/QuickCapture.jsx`, `frontend/src/pages/Import.jsx` (list invalidation after writes), and the dashboard list view that renders the error (search `error &&` under `src/features/dashboard/components/Views/` and in `src/pages/Dashboard.jsx`)

**Interfaces:**
- Consumes: `qk.objects`, `qk.search`, `SearchPayload` (Task 7); `useTaxonomy` (Task 8). Prefetch on these rows is added by Task 11, which owns `objectDetailQuery`.
- Produces:
  - `DASHBOARD_PAGE_SIZE = 20`
  - `useObjectsPage(payload: SearchPayload | null, offset: number)` — `useQuery` with `placeholderData: keepPreviousData`
  - `useObjectsCount(payload: SearchPayload | null)` — returns `number | null` data (null when the RPC fails; the failure must not fail the list)
  - `useSearchResults(payload: SearchPayload | null)` — `useInfiniteQuery`, 20 per page, offset paging (search ranking can't use keyset)
  - `invalidateObjectLists(client?: QueryClient): Promise<void>` (invalidates `qk.objects.all`, `['search']`, `qk.trash.list()` and `['dashboard']`)
  - `setObjectInLists(id: string, patch: Record<string, unknown> | null, client?: QueryClient): void` — patch a row in every cached dashboard page/search page, or remove it when `patch === null`

- [ ] **Step 1: Write the failing test**

`frontend/src/data/objects.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useObjectsPage, useObjectsCount, setObjectInLists } from './objects';
import { qk, type SearchPayload } from './keys';

const empty: SearchPayload = {
  search_query: null, type_filter: null, domain_id_f: null, tag_id_f: null, date_from_f: null,
  date_to_f: null, status_filter: null, due_from_f: null, due_to_f: null,
};

describe('dashboard object list', () => {
  it('dedupes identical requests and uses the snippets RPC only for text queries', async () => {
    sb.current!.rpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === 'count_knowledge_objects' ? 3 : [{ id: '1' }], error: null }));
    const wrapper = wrapperFor(createTestQueryClient());
    renderHook(() => useObjectsPage(empty, 0), { wrapper });
    const { result } = renderHook(() => useObjectsPage(empty, 0), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: '1' }]));
    expect(sb.current!.rpc.mock.calls.filter(([n]) => n === 'search_knowledge_objects')).toHaveLength(1);

    renderHook(() => useObjectsPage({ ...empty, search_query: 'rust' }, 0), { wrapper });
    await waitFor(() => expect(sb.current!.rpc.mock.calls.some(([n]) => n === 'search_knowledge_objects_with_snippets')).toBe(true));
  });

  it('keeps the previous rows while the next filter loads (no skeleton)', async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    sb.current!.rpc.mockImplementation((_n: string, args: { type_filter?: string }) =>
      args?.type_filter === 'note'
        ? new Promise((r) => { resolveSecond = r; })
        : Promise.resolve({ data: [{ id: 'old' }], error: null }));
    const { result, rerender } = renderHook(({ p }) => useObjectsPage(p, 0), {
      wrapper: wrapperFor(createTestQueryClient()), initialProps: { p: empty },
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'old' }]));
    rerender({ p: { ...empty, type_filter: 'note' } });
    expect(result.current.data).toEqual([{ id: 'old' }]);
    expect(result.current.isPlaceholderData).toBe(true);
    resolveSecond({ data: [{ id: 'new' }], error: null });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'new' }]));
  });

  it('a failing count returns null instead of failing the list', async () => {
    sb.current!.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: 'PGRST000', message: 'x' } }));
    const { result } = renderHook(() => useObjectsCount(empty), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('setObjectInLists patches and removes rows in cached pages', () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.objects.page(empty, 0), [{ id: '1', is_pinned: false }, { id: '2' }]);
    setObjectInLists('1', { is_pinned: true }, client);
    setObjectInLists('2', null, client);
    expect(client.getQueryData(qk.objects.page(empty, 0))).toEqual([{ id: '1', is_pinned: true }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/data/objects.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/data/objects.ts`:

```ts
import {
  keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { unwrap } from './unwrap';
import { qk, type SearchPayload } from './keys';
import { queryClient as defaultClient } from './queryClient';

export const DASHBOARD_PAGE_SIZE = 20;
export type ObjectRow = { id: string } & Record<string, unknown>;

// The search RPCs return computed rows (snippets, rank), so they use the untyped client.
async function searchPage(p: SearchPayload, offset: number): Promise<ObjectRow[]> {
  const rpc = p.search_query ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
  return unwrap(await supabase.rpc(rpc, { ...p, limit_n: DASHBOARD_PAGE_SIZE, offset_n: offset })) ?? [];
}

export function useObjectsPage(payload: SearchPayload | null, offset: number) {
  return useQuery({
    queryKey: qk.objects.page(payload as SearchPayload, offset),
    queryFn: () => searchPage(payload as SearchPayload, offset),
    enabled: payload !== null,
    placeholderData: keepPreviousData,
  });
}

export function useObjectsCount(payload: SearchPayload | null) {
  return useQuery({
    queryKey: qk.objects.count(payload as SearchPayload),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('count_knowledge_objects', payload);
      const n = Number(data);
      return error || data == null || !Number.isFinite(n) ? null : n;
    },
    enabled: payload !== null,
    placeholderData: keepPreviousData,
  });
}

export function useSearchResults(payload: SearchPayload | null) {
  return useInfiniteQuery({
    queryKey: qk.search.results(payload as SearchPayload),
    queryFn: ({ pageParam }) => searchPage(payload as SearchPayload, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === DASHBOARD_PAGE_SIZE ? pages.reduce((n, p) => n + p.length, 0) : undefined,
    enabled: payload !== null,
  });
}

/**
 * After any write that creates, deletes, restores or changes knowledge objects (or their tags,
 * domains or links): dashboard pages, counts, resume/trailheads, search, Trash and dashboard stats.
 */
export async function invalidateObjectLists(client: QueryClient = defaultClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.objects.all }),
    client.invalidateQueries({ queryKey: ['search'] }),
    client.invalidateQueries({ queryKey: qk.trash.list() }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

const patchRows = (rows: ObjectRow[], id: string, patch: Record<string, unknown> | null) =>
  patch === null ? rows.filter((r) => r.id !== id) : rows.map((r) => (r.id === id ? { ...r, ...patch } : r));

export function setObjectInLists(id: string, patch: Record<string, unknown> | null, client: QueryClient = defaultClient): void {
  client.setQueriesData<ObjectRow[]>({ queryKey: ['objects', 'page'] }, (rows) => rows && patchRows(rows, id, patch));
  client.setQueriesData<InfiniteData<ObjectRow[]>>({ queryKey: ['search', 'results'] }, (data) =>
    data && { ...data, pages: data.pages.map((rows) => patchRows(rows, id, patch)) });
}
```

- [ ] **Step 4: Rewrite `useDashboardSearch` internals, keeping its return shape**

Keep: the filter `useState`s, `createEmptyFiltersOverride`, `resolveSearchRpcFilters`, `pickFilter`, `pickQuery`, `buildRpcPayload`, `hasActiveFilters`, `clearFilters`, and every returned name. Replace the fetching:

```js
  const [appliedRpcPayload, setAppliedRpcPayload] = useState(null);
  const [offset, setOffset] = useState(0);
  const pageQ = useObjectsPage(userId ? appliedRpcPayload : null, offset);
  const countQ = useObjectsCount(userId ? appliedRpcPayload : null);
  const objects = pageQ.data ?? [];
  const totalCount = countQ.data ?? null;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount != null
    ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    : objects.length < PAGE_SIZE ? page : page + 1;
  const loading = pageQ.isPending;              // first load only; filter changes keep rows (U9)
  const [actionError, setError] = useState('');
  const error = actionError || (pageQ.error ? getErrorMessage(pageQ.error, 'Search failed') : '');

  const runSearch = useCallback((nextOffset = 0, queryOverride = null, filtersOverride = null) => {
    if (!userId) return;
    const hasOverride = queryOverride != null || filtersOverride != null;
    if (nextOffset === 0 || hasOverride || !appliedRpcPayload) {
      setAppliedRpcPayload(buildRpcPayload(resolveSearchRpcFilters(filtersOverride, filterState, queryOverride)));
    }
    setOffset(nextOffset);
    setError('');
  }, [userId, filterState, appliedRpcPayload]);

  const setObjects = useCallback((updater) => {
    queryClient.setQueryData(qk.objects.page(appliedRpcPayload, offset), (prev = []) =>
      (typeof updater === 'function' ? updater(prev) : updater));
  }, [appliedRpcPayload, offset, queryClient]);
```

(`queryClient` from `useQueryClient()`.) Notes:
- Delete `requestIdRef`, `appliedRpcPayloadRef`, the manual stale-response guard, the `runSearch(0)` effect on `userId` (lines 229-233), and `applyEstimatedPages`. `useDashboardPage`'s URL-sync effect already calls `runSearch(0, null, overrides)` on mount; duplicate calls with equal payloads now share one query key, which fixes B11's double fetch. If nothing has applied a payload yet when `userId` arrives, `useDashboardPage`'s URL effect does it.
- Expose `retry: () => pageQ.refetch()` in the returned object, and in the dashboard list view render `<QueryError what="your objects" error={pageQ.error} onRetry={retry} />` in place of the current error text when `pageQ.error` is set (find the current rendering by searching `error &&` in `src/features/dashboard/components/Views/` and `src/pages/Dashboard.jsx`).
- The resume-object read (lines 256-279) moves to Task 10; leave it for now.
- `goToPage` uses `setOffset` via `runSearch((p - 1) * PAGE_SIZE)` exactly as today.
- After writes that change lists, call `invalidateObjectLists()` once the write succeeds. Every one of these sites, found by searching `.insert(`, `.update(`, `.delete(`, `.upsert(` and write RPCs:
  - `useDashboardPage.handleQuickAddCreate` (keep its `runSearch(0)`: that means "back to page 1")
  - every bulk action in `useDashboardBulkActions.js` (add/remove domain or tag, move to Trash, change type, change status); replace their "re-run the search" calls with `invalidateObjectLists()` unless they also intend to reset the page
  - `ObjectNew.jsx` after the object (and its domain/tag rows) is created, before `navigate(...)`
  - `QuickCapture.jsx` after its insert
  - `Import.jsx` after its batch insert
- Add a test to `objects.test.tsx`: seed `qk.objects.page(empty, 0)`, `qk.trash.list()` and `qk.dashboard.stats()` in a client, call `invalidateObjectLists(client)`, and assert all three are invalidated (`client.getQueryState(key)?.isInvalidated === true`).

- [ ] **Step 5: Search page and prefetch**

In `Search.jsx`, replace `objects`/`loading`/`loadingMore`/`offset`/`hasMore` state and `runSearch` with an applied payload plus `useSearchResults`:

```js
  const [applied, setApplied] = useState(null);
  const results = useSearchResults(user?.id ? applied : null);
  const objects = useMemo(() => results.data?.pages.flat() ?? [], [results.data]);
  const loading = results.isPending && applied !== null;
  const loadingMore = results.isFetchingNextPage;
  const hasMore = !!results.hasNextPage;
  function runSearch(queryOverride = null, filtersOverride = null) {
    const state = { searchQuery: query, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo };
    setApplied(buildRpcPayload(resolveSearchRpcFilters(filtersOverride, state, queryOverride)));
  }
  const loadMore = () => results.fetchNextPage();
```

Export `buildRpcPayload` from `useDashboardSearch.js` for this. `handleSubmit` only calls `setSearchParams`; the `[user?.id, qFromUrl]` effect calls `runSearch(qFromUrl || undefined)`. That removes B11's double call. Render `<QueryError what="search results" error={results.error} onRetry={() => results.refetch()} />` when `results.error` is set.

Prefetch on these result rows is Task 11, Step 7.

- [ ] **Step 6: Update the integration test**

In `frontend/src/hooks/search.integration.test.js`, wrap with `wrapperFor(createTestQueryClient())`. Where a test called `result.current.runSearch(...)` and asserted on RPC args, wrap the call in `act()` and `await waitFor(...)` on `mockRpc` calls. Add one test: calling `runSearch(0)` twice with unchanged filters triggers `search_knowledge_objects` once (B11).

- [ ] **Step 7: Run tests and checks** — `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/data/objects.* frontend/src/hooks frontend/src/pages/Search.jsx frontend/src/pages/ObjectNew.jsx frontend/src/pages/QuickCapture.jsx frontend/src/pages/Import.jsx frontend/src/features/dashboard frontend/src/pages/Dashboard.jsx
git commit -m "feat(data): cached dashboard and search lists that keep rows while filtering (B11, U9)"
```

---

### Task 10: Dashboard extras — stats, activity, trailheads, resume, links batch

**Files:**
- Create: `frontend/src/data/dashboard.ts`, `frontend/src/data/dashboard.test.tsx`
- Modify: `frontend/src/features/dashboard/hooks/useDashboardPage.js:92,144-151`, `useTrailheads.js`, `useActivityPulse.js`, `useObjectLinksBatch.js`, `frontend/src/hooks/useDashboardSearch.js:256-279` (resume)

**Interfaces:**
- Produces:
  - `useDashboardStats(enabled: boolean)` — `get_dashboard_stats()`, key `qk.dashboard.stats()`
  - `useDashboardActivity(enabled: boolean)` — data `{ trendingTags: unknown[]; recentLinks: unknown[] }`
  - `useResumeObject(userId: string | null)` — data `{ id: string; title: string } | null`
  - `useTrailheadCandidates(userId: string | null)` — data `{ pending: TrailRow[]; spark: TrailRow[] }` (filtering against `resumeObject` stays in `useTrailheads`)
  - `fetchObjectLinksBatch(ids: string[]): Promise<Record<string, { links: unknown[]; total: number }>>` (plain fetcher; batching stays in the hook)

- [ ] **Step 1: Write the failing test**

`frontend/src/data/dashboard.test.tsx` (same `sb` mock header as Task 8):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useDashboardStats, useDashboardActivity, useResumeObject, fetchObjectLinksBatch } from './dashboard';

describe('dashboard queries', () => {
  it('get_dashboard_stats runs once for several consumers', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { total: 4 }, error: null });
    const wrapper = wrapperFor(createTestQueryClient());
    renderHook(() => useDashboardStats(true), { wrapper });
    const { result } = renderHook(() => useDashboardStats(true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ total: 4 }));
    expect(sb.current!.rpc.mock.calls.filter(([n]) => n === 'get_dashboard_stats')).toHaveLength(1);
  });

  it('normalizes activity and errors instead of silently emptying', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { trending_tags: [{ id: 't' }], recent_links: null }, error: null });
    const { result } = renderHook(() => useDashboardActivity(true), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toEqual({ trendingTags: [{ id: 't' }], recentLinks: [] }));

    sb.current!.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'x' } });
    const failing = renderHook(() => useDashboardActivity(true), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(failing.result.current.error).toBeTruthy());
  });

  it('resume object is null when nothing was viewed', async () => {
    sb.current!.respond = () => ({ data: null, error: null });
    const { result } = renderHook(() => useResumeObject('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('links batch fills missing ids with empty entries', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { a: { links: [{ id: 'l' }], total: 1 } }, error: null });
    expect(await fetchObjectLinksBatch(['a', 'b'])).toEqual({ a: { links: [{ id: 'l' }], total: 1 }, b: { links: [], total: 0 } });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/data/dashboard.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/data/dashboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export type TrailRow = { id: string; title: string; type: string; due_at?: string | null; updated_at: string; current_version: number; is_pinned?: boolean };

export function useDashboardStats(enabled: boolean) {
  return useQuery({
    queryKey: qk.dashboard.stats(),
    queryFn: async () => unwrap(await supabase.rpc('get_dashboard_stats')),
    enabled,
  });
}

export function useDashboardActivity(enabled: boolean) {
  return useQuery({
    queryKey: qk.dashboard.activity(),
    queryFn: async () => {
      const data = unwrap(await supabase.rpc('get_dashboard_activity')) as { trending_tags?: unknown; recent_links?: unknown } | null;
      return {
        trendingTags: Array.isArray(data?.trending_tags) ? data.trending_tags : [],
        recentLinks: Array.isArray(data?.recent_links) ? data.recent_links : [],
      };
    },
    enabled,
  });
}

export function useResumeObject(userId: string | null) {
  return useQuery({
    queryKey: qk.objects.resume(),
    queryFn: async () => {
      const row = unwrap(await db.from('knowledge_objects')
        .select('id, title, last_viewed_at')
        .eq('user_id', userId as string)
        .eq('is_deleted', false)
        .not('last_viewed_at', 'is', null)
        .order('last_viewed_at', { ascending: false })
        .limit(1)
        .maybeSingle());
      return row ? { id: row.id, title: row.title } : null;
    },
    enabled: !!userId,
  });
}

export function useTrailheadCandidates(userId: string | null) {
  return useQuery({
    queryKey: qk.objects.trailheads(),
    queryFn: async () => {
      const [pending, spark] = await Promise.all([
        db.from('knowledge_objects').select('id, title, type, due_at, updated_at, current_version')
          .eq('user_id', userId as string).eq('is_deleted', false).not('due_at', 'is', null).order('due_at', { ascending: true }).limit(3),
        db.from('knowledge_objects').select('id, title, type, updated_at, current_version, is_pinned')
          .eq('user_id', userId as string).eq('is_deleted', false)
          .order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(6),
      ]);
      return { pending: (unwrap(pending) ?? []) as TrailRow[], spark: (unwrap(spark) ?? []) as TrailRow[] };
    },
    enabled: !!userId,
  });
}

export async function fetchObjectLinksBatch(ids: string[]): Promise<Record<string, { links: unknown[]; total: number }>> {
  const data = (unwrap(await supabase.rpc('get_object_links_batch', { p_object_ids: ids, p_limit_per: 3 })) ?? {}) as
    Record<string, { links?: unknown[]; total?: unknown }>;
  return Object.fromEntries(ids.map((id) => {
    const entry = data[id];
    return [id, entry ? { links: entry.links ?? [], total: Number(entry.total) || 0 } : { links: [], total: 0 }];
  }));
}
```

- [ ] **Step 4: Switch the hooks**

- `useDashboardPage.js`: delete `heroStats` state and the stats effect (lines 92, 144-151); add `const statsQ = useDashboardStats(!!user?.id); const heroStats = statsQ.data ?? null;`. Leave `heroStats` in the returned object.
- `useActivityPulse.js`: body becomes `const q = useDashboardActivity(!!userId); return { activity: q.data ?? EMPTY_ACTIVITY, loading: !!userId && q.isPending, error: q.error, retry: () => q.refetch() };`. In `ActivityPulse.jsx`, render `<QueryError what="activity" error={error} onRetry={retry} />` when `error` is set.
- `useTrailheads.js`: use `useTrailheadCandidates(userId)` and keep the existing filtering in a `useMemo` over `resumeObject?.id` and the query data. The `trailheads.userId === userId` guard is no longer needed (cache is per user).
- `useDashboardSearch.js`: replace the resume effect (lines 256-279) with `const resumeQ = useResumeObject(userId); const resumeObject = resumeQ.data ?? null;`.
- `useObjectLinksBatch.js`: in `flushFetch`, replace the RPC block with `let map; try { map = await fetchObjectLinksBatch(ids); } catch (e) { reportError(e); return; }` and use `map` to build `next`. Behavior on failure is unchanged (rows show no links), but the error is now reported.
- The deferral via `deferAfterPaint` is dropped for these reads; TanStack dedupe plus the persisted cache make them cheap. If the dashboard's first paint gets slower in the manual check (Task 16), wrap `enabled` in a `useDeferredEnabled()` hook that flips to true after `deferAfterPaint`.

- [ ] **Step 5: Run tests and checks** — `npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data/dashboard.* frontend/src/features/dashboard frontend/src/hooks/useDashboardSearch.js
git commit -m "feat(data): dedupe dashboard stats, activity and trailhead reads (P1)"
```

---

### Task 11: `ObjectDetail` reads, per-panel errors, editor safety and prefetch

**Files:**
- Create: `frontend/src/data/objectDetail.ts`, `frontend/src/data/objectDetail.test.tsx`
- Modify: `frontend/src/hooks/useObjectDetail.js` (rewritten, same return shape plus `panelErrors`/`retryPanel`), `frontend/src/pages/ObjectDetail.jsx` (reads at lines ~178-192, ~220-238, ~286-293, ~306-313, ~352, ~930-950; panel error rendering), dashboard and search row links (prefetch)

**Interfaces:**
- Consumes: `qk.object`, `qk.objects.linkCandidates`, `qk.suggestions`, `qk.prompts` (Task 7); `useTaxonomy` (Task 8); `setObjectInLists`, `invalidateObjectLists` (Task 9); `useNotifyError` (Task 4); `QueryError` (Task 6).
- Creates early for later tasks: `src/data/prompts.ts` (fetcher and `promptsQuery`; Task 13 adds `usePromptsList`) and `src/data/settings.ts` (`useAiProviders`; Task 15 uses it in Settings). Prompt templates share the `qk.prompts.list()` cache with the Prompt Bank page.
- Produces (all in `objectDetail.ts`):
  - `OBJECT_COLS` (the existing column list, now including `content`)
  - `fetchObjectRow(id: string): Promise<ObjectRow | null>` (also used by the conflict path)
  - `objectDetailQuery(id: string)` — `queryOptions`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`
  - `useObjectPanels(id: string | undefined, userId: string | undefined, enabled: boolean)` — returns `{ versions, domains, tags, links, files, runs, myShare, linkCandidates, suggestedTags, suggestedLinks }`, each a `UseQueryResult`
  - `fetchShares(objectId: string): Promise<ShareRow[]>`
  - `searchLinkTargets(query: string): Promise<{ id: string; title: string; type: string }[]>`
  - `invalidateObject(id: string, client?): Promise<void>`, `invalidateObjectVersions(id: string, client?): Promise<void>`
  - `prefetchObject(id: string, client?): void`
  - In `prompts.ts`: `PROMPT_COLS`, `fetchPrompts(userId: string): Promise<PromptRow[]>`, `promptsQuery(userId: string)`

- [ ] **Step 1: Write the failing tests**

`frontend/src/data/objectDetail.test.tsx` (same `sb` mock header as Task 8):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useObjectDetail } from '../hooks/useObjectDetail';

const OBJ = { id: 'o1', user_id: 'u1', type: 'note', title: 'T', content: 'body', is_deleted: false, revision: 1 };

function respondAll(failTable?: string) {
  sb.current!.respond = (call) => {
    if (call.table === failTable) return { data: null, error: { code: 'PGRST000', message: 'down' } };
    if (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'maybeSingle')) return { data: OBJ, error: null };
    if (call.table === 'share_permissions') return { data: null, error: null };
    return { data: [], error: null };
  };
  sb.current!.rpc.mockResolvedValue({ data: [], error: null });
}

describe('useObjectDetail', () => {
  it('a failing panel reports its own error while the object still loads', async () => {
    respondAll('knowledge_object_tags');
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object?.title).toBe('T'));
    await waitFor(() => expect(result.current.panelErrors.tags).toBeTruthy());
    expect(result.current.panelErrors.domains).toBeFalsy();
    expect(result.current.error).toBe('');
  });

  it('a missing object is a not-found message, not a crash', async () => {
    respondAll();
    sb.current!.respond = (call) => (call.table === 'knowledge_objects' ? { data: null, error: null } : { data: [], error: null });
    const { result } = renderHook(() => useObjectDetail({ id: 'gone', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.object).toBeNull();
    expect(result.current.error).toMatch(/doesn't exist|deleted/i);
  });

  it('window focus and reconnect do not refetch the object (editor safety)', async () => {
    respondAll();
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object).toBeTruthy());
    const objectReads = () => sb.current!.calls.filter((c) => c.table === 'knowledge_objects' && c.ops.some(([m]) => m === 'maybeSingle')).length;
    const before = objectReads();
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    act(() => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
    await new Promise((r) => setTimeout(r, 20));
    expect(objectReads()).toBe(before);
    focusManager.setFocused(undefined);
  });

  it('setObjectTags updates the cached panel like the old state setter', async () => {
    respondAll();
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object).toBeTruthy());
    act(() => result.current.setObjectTags((prev: unknown[]) => [...prev, { id: 't1', name: 'x' }]));
    expect(result.current.objectTags).toEqual([{ id: 't1', name: 'x' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/data/objectDetail.test.tsx` → FAIL (`panelErrors` undefined).

- [ ] **Step 3: Implement `prompts.ts` (fetcher only) and `objectDetail.ts`**

`frontend/src/data/prompts.ts`:

```ts
import { queryOptions } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

// output_format is excluded on purpose: −1B2 Task 10 drops the column.
export const PROMPT_COLS = 'id, name, description, applies_to_types, prompt_text, tags, created_at, updated_at';
export type PromptRow = { id: string; name: string; description: string | null; applies_to_types: string[] | null; prompt_text: string; tags: string[] | null; created_at: string; updated_at: string };

export const fetchPrompts = (userId: string) =>
  fetchAll<PromptRow>((from, to) => db.from('prompt_templates').select(PROMPT_COLS).eq('user_id', userId)
    .order('name').order('id').range(from, to));

export const promptsQuery = (userId: string) => queryOptions({ queryKey: qk.prompts.list(), queryFn: () => fetchPrompts(userId) });
```

Before finalizing `PROMPT_COLS`, search `ObjectDetail.jsx` and `PromptBank.jsx` for every `prompt`/`template` property they read (`t.`, `template.`, `p.`) and include each one that exists on the table.

`frontend/src/data/objectDetail.ts`:

```ts
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { queryClient as defaultClient } from './queryClient';
import { promptsQuery } from './prompts';

export const OBJECT_COLS = 'id, user_id, type, title, content, source, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at, revision';
export type ObjectRow = Record<string, unknown> & { id: string; user_id: string; is_deleted: boolean; revision: number };
type Named = { id: string; name: string };
type LinkTarget = { id: string; title: string; type: string };

export async function fetchObjectRow(id: string): Promise<ObjectRow | null> {
  return (unwrap(await db.from('knowledge_objects').select(OBJECT_COLS).eq('id', id).maybeSingle()) as ObjectRow | null);
}

export const objectDetailQuery = (id: string) => queryOptions({
  queryKey: qk.object.detail(id),
  queryFn: () => fetchObjectRow(id),
  // The editor seeds from this data; never swap it underneath a user (part 2 adds "changed elsewhere").
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

async function fetchLinks(id: string) {
  const [out, inc] = await Promise.all([
    db.from('link_edges').select('id, to_object_id, relationship_type').eq('from_object_id', id),
    db.from('link_edges').select('id, from_object_id, relationship_type').eq('to_object_id', id),
  ]);
  const outRows = unwrap(out) ?? [];
  const inRows = unwrap(inc) ?? [];
  const ids = [...new Set([...outRows.map((r) => r.to_object_id), ...inRows.map((r) => r.from_object_id)])];
  const targets: Record<string, LinkTarget> = {};
  if (ids.length) {
    const rows = unwrap(await db.from('knowledge_objects').select('id, title, type').in('id', ids)) ?? [];
    for (const o of rows) targets[o.id] = o as LinkTarget;
  }
  const target = (oid: string) => targets[oid] ?? { id: oid, title: 'Unknown', type: '' };
  return {
    outgoing: outRows.map((r) => ({ id: r.id, to_object_id: r.to_object_id, relationship_type: r.relationship_type || 'references', target: target(r.to_object_id) })),
    incoming: inRows.map((r) => ({ id: r.id, from_object_id: r.from_object_id, relationship_type: r.relationship_type || 'references', source: target(r.from_object_id) })),
  };
}

export function useObjectPanels(id: string | undefined, userId: string | undefined, enabled: boolean) {
  const on = enabled && !!id && !!userId;
  const oid = id as string;
  return {
    versions: useQuery({ queryKey: qk.object.versions(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('knowledge_object_versions').select('id, version, title, content, summary, key_points, created_at, edited_by')
      .eq('knowledge_object_id', oid).order('created_at', { ascending: false }).limit(50)) ?? [] }),
    domains: useQuery({ queryKey: qk.object.domains(oid), enabled: on, queryFn: async () =>
      (unwrap(await db.from('knowledge_object_domains').select('domain_id, domains(id, name)').eq('knowledge_object_id', oid)) ?? [])
        .map((r) => r.domains as Named | null).filter((d): d is Named => !!d) }),
    tags: useQuery({ queryKey: qk.object.tags(oid), enabled: on, queryFn: async () =>
      (unwrap(await db.from('knowledge_object_tags').select('tag_id, tags(id, name)').eq('knowledge_object_id', oid)) ?? [])
        .map((r) => r.tags as Named | null).filter((t): t is Named => !!t) }),
    links: useQuery({ queryKey: qk.object.links(oid), enabled: on, queryFn: () => fetchLinks(oid) }),
    files: useQuery({ queryKey: qk.object.files(oid), enabled: on, queryFn: async () =>
      (unwrap(await db.from('knowledge_object_files').select('file_id, files(id, filename, mime_type, size_bytes, storage_key)').eq('knowledge_object_id', oid)) ?? [])
        .map((r) => r.files).filter(Boolean) }),
    runs: useQuery({ queryKey: qk.object.runs(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('prompt_runs').select('id, prompt_template_id, status, output, created_at')
      .eq('knowledge_object_id', oid).order('created_at', { ascending: false }).limit(20)) ?? [] }),
    myShare: useQuery({ queryKey: qk.object.myShare(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('share_permissions').select('id, role').eq('knowledge_object_id', oid).eq('shared_with_user_id', userId as string).maybeSingle()) }),
    linkCandidates: useQuery({ queryKey: qk.objects.linkCandidates(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('knowledge_objects').select('id, title, type').eq('user_id', userId as string).eq('is_deleted', false)
      .neq('id', oid).order('title').limit(200)) ?? [] }),
    prompts: useQuery({ ...promptsQuery(userId ?? ''), enabled: on }),
    suggestedTags: useQuery({ queryKey: qk.suggestions.tags(oid), enabled: on, queryFn: async () => {
      const primary = unwrap(await supabase.rpc('suggest_tags_for_object', { p_object_id: oid })) as unknown[] | null;
      if (primary?.length) return primary;
      return (unwrap(await supabase.rpc('suggest_tags_for_object_fallback', { p_object_id: oid })) as unknown[] | null) ?? [];
    } }),
    suggestedLinks: useQuery({ queryKey: qk.suggestions.links(oid), enabled: on, queryFn: async () =>
      (unwrap(await supabase.rpc('suggest_linked_objects', { p_object_id: oid, limit_n: 10 })) as unknown[] | null) ?? [] }),
  };
}

export type ShareRow = { id: string; shared_with_email: string; role: string; created_at: string; pending?: boolean };

export async function fetchShares(objectId: string): Promise<ShareRow[]> {
  const [shares, invites] = await Promise.all([
    db.from('share_permissions').select('id, shared_with_email, role, created_at').eq('knowledge_object_id', objectId).order('created_at', { ascending: false }),
    db.from('share_invites').select('id, email, role, created_at').eq('knowledge_object_id', objectId).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  const pending = (unwrap(invites) ?? []).map((i) => ({ id: `invite:${i.id}`, shared_with_email: i.email, role: i.role, created_at: i.created_at, pending: true }));
  return [...pending, ...((unwrap(shares) ?? []) as ShareRow[])];
}

export async function searchLinkTargets(query: string) {
  return ((unwrap(await supabase.rpc('search_knowledge_objects', { search_query: query, limit_n: 8, offset_n: 0 })) ?? []) as LinkTarget[]);
}

export const invalidateObject = (id: string, client: QueryClient = defaultClient) =>
  client.invalidateQueries({ queryKey: qk.object.all(id) });

export const invalidateObjectVersions = (id: string, client: QueryClient = defaultClient) =>
  client.invalidateQueries({ queryKey: qk.object.versions(id) });

export function prefetchObject(id: string, client: QueryClient = defaultClient): void {
  void client.prefetchQuery(objectDetailQuery(id));
}
```

Typed-client fallout: if a join select (`domains(id, name)`) types the nested value as an array, keep the `as Named | null` cast and add a comment that the FK is many-to-one. Fix `tsc` errors here rather than switching these selects to the untyped client.

- [ ] **Step 4: Rewrite `useObjectDetail.js` with the same return shape**

```js
import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { getErrorMessage } from '../lib/errors';
import { objectDetailQuery, useObjectPanels, invalidateObject } from '../data/objectDetail';
import { useTaxonomy } from '../data/taxonomy';
import { qk } from '../data/keys';

/**
 * Loads a knowledge object and its panels through the query cache.
 * Same return shape as before, plus panelErrors / retryPanel for per-panel error states (R10).
 */
export function useObjectDetail({ id, userId }) {
  const client = useQueryClient();
  const objectQ = useQuery({ ...objectDetailQuery(id ?? ''), enabled: !!id && !!userId });
  const raw = objectQ.data ?? null;
  const object = raw && !raw.is_deleted ? raw : null;
  const panels = useObjectPanels(id, userId, !!object);
  const taxonomy = useTaxonomy(object ? userId : null);
  const [actionError, setError] = useState('');

  const loadError = objectQ.error
    ? getErrorMessage(objectQ.error, 'Load failed')
    : objectQ.isSuccess && !raw ? "That item doesn't exist or was deleted."
    : raw?.is_deleted ? 'This object has been deleted' : '';

  const setter = useCallback((key, field) => (updater) => {
    client.setQueryData(key, (prev) => {
      const current = field ? prev?.[field] ?? [] : prev ?? [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return field ? { ...(prev ?? {}), [field]: next } : next;
    });
  }, [client]);

  const oid = id ?? '';
  const setObject = useMemo(() => setter(qk.object.detail(oid)), [setter, oid]);
  const reload = useCallback(() => invalidateObject(oid, client), [oid, client]);
  const draft = id ? getDraft(DRAFT_KEYS.object(id)) : null;

  const panelErrors = {
    versions: panels.versions.error, domains: panels.domains.error, tags: panels.tags.error,
    links: panels.links.error, files: panels.files.error, runs: panels.runs.error, prompts: panels.prompts.error,
    taxonomy: taxonomy.error,
  };
  const retryPanel = useCallback((name) => {
    if (name === 'taxonomy') return taxonomy.refetch();
    return panels[name]?.refetch();
  }, [panels, taxonomy]);

  return {
    object,
    setObject,
    loading: !!id && !!userId && objectQ.isPending,
    error: actionError || loadError,
    setError,
    reload,
    draft,
    versions: panels.versions.data ?? [],
    setVersions: setter(qk.object.versions(oid)),
    objectDomains: panels.domains.data ?? [],
    setObjectDomains: setter(qk.object.domains(oid)),
    objectTags: panels.tags.data ?? [],
    setObjectTags: setter(qk.object.tags(oid)),
    allDomains: taxonomy.domains,
    allTags: taxonomy.tags,
    outgoingLinks: panels.links.data?.outgoing ?? [],
    setOutgoingLinks: setter(qk.object.links(oid), 'outgoing'),
    incomingLinks: panels.links.data?.incoming ?? [],
    setIncomingLinks: setter(qk.object.links(oid), 'incoming'),
    otherObjects: panels.linkCandidates.data ?? [],
    attachedFiles: panels.files.data ?? [],
    setAttachedFiles: setter(qk.object.files(oid)),
    promptTemplates: panels.prompts.data ?? [],
    promptRuns: panels.runs.data ?? [],
    setPromptRuns: setter(qk.object.runs(oid)),
    suggestedTags: panels.suggestedTags.data ?? [],
    suggestedLinkedObjects: panels.suggestedLinks.data ?? [],
    myShare: panels.myShare.data ?? null,
    panelErrors,
    retryPanel,
  };
}
```

The `setter(...)` calls that aren't memoized create new functions each render; that matches the old `useState` setters closely enough because `ObjectDetail` only calls them in handlers. If the react-hooks lint rule flags them, wrap the return object's setters in one `useMemo` keyed on `[setter, oid]`.

- [ ] **Step 5: Move `ObjectDetail.jsx`'s own reads (no restructuring)**

- **AI providers (lines ~178-192):** replace the effect with `const providersQ = useAiProviders(user?.id ?? null); const aiProviders = providersQ.data ?? [];` — `useAiProviders` is defined in Task 15's `settings.ts`. To avoid a forward dependency, create `frontend/src/data/settings.ts` now with only:

```ts
import { useQuery } from '@tanstack/react-query';
import { AI_PROVIDER_IDS } from '../lib/aiProviders';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export type AiProviderRow = { id: string; name: string; provider_type: string };

export function useAiProviders(userId: string | null) {
  return useQuery({
    queryKey: qk.settings.aiProviders(),
    enabled: !!userId,
    queryFn: async () => (unwrap(await db.from('user_ai_providers').select('id, name, provider_type')
      .eq('user_id', userId as string).in('provider_type', AI_PROVIDER_IDS as string[]).order('name')) ?? []) as AiProviderRow[],
  });
}

export const invalidateAiProviders = (client: import('@tanstack/react-query').QueryClient) =>
  client.invalidateQueries({ queryKey: qk.settings.aiProviders() });
```

  Check where `AI_PROVIDER_IDS` is exported (`ObjectDetail.jsx` imports it; use the same module).
- **Link search (lines ~220-238):** keep the debounce effect, but call `searchLinkTargets(linkSearchQuery.trim())` inside it (wrapped in `try/catch` that sets `[]` on error, as today).
- **Conflict refresh (lines ~286-293):** replace the inline `.from('knowledge_objects')…maybeSingle()` with `const fresh = await fetchObjectRow(object.id);`.
- **Versions refresh after save (lines ~306-313):** replace with `invalidateObjectVersions(object.id);`.
- **After restoring a version (line ~352):** `reload()` already maps to `invalidateObject`; keep it.
- **Shares (lines ~930-950):** `loadShares` becomes `try { setShares(await fetchShares(object.id)); } catch (e) { reportError(e); setShares([]); setError(getErrorMessage(e, 'Failed to load shares')); }`.
- **After writes:** wherever a handler already calls `setObject`, `setObjectTags`, etc., leave it (that keeps this page instant). Additionally:
  - pin toggle → `setObjectInLists(object.id, { is_pinned: !object.is_pinned })`
  - move to Trash → `setObjectInLists(object.id, null)` then `invalidateObjectLists()` (refreshes Trash and counts)
  - save, restore version, add/remove domain, tag, link or attachment → `invalidateObjectLists()` (dashboard rows show titles, tags and link counts)
  - add/remove link → also `invalidateObject(otherId)` for the other end, so its backlinks panel is fresh
  - "save AI output as object" (`save_prompt_output_as_object`) → `invalidateObjectLists()`
- **Failed writes:** replace `addToast('error', getErrorMessage(err, '…'))` pairs with `notifyError(err, '…')` from `useNotifyError()`, keeping each `setError(msg)` by using the returned message: `setError(notifyError(err, 'Failed to add tag'))`. The run-prompt handler (lines ~614-672) builds its own message from the function body; pass it as `notifyError(err, { message: msg })` so the shown text doesn't change.

- [ ] **Step 6: Panel error states**

In `ObjectDetail.jsx`, inside each section card, directly under its `<h3 className="detail-section-card-title">…</h3>`, render the matching error (show it instead of the panel's empty state):

| Section heading | Error prop | `what` |
|---|---|---|
| Domains | `panelErrors.domains ?? panelErrors.taxonomy` | `domains` |
| Tags | `panelErrors.tags ?? panelErrors.taxonomy` | `tags` |
| Attachments | `panelErrors.files` | `attachments` |
| Version history (both occurrences) | `panelErrors.versions` | `version history` |
| Prompt runs | `panelErrors.runs ?? panelErrors.prompts` | `prompt runs` |
| Links | `panelErrors.links` | `links` |

```jsx
{panelErrors.tags && <QueryError what="tags" error={panelErrors.tags} onRetry={() => retryPanel('tags')} />}
```

- [ ] **Step 7: Prefetch on hover and focus**

Create `frontend/src/data/usePrefetchObject.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { prefetchObject } from './objectDetail';

/** Spread onto a link to an object: warms the object query on hover or keyboard focus. */
export function usePrefetchObject() {
  const client = useQueryClient();
  return (id: string) => ({ onMouseEnter: () => prefetchObject(id, client), onFocus: () => prefetchObject(id, client) });
}
```

Use it on: the dashboard row/card links (`src/features/dashboard/components/Views/*` — every `<Link to={\`/objects/${o.id}\`}`), `Search.jsx` result links, and `ObjectDetail.jsx`'s outgoing/incoming link targets: `const prefetch = usePrefetchObject(); … <Link to={…} {...prefetch(o.id)}>`.

- [ ] **Step 8: Run tests and checks**

Run: `npx vitest run src/data/objectDetail.test.tsx` → PASS; `npm test && npm run typecheck && npm run lint && npm run build && npm run check:bundle` → PASS. Manually open an object in `npm run dev`, edit the title, switch tabs and back: the typed title stays.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/data frontend/src/hooks/useObjectDetail.js frontend/src/pages/ObjectDetail.jsx frontend/src/pages/Search.jsx frontend/src/features/dashboard
git commit -m "feat(data): object detail through the cache with per-panel errors and prefetch (R10)"
```

---

### Task 12: Keyset-paged lists — Trash, Notifications, Audit logs, PasteBin

**Files:**
- Create: `frontend/src/data/trash.ts`, `frontend/src/data/notifications.ts`, `frontend/src/data/auditLogs.ts`, `frontend/src/data/pasteBin.ts`, `frontend/src/data/useKeysetList.ts`, `frontend/src/data/keysetLists.test.tsx`, `frontend/src/components/LoadMore.tsx`
- Modify: `frontend/src/pages/Trash.jsx`, `frontend/src/pages/Notifications.jsx`, `frontend/src/pages/AuditLogs.jsx`, `frontend/src/pages/PasteBin.jsx`

**Interfaces:**
- Consumes: `afterCursorDesc`, `nextCursor`, `KEYSET_PAGE_SIZE`, `Cursor` (Task 7).
- Produces:
  - `useKeysetList<T extends { id: string }>(opts: { queryKey: QueryKey; column: keyof T & string; fetchPage: (cursor: Cursor | null) => Promise<T[]>; enabled?: boolean })` → `{ rows: T[]; query: UseInfiniteQueryResult; removeRow(id): void; patchRow(id, patch): void }`
  - `useTrashList(userId: string | null)`, `useNotificationsList(userId: string | null, filter: 'all' | 'unread')`, `useAuditLogs(userId: string | null, f: AuditFilters)`, `usePasteList(userId: string | null)`, `usePasteItem(id: string | null)`, `invalidateNotifications(client)`, `invalidatePasteBin(client)`
  - `<LoadMore query={…} />` — renders a `Load more` button while `hasNextPage`, `Loading…` while fetching the next page

- [ ] **Step 1: Write the failing test**

`frontend/src/data/keysetLists.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';
import { useKeysetList } from './useKeysetList';
import type { Cursor } from './keyset';

type Row = { id: string; updated_at: string };
// 120 rows, newest first: r119 (t=119) … r0 (t=0). Timestamps zero-padded so string order matches.
let table: Row[] = Array.from({ length: 120 }, (_, i) => ({ id: `r${String(i).padStart(3, '0')}`, updated_at: String(i).padStart(4, '0') })).reverse();

function fetchPage(cursor: Cursor | null): Promise<Row[]> {
  const after = cursor
    ? table.filter((r) => r.updated_at < cursor.value || (r.updated_at === cursor.value && r.id < cursor.id))
    : table;
  return Promise.resolve(after.slice(0, 50));
}

describe('useKeysetList', () => {
  it('neither skips nor repeats rows when rows are removed between pages', async () => {
    const { result } = renderHook(
      () => useKeysetList<Row>({ queryKey: ['trash', 'list'], column: 'updated_at', fetchPage }),
      { wrapper: wrapperFor(createTestQueryClient()) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    const restored = result.current.rows.slice(0, 5).map((r) => r.id);
    table = table.filter((r) => !restored.includes(r.id));        // restored elsewhere / in this tab
    act(() => restored.forEach((id) => result.current.removeRow(id)));
    await act(async () => { await result.current.query.fetchNextPage(); });
    await act(async () => { await result.current.query.fetchNextPage(); });
    const ids = result.current.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);                    // no repeats
    expect(ids).toHaveLength(115);                                 // no skips
    expect(result.current.query.hasNextPage).toBe(false);
  });

  it('patchRow updates a row in place (mark read)', async () => {
    const { result } = renderHook(
      () => useKeysetList<Row & { read_at?: string | null }>({ queryKey: ['notifications', 'list', 'all'], column: 'updated_at', fetchPage }),
      { wrapper: wrapperFor(createTestQueryClient()) },
    );
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    const id = result.current.rows[0].id;
    act(() => result.current.patchRow(id, { read_at: 'now' }));
    expect(result.current.rows[0].read_at).toBe('now');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/data/keysetLists.test.tsx` → FAIL.

- [ ] **Step 3: Implement the shared hook and `LoadMore`**

`frontend/src/data/useKeysetList.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { KEYSET_PAGE_SIZE, nextCursor, type Cursor } from './keyset';

/** A page remembers the cursor computed when it was fetched, so removing rows later can't move it. */
type Page<T> = { rows: T[]; next: Cursor | null };

export function useKeysetList<T extends { id: string }>(opts: {
  queryKey: QueryKey;
  column: keyof T & string;
  fetchPage: (cursor: Cursor | null) => Promise<T[]>;
  enabled?: boolean;
}) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: opts.queryKey,
    queryFn: async ({ pageParam }): Promise<Page<T>> => {
      const rows = await opts.fetchPage(pageParam);
      return { rows, next: nextCursor(rows, opts.column, KEYSET_PAGE_SIZE) };
    },
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last: Page<T>) => last.next,
    enabled: opts.enabled ?? true,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) ?? [], [query.data]);
  const update = useCallback((fn: (rows: T[]) => T[]) => {
    client.setQueryData<InfiniteData<Page<T>, Cursor | null>>(opts.queryKey, (data) =>
      data && { ...data, pages: data.pages.map((p) => ({ ...p, rows: fn(p.rows) })) });
  }, [client, opts.queryKey]);
  const removeRow = useCallback((id: string) => update((r) => r.filter((x) => x.id !== id)), [update]);
  const patchRow = useCallback((id: string, patch: Partial<T>) =>
    update((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))), [update]);
  return { rows, query, removeRow, patchRow };
}
```

Why `Page<T>` stores `next`: TanStack calls `getNextPageParam` on the **current** cached last page. If it computed the cursor from rows, removing a restored item would shorten that page below 50 and "Load more" would stop early (a skip). The test above pins this.

`frontend/src/components/LoadMore.tsx`:

```tsx
type Props = { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } };

export default function LoadMore({ query }: Props) {
  if (!query.hasNextPage) return null;
  return (
    <div className="load-more">
      <button type="button" className="btn btn-secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
        {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Area modules**

`frontend/src/data/trash.ts`:

```ts
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type TrashRow = { id: string; type: string; title: string; updated_at: string };

export function useTrashList(userId: string | null) {
  return useKeysetList<TrashRow>({
    queryKey: qk.trash.list(),
    column: 'updated_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('knowledge_objects').select('id, type, title, updated_at')
        .eq('user_id', userId as string).eq('is_deleted', true)
        .order('updated_at', { ascending: false }).order('id', { ascending: false })
        .limit(KEYSET_PAGE_SIZE);
      if (cursor) q = q.or(afterCursorDesc('updated_at', cursor));
      return (unwrap(await q) ?? []) as TrashRow[];
    },
  });
}
```

`frontend/src/data/notifications.ts` (list part; Task 14 adds the bell):

```ts
import type { QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export const NOTIFICATION_COLS = 'id, type, title, body, read_at, related_type, related_id, created_at';
export type NotificationRow = { id: string; type: string; title: string; body: string | null; read_at: string | null; related_type: string | null; related_id: string | null; created_at: string };

export function useNotificationsList(userId: string | null, filter: 'all' | 'unread') {
  return useKeysetList<NotificationRow>({
    queryKey: qk.notifications.list(filter),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('notifications').select(NOTIFICATION_COLS).eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (filter === 'unread') q = q.is('read_at', null);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      return (unwrap(await q) ?? []) as NotificationRow[];
    },
  });
}

export const invalidateNotifications = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: qk.notifications.all });
```

`frontend/src/data/auditLogs.ts`:

```ts
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type AuditFilters = { action: string; dateFrom: string; dateTo: string };
export type AuditRow = { id: string; action: string; entity_type: string; entity_id: string | null; payload: unknown; created_at: string };

export function useAuditLogs(userId: string | null, f: AuditFilters) {
  return useKeysetList<AuditRow>({
    queryKey: qk.auditLogs.list(f),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('audit_logs').select('id, action, entity_type, entity_id, payload, created_at')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (f.action) q = q.eq('action', f.action);
      if (f.dateFrom) q = q.gte('created_at', `${f.dateFrom}T00:00:00Z`);
      if (f.dateTo) q = q.lte('created_at', `${f.dateTo}T23:59:59Z`);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      return (unwrap(await q) ?? []).map((r) => ({ ...r, id: String(r.id) })) as AuditRow[];
    },
  });
}
```

If `audit_logs.id` is numeric in `database.types.ts`, the `String(r.id)` mapping keeps `useKeysetList`'s `{ id: string }` contract; the quoted cursor value is cast back by PostgREST.

`frontend/src/data/pasteBin.ts`:

```ts
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type PasteListRow = { id: string; title: string | null; created_at: string; updated_at: string };

/** The list never loads content (P5); the open item does. */
export function usePasteList(userId: string | null) {
  return useKeysetList<PasteListRow>({
    queryKey: qk.pasteBin.list(),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('paste_bin').select('id, title, created_at, updated_at').eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      return (unwrap(await q) ?? []) as PasteListRow[];
    },
  });
}

export function usePasteItem(id: string | null) {
  return useQuery({
    queryKey: qk.pasteBin.item(id ?? ''),
    enabled: !!id,
    refetchOnWindowFocus: false, // the item seeds an editable textarea
    refetchOnReconnect: false,
    queryFn: async () => unwrap(await db.from('paste_bin').select('id, title, content, created_at, updated_at').eq('id', id as string).maybeSingle()),
  });
}
export const invalidatePasteBin = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.pasteBin.all });
```

- [ ] **Step 5: Switch the pages**

- **Trash:** `const { rows: objects, query, removeRow } = useTrashList(user?.id ?? null);` `loading = query.isPending`. Restore and permanent delete call `removeRow(id)` (instead of `setObjects(prev => prev.filter…)`), then `invalidateObjectLists()` after a restore. Failed actions use `notifyError(e, 'Restore failed')` / `'Delete failed'`. Render `<QueryError what="trash" error={query.error} onRetry={() => query.refetch()} />` instead of the empty state when `query.error` is set; append `<LoadMore query={query} />` after the list.
- **Notifications:** `useNotificationsList(user?.id ?? null, filter)`; `markRead`/`markUnread` use `patchRow`; `markAllRead` invalidates `qk.notifications.all`; error state and `LoadMore` as above. Writes that fail call `notifyError(error, 'Failed to update notification')` (today they fail silently).
- **AuditLogs:** `useAuditLogs(user?.id ?? null, { action: actionFilter, dateFrom, dateTo })`; error state and `LoadMore`.
- **PasteBin:** list from `usePasteList(user?.id ?? null)`, selected item content from `usePasteItem(selectedId)` (seed the textarea in an effect keyed on `selectedId` and the item's `id`, never on every data change); after save/create/delete call `invalidatePasteBin(client)`; error states and `LoadMore`.

- [ ] **Step 6: Run tests and checks** — `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/data frontend/src/components/LoadMore.tsx frontend/src/pages/Trash.jsx frontend/src/pages/Notifications.jsx frontend/src/pages/AuditLogs.jsx frontend/src/pages/PasteBin.jsx
git commit -m "feat(data): keyset-paged Trash, Notifications, Audit logs and PasteBin with error states (R9, D11, P5)"
```

---

### Task 13: Full-list pages — Prompts, Templates, Integrations — and Journal

**Files:**
- Create: `frontend/src/data/templates.ts`, `frontend/src/data/integrations.ts`, `frontend/src/data/journal.ts`, `frontend/src/data/configLists.test.tsx`
- Modify: `frontend/src/data/prompts.ts` (add the hook), `frontend/src/pages/PromptBank.jsx:54-65`, `frontend/src/pages/Templates.jsx:54-65`, `frontend/src/pages/Integrations.jsx:21-31`, `frontend/src/pages/ObjectNew.jsx:59` (templates), `frontend/src/pages/Journal.jsx:45-108`

**Why not keyset here:** these are configuration-sized lists, and PromptBank/Templates filter and collect tags in the browser (`allTags` in `PromptBank.jsx`). They load everything with `fetchAll` (fixes D11's 1,000-row cut-off) instead of "Load more". Journal reads one month's dates and one day's entry, so it has nothing to page.

**Interfaces:**
- Produces:
  - `usePromptsList(userId: string | null)`, `invalidatePrompts(client)`
  - `TEMPLATE_COLS = 'id, name, description, schema, created_at, updated_at'`, `useTemplatesList(userId: string | null)`, `invalidateTemplates(client)`
  - `INTEGRATION_COLS = 'id, name, type, enabled, config, created_at, has_secret'`, `useIntegrationsList(userId: string | null)`, `invalidateIntegrations(client)`
  - `useJournalMonth(userId: string | null, start: string, end: string)` → `string[]` of `entry_date`; `useJournalDay(userId: string | null, date: string | null)` (focus/reconnect refetch off); `invalidateJournal(client)`

- [ ] **Step 1: Write the failing test**

`frontend/src/data/configLists.test.tsx` (same `sb` mock header as Task 8):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { usePromptsList } from './prompts';
import { useTemplatesList } from './templates';
import { useJournalDay } from './journal';

describe('config lists', () => {
  it('prompts load past 1,000 rows and never select *', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `p${i}`, name: `n${i}` }));
    sb.current!.respond = (call) => {
      const range = call.ops.find(([m]) => m === 'range')?.[1] as [number, number];
      return { data: rows.slice(range[0], range[1] + 1), error: null };
    };
    const { result } = renderHook(() => usePromptsList('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toHaveLength(1500));
    const selects = sb.current!.calls.flatMap((c) => c.ops.filter(([m]) => m === 'select').map(([, a]) => a[0]));
    expect(selects.every((s) => s !== '*' && !String(s).includes('output_format'))).toBe(true);
  });

  it('templates surface an error instead of "No templates yet"', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result } = renderHook(() => useTemplatesList('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('a journal day is not refetched on focus while it is being edited', async () => {
    sb.current!.respond = () => ({ data: { id: 'j', content: 'x', entry_date: '2026-10-13', updated_at: 't' }, error: null });
    const { result } = renderHook(() => useJournalDay('u1', '2026-10-13'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const before = sb.current!.calls.length;
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.current!.calls.length).toBe(before);
    focusManager.setFocused(undefined);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

Append to `frontend/src/data/prompts.ts`:

```ts
import { useQuery, type QueryClient } from '@tanstack/react-query';

export const usePromptsList = (userId: string | null) => useQuery({ ...promptsQuery(userId ?? ''), enabled: !!userId });
export const invalidatePrompts = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.prompts.list() });
```

(Merge the import with the existing one at the top of the file.)

`frontend/src/data/templates.ts`:

```ts
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

export const TEMPLATE_COLS = 'id, name, description, schema, created_at, updated_at';
export type TemplateRow = { id: string; name: string; description: string | null; schema: unknown; created_at: string; updated_at: string };

export const templatesQuery = (userId: string) => queryOptions({
  queryKey: qk.templates.list(),
  queryFn: () => fetchAll<TemplateRow>((from, to) => db.from('templates').select(TEMPLATE_COLS).eq('user_id', userId)
    .order('name').order('id').range(from, to)),
});
export const useTemplatesList = (userId: string | null) => useQuery({ ...templatesQuery(userId ?? ''), enabled: !!userId });
export const invalidateTemplates = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.templates.list() });
```

`frontend/src/data/integrations.ts`:

```ts
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

export const INTEGRATION_COLS = 'id, name, type, enabled, config, created_at, has_secret';
export type IntegrationRow = { id: string; name: string; type: string; enabled: boolean; config: unknown; created_at: string; has_secret: boolean };

export const useIntegrationsList = (userId: string | null) => useQuery({
  queryKey: qk.integrations.list(),
  enabled: !!userId,
  queryFn: () => fetchAll<IntegrationRow>((from, to) => db.from('integrations').select(INTEGRATION_COLS)
    .eq('user_id', userId as string).order('name').order('id').range(from, to)),
});
export const invalidateIntegrations = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.integrations.list() });
```

`frontend/src/data/journal.ts`:

```ts
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export function useJournalMonth(userId: string | null, start: string, end: string) {
  return useQuery({
    queryKey: qk.journal.month(start, end),
    enabled: !!userId,
    queryFn: async () => (unwrap(await db.from('journal_entries').select('entry_date')
      .eq('user_id', userId as string).gte('entry_date', start).lte('entry_date', end)) ?? []).map((r) => r.entry_date as string),
  });
}

export function useJournalDay(userId: string | null, date: string | null) {
  return useQuery({
    queryKey: qk.journal.day(date ?? ''),
    enabled: !!userId && !!date,
    refetchOnWindowFocus: false, // seeds the editable entry
    refetchOnReconnect: false,
    queryFn: async () => unwrap(await db.from('journal_entries').select('id, content, entry_date, updated_at')
      .eq('user_id', userId as string).eq('entry_date', date as string).maybeSingle()),
  });
}

export const invalidateJournal = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.journal.all });
```

- [ ] **Step 4: Switch the pages**

- **PromptBank:** `const listQ = usePromptsList(user?.id ?? null); const templates = listQ.data ?? []; const loading = listQ.isPending;`. Save/delete success → `invalidatePrompts(client)` (instead of local array edits, or keep the local edit via `client.setQueryData(qk.prompts.list(), …)` if the page relies on instant feedback). Error: `<QueryError what="prompts" …>` replaces "No prompts yet" when `listQ.error`. Failed writes → `notifyError`.
- **Templates:** same with `useTemplatesList`; `ObjectNew.jsx` line 59 uses `useTemplatesList(user?.id ?? null)` too (its `templates` select used `id, name, schema`, a subset of `TEMPLATE_COLS`).
- **Integrations:** same with `useIntegrationsList(user?.id ?? null)`; replace the "empty list on error" with `QueryError`.
- **Journal:** `const monthQ = useJournalMonth(user?.id ?? null, startStr, endStr)` replaces the dates effect; `const dayQ = useJournalDay(user?.id ?? null, view === 'entry' ? selectedDate : null)` replaces the entry effect. Seed `entry`/`content` state in an effect keyed on `[selectedDate, dayQ.data?.id, dayQ.isSuccess]` that runs **only** when the date changes or the first successful load for that date arrives, never on later data changes (use a ref holding the last seeded date). After `handleSaveEntry` succeeds → `invalidateJournal(client)`.

- [ ] **Step 5: Run tests and checks** — `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data frontend/src/pages/PromptBank.jsx frontend/src/pages/Templates.jsx frontend/src/pages/Integrations.jsx frontend/src/pages/ObjectNew.jsx frontend/src/pages/Journal.jsx
git commit -m "feat(data): complete prompt, template and integration lists; cached Journal (R9, D11, P5)"
```

---

### Task 14: Notification bell

**Files:**
- Modify: `frontend/src/data/notifications.ts`, `frontend/src/components/NotificationCenter.jsx`
- Create: `frontend/src/components/NotificationCenter.test.jsx`

**Interfaces:**
- Produces: `useUnreadCount(userId)` (`head: true` count, key `qk.notifications.unreadCount()`), `useRecentNotifications(userId, enabled)` (10 newest, key `qk.notifications.recent()`).

- [ ] **Step 1: Write the failing test**

`frontend/src/components/NotificationCenter.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithClient } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import NotificationCenter from './NotificationCenter';

describe('NotificationCenter', () => {
  it('shows an error with Retry when the list fails instead of "no notifications"', async () => {
    sb.current.respond = (call) => (call.ops.some(([m, a]) => m === 'select' && a[1]?.head)
      ? { data: null, error: null, count: 2 }
      : { data: null, error: { code: 'PGRST000', message: 'down' } });
    renderWithClient(<MemoryRouter><NotificationCenter /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load notifications."));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
```

The mock's thenable returns `count` from `respond`; confirm `supabaseMock.ts` passes `count` through (it does: `respond` returns the whole result object). If the bell button's accessible name isn't "Notifications", read `NotificationCenter.jsx`'s button `aria-label` and use that.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement and switch**

Append to `frontend/src/data/notifications.ts`:

```ts
export function useUnreadCount(userId: string | null) {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', userId as string).is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useRecentNotifications(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.notifications.recent(),
    enabled: !!userId && enabled,
    queryFn: async () => unwrap(await db.from('notifications')
      .select('id, type, title, body, read_at, related_type, related_id, created_at')
      .eq('user_id', userId as string).order('created_at', { ascending: false }).limit(10)) ?? [],
  });
}
```

(Add `useQuery` to the file's TanStack import.) Note the count uses `select('id', …)` rather than `'*'`.

In `NotificationCenter.jsx`: `unreadCount` from `useUnreadCount(user?.id ?? null).data ?? 0`; `list` from `useRecentNotifications(user?.id ?? null, open)`; `markRead`/`markAllRead` on success call `invalidateNotifications(client)` (refreshes the bell, recent list and the Notifications page). Render `<QueryError what="notifications" error={recentQ.error} onRetry={() => recentQ.refetch()} />` in the panel when `recentQ.error`. Remove the `deferAfterPaint` effect: the count query is cheap and cached. Failed writes → `notifyError`.

- [ ] **Step 4: Run tests and checks** — `npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/notifications.ts frontend/src/components/NotificationCenter.*
git commit -m "feat(data): notification bell through the cache with an error state (R9)"
```

---

### Task 15: Settings, profile and export reads

**Files:**
- Create: `frontend/src/data/profile.ts`, `frontend/src/data/exports.ts`, `frontend/src/data/exports.test.ts`
- Modify: `frontend/src/data/settings.ts`, `frontend/src/pages/Settings.jsx` (providers, profile, export collectors at lines ~305-460), `frontend/src/context/AuthContext.jsx:28-36` (`fetchProfile`), `frontend/src/pages/Login.jsx:70-75`, `frontend/src/pages/Register.jsx:50-55`, `frontend/src/features/dashboard/hooks/useDashboardBulkActions.js:15-20,79-135`

**Interfaces:**
- Produces:
  - `profile.ts`: `PROFILE_COLS = 'email, display_name, timezone, created_at'`, `fetchProfile(userId: string): Promise<ProfileRow | null>`
  - `exports.ts`:
    - `OBJECT_EXPORT_COLS`, `JOURNAL_EXPORT_COLS`, `PASTE_EXPORT_COLS` (every column except the `fts` tsvector)
    - `type ExportObject = Record<string, unknown> & { id: string; domains: Entity[]; tags: Entity[] }`
    - `fetchByIdsChunked<T>(table: string, columns: string, column: string, ids: string[]): Promise<T[]>` (uses `chunk(ids, IN_CHUNK)`)
    - `fetchOwnObjectsForExport(userId: string): Promise<ExportObject[]>` (non-deleted, `updated_at desc, id desc`, with domains and tags attached; replaces `Settings.fetchAllKnowledgeObjectsPaginated` plus its unchunked joins)
    - `fetchObjectsByIdsForExport(ids: string[]): Promise<ExportObject[]>` (replaces the bulk export's `selectInChunks` calls)
    - `fetchAccountExtras(userId: string): Promise<{ journal_entries: Row[]; paste_bin: Row[]; domains: Entity[]; tags: Entity[] }>`
    - `fetchFilteredObjectIds(payload: SearchPayload): Promise<string[]>` (replaces bulk actions' `fetchFilteredIds`, same RPC choice and paging)
  - `settings.ts`: `invalidateAiProviders` is used by Settings

- [ ] **Step 1: Write the failing test**

`frontend/src/data/exports.test.ts` (same `sb` mock header as Task 8, without React):

```ts
import { describe, it, expect, vi } from 'vitest';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { fetchByIdsChunked, fetchObjectsByIdsForExport, fetchFilteredObjectIds, OBJECT_EXPORT_COLS } from './exports';
import { fetchProfile } from './profile';
import { IN_CHUNK } from './chunk';
import type { SearchPayload } from './keys';

describe('exports', () => {
  it('attaches domains and tags to each object and never selects * or fts', async () => {
    sb.current!.respond = (call) => {
      if (call.table === 'knowledge_objects') return { data: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], error: null };
      if (call.table === 'knowledge_object_domains') return { data: [{ knowledge_object_id: 'a', domains: { id: 'd', name: 'Work' } }], error: null };
      return { data: [{ knowledge_object_id: 'b', tags: { id: 't', name: 'ai' } }, { knowledge_object_id: 'b', tags: null }], error: null };
    };
    const objs = await fetchObjectsByIdsForExport(['a', 'b']);
    expect(objs).toEqual([
      { id: 'a', title: 'A', domains: [{ id: 'd', name: 'Work' }], tags: [] },
      { id: 'b', title: 'B', domains: [], tags: [{ id: 't', name: 'ai' }] },
    ]);
    expect(OBJECT_EXPORT_COLS).not.toMatch(/\*|fts/);
  });

  it('collects filtered ids with the same RPC choice and paging as before', async () => {
    const payload = { search_query: 'rust' } as SearchPayload;
    sb.current!.rpc.mockImplementation((_n: string, args: { offset_n: number }) =>
      Promise.resolve({ data: Array.from({ length: args.offset_n === 0 ? 100 : 3 }, (_, i) => ({ id: `${args.offset_n + i}` })), error: null }));
    const ids = await fetchFilteredObjectIds(payload);
    expect(ids).toHaveLength(103);
    expect(sb.current!.rpc.mock.calls.every(([n]) => n === 'search_knowledge_objects_with_snippets')).toBe(true);
  });

  it('splits large id lists so the URL never gets too long', async () => {
    const ids = Array.from({ length: IN_CHUNK * 2 + 7 }, (_, i) => `id${i}`);
    sb.current!.respond = (call) => ({ data: (call.ops.find(([m]) => m === 'in')![1][1] as string[]).map((id) => ({ id })), error: null });
    const rows = await fetchByIdsChunked<{ id: string }>('knowledge_object_tags', 'knowledge_object_id, tag_id, tags(id, name)', 'knowledge_object_id', ids);
    expect(rows).toHaveLength(ids.length);
    const inCalls = sb.current!.calls.filter((c) => c.table === 'knowledge_object_tags');
    expect(inCalls).toHaveLength(3);
    expect(inCalls.every((c) => (c.ops.find(([m]) => m === 'in')![1][1] as string[]).length <= IN_CHUNK)).toBe(true);
  });

  it('a failed chunk fails the whole export instead of silently dropping rows', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    await expect(fetchByIdsChunked('tags', 'id', 'id', ['a'])).rejects.toMatchObject({ code: 'PGRST000' });
  });

  it('profile is null when the row is missing', async () => {
    sb.current!.respond = () => ({ data: null, error: null });
    expect(await fetchProfile('u1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

`frontend/src/data/profile.ts`:

```ts
import { db } from './client';
import { unwrap } from './unwrap';

export const PROFILE_COLS = 'email, display_name, timezone, created_at';
export type ProfileRow = { email: string | null; display_name: string | null; timezone: string | null; created_at: string };

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  return unwrap(await db.from('users').select(PROFILE_COLS).eq('id', userId).maybeSingle()) as ProfileRow | null;
}
```

`frontend/src/data/exports.ts`:

```ts
import { supabase } from '../lib/supabase';
import { unwrap } from './unwrap';
import { chunk, IN_CHUNK } from './chunk';
import { fetchAll } from './fetchAll';
import { fetchDomains, fetchTags, type Entity } from './taxonomy';
import type { SearchPayload } from './keys';

type AnyRow = Record<string, unknown>;
export type ExportObject = AnyRow & { id: string; domains: Entity[]; tags: Entity[] };

// "Export my data" means every column, but never the fts search index (P5). Confirm against
// database.types.ts: add any column present there (except fts) that is missing here.
export const OBJECT_EXPORT_COLS = 'id, user_id, type, title, source, content, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at, last_viewed_at, revision';
export const JOURNAL_EXPORT_COLS = 'id, user_id, entry_date, content, created_at, updated_at';
export const PASTE_EXPORT_COLS = 'id, user_id, title, content, created_at, updated_at';

// Export collectors are one-off actions, not cached queries. They take table names dynamically,
// so they use the untyped client.
export async function fetchByIdsChunked<T = AnyRow>(table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, IN_CHUNK)) {
    out.push(...((unwrap(await supabase.from(table).select(columns).in(column, part)) ?? []) as T[]));
  }
  return out;
}

type JoinRow = { knowledge_object_id: string; domains?: Entity | null; tags?: Entity | null };

function groupBy(rows: JoinRow[], pick: (r: JoinRow) => Entity | null | undefined): Record<string, Entity[]> {
  const out: Record<string, Entity[]> = {};
  for (const r of rows) {
    const v = pick(r);
    if (v) (out[r.knowledge_object_id] ??= []).push(v);
  }
  return out;
}

async function attachTaxonomy(objs: Array<AnyRow & { id: string }>): Promise<ExportObject[]> {
  const ids = objs.map((o) => o.id);
  const [kod, kot] = await Promise.all([
    fetchByIdsChunked<JoinRow>('knowledge_object_domains', 'knowledge_object_id, domain_id, domains(id, name)', 'knowledge_object_id', ids),
    fetchByIdsChunked<JoinRow>('knowledge_object_tags', 'knowledge_object_id, tag_id, tags(id, name)', 'knowledge_object_id', ids),
  ]);
  const domains = groupBy(kod, (r) => r.domains);
  const tags = groupBy(kot, (r) => r.tags);
  return objs.map((o) => ({ ...o, domains: domains[o.id] ?? [], tags: tags[o.id] ?? [] }));
}

/** All of the user's non-deleted objects, newest first (the Markdown ZIP numbers files in this order). */
export async function fetchOwnObjectsForExport(userId: string): Promise<ExportObject[]> {
  const objs = await fetchAll<AnyRow & { id: string }>((from, to) => supabase.from('knowledge_objects')
    .select(OBJECT_EXPORT_COLS).eq('user_id', userId).eq('is_deleted', false)
    .order('updated_at', { ascending: false }).order('id', { ascending: false }).range(from, to));
  return attachTaxonomy(objs);
}

export async function fetchObjectsByIdsForExport(ids: string[]): Promise<ExportObject[]> {
  return attachTaxonomy(await fetchByIdsChunked<AnyRow & { id: string }>('knowledge_objects', OBJECT_EXPORT_COLS, 'id', ids));
}

export async function fetchAccountExtras(userId: string) {
  const [journal_entries, paste_bin, domains, tags] = await Promise.all([
    fetchAll<AnyRow>((from, to) => supabase.from('journal_entries').select(JOURNAL_EXPORT_COLS).eq('user_id', userId)
      .order('entry_date', { ascending: false }).order('id').range(from, to)),
    fetchAll<AnyRow>((from, to) => supabase.from('paste_bin').select(PASTE_EXPORT_COLS).eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    fetchDomains(userId),
    fetchTags(userId),
  ]);
  return { journal_entries, paste_bin, domains, tags };
}

/** Ids of every object matching the applied dashboard filters ("export all matching"). */
export async function fetchFilteredObjectIds(payload: SearchPayload): Promise<string[]> {
  const PAGE = 100;
  const rpc = payload.search_query ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = (unwrap(await supabase.rpc(rpc, { ...payload, limit_n: PAGE, offset_n: offset })) ?? []) as { id: string }[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < PAGE) return ids;
  }
}
```

**Switch the callers (keep every file name, format and JSON shape the same):**

- `Settings.jsx`:
  - Delete `fetchAllKnowledgeObjectsPaginated` and the three copies of the `domainsByObj` / `tagsByObj` grouping.
  - `downloadFullAccountData`: `const [objects, extras] = await Promise.all([fetchOwnObjectsForExport(user.id), fetchAccountExtras(user.id)]);` then build `parts` from `objects`, `extras.journal_entries`, `extras.paste_bin`, `extras.domains`, `extras.tags` exactly as today.
  - `downloadBackupJson`: `const normalized = await fetchOwnObjectsForExport(user.id);` then the existing `parts` loop.
  - `downloadBackupMarkdownZip`: `const objs = await fetchOwnObjectsForExport(user.id);` and inside the loop use `buildObjectMarkdown(o, include)` directly (each `o` already has `domains` and `tags`).
  - Each `catch` keeps `setBackupError(getErrorMessage(err, 'Export failed'))` and adds `reportError(err)`.
- `useDashboardBulkActions.js`:
  - Delete `IN_CHUNK` and `selectInChunks`.
  - `fetchFilteredIds` body becomes `return fetchFilteredObjectIds(appliedRpcPayload ?? {});`.
  - In `handleExportSelected`, replace the `selectInChunks` block and its grouping with `const objs = await fetchObjectsByIdsForExport(ids); if (!objs.length) throw new Error('No objects found'); const objMap = Object.fromEntries(objs.map((o) => [o.id, o]));` and keep the rest (ZIP building) unchanged.
- `AuthContext.jsx`: delete the local `fetchProfile`; import it from `../data/profile`. The call site in `verifyAndEnrichUser` already has `.catch(() => null)`, so a failed or missing profile still maps to defaults.
- `Login.jsx` (line ~70) and `Register.jsx` (line ~50): replace their inline `users` selects with `fetchProfile(id)`, keeping each caller's error handling.

- [ ] **Step 4: Settings providers and profile**

- `Settings.jsx` `load()` providers part → `useAiProviders(user?.id ?? null)` (from Task 11's `settings.ts`); after add/delete provider succeed → `invalidateAiProviders(client)`; failed writes → `notifyError`.
- Profile save in `saveProfile` already writes `users`; after it succeeds nothing else caches the profile (AuthContext holds it), so no invalidation is needed.

- [ ] **Step 5: Run tests and checks** — `npm test && npm run typecheck && npm run lint && npm run build` → PASS. Manually run each Settings export in `npm run dev` against your account and compare the downloaded file's structure with one exported from production before this change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data frontend/src/pages/Settings.jsx frontend/src/context/AuthContext.jsx frontend/src/pages/Login.jsx frontend/src/pages/Register.jsx frontend/src/features/dashboard/hooks/useDashboardBulkActions.js
git commit -m "feat(data): move profile, settings and export reads into src/data with chunked id filters (P5, R10)"
```

---

### Task 16: Read guard, final verification and hand-off

**Files:**
- Modify: `frontend/eslint.config.js`
- Create: `docs/superpowers/plans/2026-10-13-phase-0a-part1-handoff.md` (owner checklist)

**Interfaces:**
- Produces: lint error `Supabase reads belong in src/data` for `supabase.from(…).select(…)` and non-write `supabase.rpc(…)` outside `src/data/**`.

- [ ] **Step 1: Add the guard (it should fail first)**

In `frontend/eslint.config.js`, add a final config object:

```js
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/data/**', 'src/**/*.test.*', 'src/test/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          // supabase.from('x').select(...) — a read. Writes chain .insert/.update/.delete/.upsert first.
          selector: "CallExpression[callee.property.name='select'] > MemberExpression.callee > CallExpression.object[callee.object.name='supabase'][callee.property.name='from']",
          message: 'Supabase reads belong in src/data (see docs/superpowers/specs/2026-10-13-phase-0a-part1-data-layer-design.md).',
        },
        {
          // supabase.rpc('name') for anything that isn't a known write.
          selector: "CallExpression[callee.object.name='supabase'][callee.property.name='rpc'][arguments.0.value!=/^(create_domain|create_tag|touch_object_view|delete_object_permanently|share_object_by_email|save_prompt_output_as_object|report_client_error|secure_password_change|restore_object_version)$/]",
          message: 'Supabase read RPCs belong in src/data. If this RPC writes, add it to the allow-list in eslint.config.js.',
        },
      ],
    },
  },
```

Run `npm run lint`. Every remaining hit is either a read that a task missed (move it into the right `src/data` module, with a test if it has logic) or a write RPC missing from the allow-list (check its SQL: if it only writes, add its name). Confirm names like `restore_object_version` and `secure_password_change` exist (`grep -rn "rpc('" src`); remove any allow-list name that the app doesn't call.

- [ ] **Step 2: Prove the guard works**

Add `supabase.from('tags').select('id');` to any page, run `npm run lint`, expect the guard message, then remove it.

- [ ] **Step 3: Full verification**

Run from `frontend/`: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle && npm audit --omit=dev --audit-level=high`. Run `bash supabase/local-test/run.sh` from the repo root. All must pass; paste the summary lines into the PR.

- [ ] **Step 4: Bundle size record**

Before this branch (on `main`): `npm run build` and note the gzipped size of the entry chunk (`dist/assets/index-*.js`) from Vite's output. On this branch: same. Record both in the PR. Also confirm with `grep -l "persistQueryClient\|idb-keyval" dist/assets/*.js` that the new packages are **not** in `blocknote-*.js`.

- [ ] **Step 5: Owner hand-off checklist**

Create `docs/superpowers/plans/2026-10-13-phase-0a-part1-handoff.md`:

```markdown
# Phase 0a part 1: owner hand-off

1. Back up production: `pg_dump` to `supabase/backups/pre-0a1-<date>.dump` (same command as the −1C runbook).
2. Push the migration: `supabase db push` (adds `client_errors` and `report_client_error`). Then `list_migrations` in the MCP shows `20261013000001`.
3. Regenerate types: `cd frontend && npm run gen:types`; commit if it changed (it will now include `client_errors`).
4. Advisors: run the Supabase security and performance advisors; expect no new errors.
5. Merge the PR; wait for the Vercel deploy of `pks2`.
6. Manual checks in production (record results in the PR):
   - Open an object, reload, open it again: `performance.mark` shows < 100 ms to content from cache (DevTools → Performance, or `performance.getEntriesByType('mark')`).
   - Change a dashboard filter: the old rows stay until new ones arrive; no skeleton flash.
   - DevTools → Network → Offline: the offline banner appears, cached pages still open; back online shows "Back online."
   - Force a 500: in DevTools, block `*/rest/v1/rpc/get_dashboard_stats*` with a 500 response override, reload the dashboard, then query `select kind, message, route from client_errors order by created_at desc limit 5;` and see the row.
   - Log out, then DevTools → Application → IndexedDB → `keyval-store`: no `pks-query-cache:*` key remains.
```

For the `performance.mark` check to have something to read, add in `ObjectDetail.jsx` (one line, in the effect that runs when `object` first becomes non-null for an id): `performance.mark('pks:object-visible');` and in `useObjectDetail`'s first render for a new id `performance.mark('pks:object-open');`. The owner measures with `performance.measure('open', 'pks:object-open', 'pks:object-visible')`.

- [ ] **Step 6: Commit**

```bash
git add frontend/eslint.config.js frontend/src docs/superpowers/plans/2026-10-13-phase-0a-part1-handoff.md
git commit -m "chore(lint): keep Supabase reads in src/data; add the part 1 hand-off checklist"
```

- [ ] **Step 7: Open the PR**

Title: `Phase 0a part 1: data layer, errors and TypeScript`. Body: the findings table from this plan's header, the verification output from Step 3, the bundle sizes from Step 4, a link to the hand-off checklist, and the attribution line. Don't merge; the owner runs the hand-off.
