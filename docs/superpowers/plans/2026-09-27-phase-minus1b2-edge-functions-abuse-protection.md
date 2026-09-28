# Phase −1B2: Edge Functions & Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PKS safe for **open signup with shared server AI keys**. It caps AI spend per user, per provider and globally; server-owned prompt runs; hardened webhooks; CAPTCHA plus email confirmation on auth. It fixes these audit findings:

| Area | Findings |
|---|---|
| Spend and prompt runs | S2, B19, R14, B8, D8, D13 |
| Webhooks | B18, S7, S8 |
| Auth | S12 |

**Architecture:**
- **Shared helpers:** both Deno edge functions share `supabase/functions/_shared/` (CORS that fails closed, JSON responses, user-scoped client) and a pinned `deno.json`.
- **Testable logic:** pure logic lives in `lib.ts` files with `deno test` suites.
- **Usage counters:** one `usage_counters` table with two RPCs replaces the two ad-hoc quota tables.
- **Server-owned runs:** `run-prompt` loads the object itself, under the user's RLS, and writes the `prompt_runs` row. The client no longer inserts runs.
- **CAPTCHA:** Cloudflare Turnstile is wired through Supabase Auth's built-in captcha support.

**Tech Stack:**
- Deno 2 edge functions, with `npm:@supabase/supabase-js@2.117.2` and `npm:@anthropic-ai/sdk@0.128.0`
- Supabase CLI, pgTAP
- React 19 + Vitest
- Cloudflare Turnstile

**Spec:**
- [`docs/plans/2026-09-26-ultimate-knowledge-base-roadmap.md`](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md): −1B scope, decisions 1 and 2 (open signup; server keys with a hard cap), and the migration rules.
- [`docs/plans/2026-09-26-codebase-audit.md`](../../plans/2026-09-26-codebase-audit.md): finding IDs.

**Depends on:**
- Plan −1A merged: the frontend CI and `ObjectDetail` changes.
- Plan −1B1 Tasks 1–8 merged. This plan uses its pgTAP harness (`tests.create_user`, `tests.act_as`), `can_read_object` / `can_edit_object`, and the `prompt_runs` policies.

## Global Constraints

- **Working directory:** commands run from the repo root unless a step says otherwise.
  - Edge function tests: `deno test --allow-env --allow-net=none supabase/functions`.
  - DB tests: `npx supabase test db`.
- **Deno imports go through `supabase/functions/deno.json` only.** No `https://esm.sh/...` URLs and no unpinned `npm:` specifiers.
- **Claude models:** these are the owner's choice (decision 2). The first two use adaptive thinking.

  | Route | Model | Effort | `max_tokens` | Extras |
  |---|---|---|---|---|
  | Server key | `claude-sonnet-5` | `medium` | 4096 | none |
  | User's own key | `claude-opus-5` (default) or `claude-sonnet-5` | default | 16000 | `claude-opus-5` keeps the `server-side-fallback-2026-07-01` beta with `fallbacks: "default"` |

  - Claude clients use `maxRetries: 0` and `timeout: 110_000`, so a request can't outlive the 150 s edge limit.
- **Migrations:** Tasks 2/3/6 use `supabase/migrations/20260928000001_…`, `…000002_…`, `…000003_…` (dated the day this plan's edge functions work starts, after −1B1's migrations). New SECURITY DEFINER functions:
  - `SET search_path = public`
  - `REVOKE EXECUTE … FROM PUBLIC, anon`
  - explicit `GRANT`
  - Policies use `(SELECT auth.uid())` and `TO authenticated`.
- **Expand → contract:** keep backward compatibility until the gated Task 10.
  - `run-prompt` still accepts the old `objectTitle`/`objectContent` body.
  - The old quota tables stay.
  - `prompt_templates.output_format` stays.
  - The legacy `X-PKS-Signature` header is still sent.
- **Secrets never reach the browser:** API keys, webhook secrets, the Turnstile secret key.
- **Checks after every task:**
  - `deno test --allow-env --allow-net=none supabase/functions` (from Task 1 on)
  - `npx supabase db reset && npx supabase test db`
  - in `frontend/`: `npm run lint && npm test && npm run build`
- **Commits:** one per task, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Production:** never deploy functions or change hosted settings inside a task. Task 11 is the owner's checklist.

## Review Focus

1. **A burst of new accounts.** 100 throwaway accounts × the per-user cap must not exceed the global daily cap. Task 2 test (global counter) and Task 4 manual check with a tiny global limit.
2. **Old app versions after deploy.** A pre-update client sends `objectTitle`/`objectContent` and inserts its own run rows. The function must still answer it, and the client's own inserts must still pass RLS. Task 4 test for the legacy body.
3. **Failed or refused AI calls.** Upstream errors and refusals return a clear message, record a `failed` run, and don't hang past the edge timeout. Task 4 tests plus a manual check with an invalid key.
4. **Double clicks on "Save as object".** Two clicks, or a retry after a network error, create exactly one object. Task 3 test for idempotency.
5. **CAPTCHA expiry or script blocked.** The form tells the user to retry the check instead of failing silently, and dev without a site key still works. Task 8 tests.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/functions/deno.json` | create | Pinned import map for all functions and tests |
| `supabase/functions/_shared/cors.ts` (+test) | create | CORS headers from `PKS_APP_ORIGIN`; `null` when unset (fail closed) |
| `supabase/functions/_shared/http.ts` | create | `json()` response helper |
| `supabase/functions/_shared/supabase.ts` | create | `getUserClient(req)`, `getAdminClient()` |
| `supabase/functions/run-prompt/lib.ts` (+test) | create | Request parsing, model choice, message building, provider config |
| `supabase/functions/run-prompt/index.ts` | rewrite | Orchestration: auth → validate → limits → object → AI → run row |
| `supabase/functions/webhook-deliver/lib.ts` (+test) | create | SSRF guards (moved), event allowlist, signing, delivery counting |
| `supabase/functions/webhook-deliver/index.ts` | modify | Uses lib, DB rate limit, service-role secret read |
| `supabase/migrations/20260928000001_usage_counters.sql` | create | `usage_counters`, `consume_usage`, `consume_global_usage` |
| `…000011_prompt_runs_server_owned.sql` | create | Run metadata columns, `save_prompt_output_as_object` |
| `…000012_webhook_secrets_and_caps.sql` | create | Write-only secret, `has_secret`, 10-webhook cap |
| `…000013_contract_quota_and_output_format.sql` | create (gated) | Drops legacy quota tables/functions, `output_format` |
| `frontend/src/lib/turnstile.js`, `frontend/src/components/Turnstile.jsx` (+test) | create | CAPTCHA loader and widget |
| `frontend/src/pages/ObjectDetail.jsx` | modify | New run flow |
| `frontend/src/pages/Integrations.jsx`, `frontend/src/constants/index.js` | modify | Write-only secret, webhook-only type |
| `frontend/src/pages/PromptBank.jsx` | modify | Remove the output format field |
| `frontend/src/pages/Register.jsx`, `Login.jsx`, `ForgotPassword.jsx`, `Settings.jsx` | modify | Captcha token |
| `frontend/vercel.json`, `frontend/.env.example`, `supabase/config.toml` | modify | CSP, env var, local captcha and function config |
| `.github/workflows/ci.yml` | modify | Deno job |

---

### Task 1: Deno toolchain and shared helpers

**Files:**
- Create:
  - `supabase/functions/deno.json`
  - `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/cors.test.ts`
  - `supabase/functions/_shared/http.ts`, `supabase/functions/_shared/supabase.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces:
  - `corsHeaders(origin?: string | null): Record<string, string> | null`
  - `json(body: unknown, status?: number, headers?: Record<string, string>): Response`
  - `getUserClient(req: Request): Promise<{ supabase: SupabaseClient; user: User } | null>`
  - `getAdminClient(): SupabaseClient`

- [ ] **Step 1: Install Deno** (owner action if missing).
  1. Run `deno --version`.
  2. If it's missing, run `powershell -c "irm https://deno.land/install.ps1 | iex"` (Windows) or see https://docs.deno.com/runtime/getting_started/installation/.
  3. Re-open the terminal. Expected: `deno 2.x`.

- [ ] **Step 2: Create `supabase/functions/deno.json`:**

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.117.2",
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@0.128.0",
    "@std/assert": "jsr:@std/assert@1"
  }
}
```

- [ ] **Step 3: Point both functions at it and turn on JWT verification.** Append to `supabase/config.toml`:

```toml
[functions.run-prompt]
verify_jwt = true
import_map = "./functions/deno.json"

[functions.webhook-deliver]
verify_jwt = true
import_map = "./functions/deno.json"
```

In the existing `[edge_runtime]` section, set `deno_version = 2`.

- [ ] **Step 4: Write the failing test.** Create `supabase/functions/_shared/cors.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { corsHeaders } from "./cors.ts";

Deno.test("returns headers for the configured origin", () => {
  const h = corsHeaders("https://pks.example");
  assertEquals(h?.["Access-Control-Allow-Origin"], "https://pks.example");
  assertEquals(h?.["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

Deno.test("fails closed when no origin is configured", () => {
  assertEquals(corsHeaders(undefined), null);
  assertEquals(corsHeaders(""), null);
  assertEquals(corsHeaders("*"), null);
});
```

- [ ] **Step 5: Run it and confirm it fails.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: FAIL, "Module not found … cors.ts".

- [ ] **Step 6: Implement the shared helpers.** Create `supabase/functions/_shared/cors.ts`:

```ts
/**
 * CORS headers for the single allowed app origin (PKS_APP_ORIGIN).
 * Returns null when the origin is unset or a wildcard, so callers fail closed
 * instead of serving every site.
 */
export function corsHeaders(origin: string | null | undefined = Deno.env.get("PKS_APP_ORIGIN")): Record<string, string> | null {
  if (!origin || origin === "*") return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
```

Create `supabase/functions/_shared/http.ts`:

```ts
/** JSON response with the given status and extra headers (e.g. CORS). */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
```

Create `supabase/functions/_shared/supabase.ts`:

```ts
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Client that runs as the caller (RLS enforced), plus the verified user; null if unauthenticated. */
export async function getUserClient(req: Request): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

/** Service-role client. Only for reads/writes the user's own RLS cannot do (secrets, global counters). */
export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}
```

- [ ] **Step 7: Run it and confirm it passes.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: `ok | 2 passed`.

- [ ] **Step 8: Commit.**

```bash
git add supabase/functions/deno.json supabase/functions/_shared supabase/config.toml
git commit -m "chore(functions): pinned import map, fail-closed CORS and shared client helpers"
```

---

### Task 2: One usage-counter table for rate limits and daily caps

**Files:**
- Create: `supabase/migrations/20260928000001_usage_counters.sql`, `supabase/tests/database/10_usage.test.sql`

**Interfaces:**
- Produces:
  - `public.consume_usage(p_scope text, p_limit int, p_window_seconds int) RETURNS jsonb`. Returns `{count, limited, retry_after_sec}` for the caller.
  - `public.consume_global_usage(p_scope text, p_limit int, p_window_seconds int) RETURNS jsonb`. Same shape; **service_role only**.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/10_usage.test.sql`:

```sql
BEGIN;
SELECT plan(6);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');

SELECT tests.act_as('alice');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, false, 'first call allowed');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, false, 'second call allowed');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'limited')::boolean, true, 'third call over the limit');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT is((public.consume_usage('t', 2, 86400) ->> 'count')::int, 1, 'counters are per user');
SELECT throws_ok($$SELECT public.consume_global_usage('g', 1, 86400)$$, '42501', NULL,
  'users cannot touch the global counter');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;
SELECT is((public.consume_global_usage('g', 5, 86400) ->> 'count')::int, 1, 'service role can count globally');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `10_usage` fails, "function public.consume_usage does not exist".

- [ ] **Step 3: Write the migration** `supabase/migrations/20260928000001_usage_counters.sql`:

```sql
-- Fixed-window counters for per-user rate limits/daily caps and global caps.
-- Replaces rate_limit_run_prompt and server_key_daily_usage (dropped in the contract task).
CREATE TABLE IF NOT EXISTS public.usage_counters (
  scope   text        NOT NULL,
  subject uuid        NOT NULL,  -- user id, or the zero uuid for global counters
  bucket  timestamptz NOT NULL,
  count   int         NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject, bucket)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER functions below touch it.

CREATE OR REPLACE FUNCTION public._consume_counter(p_scope text, p_subject uuid, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count  int;
BEGIN
  INSERT INTO public.usage_counters (scope, subject, bucket, count)
  VALUES (p_scope, p_subject, v_bucket, 1)
  ON CONFLICT (scope, subject, bucket) DO UPDATE SET count = usage_counters.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.usage_counters
  WHERE scope = p_scope AND subject = p_subject
    AND bucket < v_bucket - make_interval(secs => p_window_seconds);

  RETURN jsonb_build_object(
    'count', v_count,
    'limited', v_count > p_limit,
    'retry_after_sec', ceil(extract(epoch FROM v_bucket + make_interval(secs => p_window_seconds) - now()))::int
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public._consume_counter(text, uuid, int, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_usage(p_scope text, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true, 'retry_after_sec', 60);
  END IF;
  RETURN public._consume_counter(p_scope, auth.uid(), p_limit, p_window_seconds);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_usage(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_global_usage(p_scope text, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._consume_counter(p_scope, '00000000-0000-0000-0000-000000000000', p_limit, p_window_seconds);
$$;
REVOKE EXECUTE ON FUNCTION public.consume_global_usage(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_global_usage(text, int, int) TO service_role;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `10_usage .. ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260928000001_usage_counters.sql supabase/tests/database/10_usage.test.sql
git commit -m "feat(db): usage counters for per-user and global rate limits and caps"
```

---

### Task 3: Server-owned prompt runs and idempotent "save output as object"

This covers audit findings B8 (two run rows per run), D13 (runs stuck in `running`) and D8 ("save as object" isn't atomic, so retries create duplicates).

**Files:**
- Create: `supabase/migrations/20260928000002_prompt_runs_server_owned.sql`, `supabase/tests/database/11_prompt_output.test.sql`

**Interfaces:**
- Produces:
  - New `prompt_runs` columns: `provider text`, `model text`, `input_tokens int`, `output_tokens int`, `truncated boolean NOT NULL DEFAULT false`, and `saved_object_id uuid REFERENCES knowledge_objects ON DELETE SET NULL`.
  - `public.save_prompt_output_as_object(p_run_id uuid, p_title text, p_content text) RETURNS uuid`.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/11_prompt_output.test.sql`:

```sql
BEGIN;
SELECT plan(5);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Source');
INSERT INTO public.prompt_runs (id, user_id, knowledge_object_id, status, output, provider, model)
VALUES ('00000000-0000-0000-0000-0000000000e1', tests.uid('alice'),
        '00000000-0000-0000-0000-000000000001', 'completed', 'Answer', 'anthropic', 'claude-sonnet-5');

SELECT tests.act_as('alice');
SELECT set_config('tests.new_obj',
  public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'Summary', 'Edited answer')::text, true);
SELECT is((SELECT content FROM public.knowledge_objects WHERE id = current_setting('tests.new_obj')::uuid),
  'Edited answer', 'creates an object with the (edited) output');
SELECT is((SELECT count(*)::int FROM public.link_edges
           WHERE from_object_id = '00000000-0000-0000-0000-000000000001'
             AND to_object_id = current_setting('tests.new_obj')::uuid), 1, 'links it from the source object');
SELECT is(public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'Summary', 'Edited answer')::text,
  current_setting('tests.new_obj'), 'a second call returns the same object (no duplicates)');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects WHERE type = 'prompt'), 1, 'exactly one object created');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT throws_ok($$SELECT public.save_prompt_output_as_object('00000000-0000-0000-0000-0000000000e1', 'x', 'y')$$,
  '42501', NULL, 'cannot save someone else''s run');

SELECT * FROM finish();
ROLLBACK;
```


- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `11_prompt_output` fails because the `provider` column doesn't exist.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260928000002_prompt_runs_server_owned.sql`:

```sql
-- B8/D13: run-prompt writes one run row per call (completed or failed); clients stop inserting.
ALTER TABLE public.prompt_runs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS input_tokens int,
  ADD COLUMN IF NOT EXISTS output_tokens int,
  ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_object_id uuid REFERENCES public.knowledge_objects(id) ON DELETE SET NULL;

-- D8: create the output object, its link and the run back-reference in one transaction.
-- Idempotent per run, so double clicks and retries never create duplicates.
CREATE OR REPLACE FUNCTION public.save_prompt_output_as_object(p_run_id uuid, p_title text, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.prompt_runs;
  v_new uuid;
BEGIN
  SELECT * INTO v_run FROM public.prompt_runs WHERE id = p_run_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found' USING ERRCODE = '42501';
  END IF;
  IF v_run.saved_object_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.knowledge_objects WHERE id = v_run.saved_object_id AND NOT is_deleted) THEN
    RETURN v_run.saved_object_id;
  END IF;

  INSERT INTO public.knowledge_objects (user_id, type, title, content)
  VALUES (v_uid, 'prompt', left(coalesce(nullif(trim(p_title), ''), 'Prompt output'), 500), nullif(trim(p_content), ''))
  RETURNING id INTO v_new;

  IF public.can_edit_object(v_run.knowledge_object_id) THEN
    INSERT INTO public.link_edges (from_object_id, to_object_id, relationship_type)
    VALUES (v_run.knowledge_object_id, v_new, 'references')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.prompt_runs SET saved_object_id = v_new WHERE id = p_run_id;
  RETURN v_new;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_prompt_output_as_object(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_prompt_output_as_object(uuid, text, text) TO authenticated, service_role;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `11_prompt_output .. ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260928000002_prompt_runs_server_owned.sql supabase/tests/database/11_prompt_output.test.sql
git commit -m "feat(db): run metadata columns and atomic, idempotent save-output-as-object"
```

---

### Task 4: `run-prompt` v2: validate first, cap spend, cheaper server model, server-owned run row

This fixes audit findings:
- **B19:** quota is consumed before validation.
- **S2:** the server Claude key can be drained.
- **R14:** the Claude timeout and retries can exceed the edge limit, and truncation is silent.
- **B8/D13:** the function now writes the run row.

**Files:**
- Create: `supabase/functions/run-prompt/lib.ts`, `supabase/functions/run-prompt/lib.test.ts`
- Rewrite: `supabase/functions/run-prompt/index.ts`
- Keep: `supabase/functions/run-prompt/deepseekKey.ts`

**Interfaces:**
- Consumes (from Tasks 1–3): `corsHeaders`, `json`, `getUserClient`, `getAdminClient`, `consume_usage`, `consume_global_usage`, and the `prompt_runs` columns.
- Produces:
  - **HTTP body (new):** `{ promptText, object_id, prompt_template_id?, provider?, model?, user_provider_id? }`.
  - **HTTP body (legacy, still accepted):** `{ promptText, objectTitle, objectContent, … }` with no `object_id`.
  - **Response:** `{ output, provider, model, truncated, run?: { id, created_at } }`. `run` is present only when `object_id` was sent.

- [ ] **Step 1: Write the failing tests.** Create `supabase/functions/run-prompt/lib.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { buildUserMessage, LIMITS, parseRunRequest, pickModel } from "./lib.ts";

Deno.test("server-key Claude runs are pinned to Sonnet 5", () => {
  assertEquals(pickModel("anthropic", "claude-opus-5", true), "claude-sonnet-5");
  assertEquals(pickModel("anthropic", "", true), "claude-sonnet-5");
});

Deno.test("own-key Claude runs default to Opus 5 and may choose Sonnet 5", () => {
  assertEquals(pickModel("anthropic", "", false), "claude-opus-5");
  assertEquals(pickModel("anthropic", "claude-sonnet-5", false), "claude-sonnet-5");
  assertEquals(pickModel("anthropic", "gpt-9", false), "claude-opus-5");
});

Deno.test("buildUserMessage flags truncated content", () => {
  const long = "x".repeat(LIMITS.MAX_OBJECT_CONTENT + 10);
  const { message, truncated } = buildUserMessage("Title", long, "Summarize");
  assertEquals(truncated, true);
  assertEquals(message.includes("x".repeat(LIMITS.MAX_OBJECT_CONTENT + 1)), false);
  assertEquals(buildUserMessage("", "", "Just this").message, "Just this");
});

Deno.test("parseRunRequest validates before anything is spent", () => {
  assertEquals(parseRunRequest(null).ok, false);
  assertEquals(parseRunRequest({ promptText: "" }).ok, false);
  assertEquals(parseRunRequest({ promptText: "a".repeat(LIMITS.MAX_PROMPT_TEXT + 1) }).ok, false);
  assertEquals(parseRunRequest({ promptText: "Hi", object_id: "not-a-uuid" }).ok, false);
  const ok = parseRunRequest({ promptText: "Hi", object_id: "00000000-0000-0000-0000-000000000001", provider: "anthropic" });
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.value.objectId, "00000000-0000-0000-0000-000000000001");
});

Deno.test("parseRunRequest accepts the legacy body from old clients", () => {
  const legacy = parseRunRequest({ promptText: "Hi", objectTitle: "T", objectContent: "C" });
  assertEquals(legacy.ok, true);
  if (legacy.ok) {
    assertEquals(legacy.value.objectId, null);
    assertEquals(legacy.value.legacyTitle, "T");
  }
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: FAIL, "Module not found … run-prompt/lib.ts".

- [ ] **Step 3: Implement `supabase/functions/run-prompt/lib.ts`:**

```ts
/** Pure run-prompt logic: provider config, request validation, model choice, message building. */

export type Provider = "deepseek" | "anthropic";

export const LIMITS = { MAX_PROMPT_TEXT: 16_384, MAX_OBJECT_TITLE: 200, MAX_OBJECT_CONTENT: 50_000 } as const;

export const PROVIDERS: Record<Provider, {
  label: string;
  serverKeyEnv: string;
  userModels: string[];
  userDefault: string;
  serverModels: string[];
  serverDefault: string;
}> = {
  deepseek: {
    label: "DeepSeek",
    serverKeyEnv: "DEEPSEEK_API_KEY",
    userModels: ["deepseek-chat", "deepseek-reasoner"],
    userDefault: "deepseek-chat",
    serverModels: ["deepseek-chat", "deepseek-reasoner"],
    serverDefault: "deepseek-chat",
  },
  anthropic: {
    label: "Claude",
    serverKeyEnv: "ANTHROPIC_API_KEY",
    userModels: ["claude-opus-5", "claude-sonnet-5"],
    userDefault: "claude-opus-5",
    // Shared server key: the cheaper model only (owner decision 2026-09-27).
    serverModels: ["claude-sonnet-5"],
    serverDefault: "claude-sonnet-5",
  },
};

export function isProvider(v: unknown): v is Provider {
  return v === "deepseek" || v === "anthropic";
}

/** The model actually used: requested if allowed for this key type, else the default. */
export function pickModel(provider: Provider, requested: string, usingServerKey: boolean): string {
  const cfg = PROVIDERS[provider];
  const allowed = usingServerKey ? cfg.serverModels : cfg.userModels;
  return allowed.includes(requested) ? requested : (usingServerKey ? cfg.serverDefault : cfg.userDefault);
}

export function buildUserMessage(title: string, content: string, prompt: string): { message: string; truncated: boolean } {
  const t = title.slice(0, LIMITS.MAX_OBJECT_TITLE);
  const truncated = content.length > LIMITS.MAX_OBJECT_CONTENT;
  const c = content.slice(0, LIMITS.MAX_OBJECT_CONTENT);
  if (!t && !c) return { message: prompt, truncated: false };
  return { message: `Document title: ${t}\n\nContent:\n${c || "(none)"}\n\nTask:\n${prompt}`, truncated };
}

export type RunRequest = {
  promptText: string;
  objectId: string | null;
  promptTemplateId: string | null;
  legacyTitle: string;
  legacyContent: string;
  provider: Provider | null;
  model: string;
  userProviderId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalUuid = (v: unknown): string | null | undefined =>
  v == null || v === "" ? null : (typeof v === "string" && UUID.test(v) ? v : undefined);

export function parseRunRequest(body: unknown): { ok: true; value: RunRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  if (typeof b.promptText !== "string" || !b.promptText.trim()) return { ok: false, error: "promptText (string) is required" };
  if (b.promptText.length > LIMITS.MAX_PROMPT_TEXT) {
    return { ok: false, error: `promptText must be at most ${LIMITS.MAX_PROMPT_TEXT} characters` };
  }
  const objectId = optionalUuid(b.object_id);
  const promptTemplateId = optionalUuid(b.prompt_template_id);
  const userProviderId = optionalUuid(b.user_provider_id);
  if (objectId === undefined || promptTemplateId === undefined || userProviderId === undefined) {
    return { ok: false, error: "object_id, prompt_template_id and user_provider_id must be UUIDs" };
  }
  return {
    ok: true,
    value: {
      promptText: b.promptText,
      objectId,
      promptTemplateId,
      legacyTitle: typeof b.objectTitle === "string" ? b.objectTitle : "",
      legacyContent: typeof b.objectContent === "string" ? b.objectContent : "",
      provider: isProvider(b.provider) ? b.provider : null,
      model: typeof b.model === "string" ? b.model.trim() : "",
      userProviderId,
    },
  };
}
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: all pass (7 tests).

- [ ] **Step 5: Rewrite `supabase/functions/run-prompt/index.ts`:**

```ts
// PKS Edge Function: run a prompt over a knowledge object with DeepSeek or Claude.
// Order: auth → validate → per-minute limit → key/provider → server-key caps → load object
// (as the user, under RLS) → AI call → server-owned prompt_runs row.
import Anthropic from "@anthropic-ai/sdk";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { getAdminClient, getUserClient } from "../_shared/supabase.ts";
import { hintForDeepSeekAuthCode, validateDeepSeekApiKey } from "./deepseekKey.ts";
import { buildUserMessage, isProvider, parseRunRequest, pickModel, PROVIDERS, type Provider } from "./lib.ts";

const RATE_LIMIT_PER_MINUTE = 20;
const env = (k: string, d: number) => Number(Deno.env.get(k) ?? "") || d;
const SERVER_KEY_DAILY_LIMIT = env("SERVER_KEY_DAILY_LIMIT", 50);                     // per user, all providers
const SERVER_KEY_DAILY_LIMIT_ANTHROPIC = env("SERVER_KEY_DAILY_LIMIT_ANTHROPIC", 10); // per user, Claude
const SERVER_KEY_GLOBAL_DAILY_LIMIT = env("SERVER_KEY_GLOBAL_DAILY_LIMIT", 500);      // all users together
const DAY = 86_400;
const DEEPSEEK_TIMEOUT_MS = 60_000;
const CLAUDE_TIMEOUT_MS = 110_000; // with maxRetries 0, stays under the 150 s edge limit
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

type Usage = { input: number | null; output: number | null };
type RunResult =
  | { ok: true; output: string; usage: Usage }
  | { ok: false; status: number; body: Record<string, unknown> };

function validateAnthropicApiKey(raw: string): { ok: true; key: string } | { ok: false; hint: string } {
  const key = raw.trim().replace(/^bearer\s+/i, "");
  if (!key.startsWith("sk-ant-") || /\s/.test(key)) {
    return { ok: false, hint: "Claude API keys start with sk-ant-. Create one at console.anthropic.com → API Keys." };
  }
  return { ok: true, key };
}

async function runDeepSeek(apiKey: string, model: string, userMessage: string, usingServerKey: boolean): Promise<RunResult> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: userMessage }], max_tokens: 4096 }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  }).catch((e) => {
    if (e instanceof DOMException && e.name === "TimeoutError") return null;
    throw e;
  });
  if (!res) return { ok: false, status: 504, body: { error: "AI request timed out", code: "UPSTREAM_TIMEOUT", hint: "Try again, or shorten the prompt." } };
  if (!res.ok) {
    let upstreamCode = "DEEPSEEK_ERROR";
    let upstreamMessage = "";
    try {
      const errJson = await res.json();
      const errObj = errJson?.error;
      upstreamMessage = (typeof errObj === "object" && errObj?.message) || errJson?.message || (typeof errObj === "string" ? errObj : "") || "";
      upstreamCode = (typeof errObj === "object" && errObj?.code) || errJson?.code || upstreamCode;
    } catch { /* ignore parse errors */ }
    if (usingServerKey) {
      console.error("DeepSeek error (server key)", res.status, upstreamCode, upstreamMessage);
      return { ok: false, status: 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
    }
    const hint = upstreamMessage ? `DeepSeek: ${upstreamMessage}` : hintForDeepSeekAuthCode(String(upstreamCode));
    return { ok: false, status: 502, body: { error: upstreamMessage || "AI request failed", code: upstreamCode, hint } };
  }
  const data = await res.json();
  return {
    ok: true,
    output: data.choices?.[0]?.message?.content ?? "",
    usage: { input: data.usage?.prompt_tokens ?? null, output: data.usage?.completion_tokens ?? null },
  };
}

async function runClaude(apiKey: string, model: string, userMessage: string, usingServerKey: boolean): Promise<RunResult> {
  const client = new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 });
  const messages = [{ role: "user" as const, content: userMessage }];
  try {
    const response = model === "claude-opus-5"
      ? await client.beta.messages.create({
        model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        // Server-side fallback: a safety-classifier decline is re-run on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      })
      : await client.messages.create({
        model,
        max_tokens: usingServerKey ? 4096 : 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: usingServerKey ? "medium" : "high" },
        messages,
      });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 422,
        body: { error: "Claude declined this request", code: "REFUSAL", hint: response.stop_details?.explanation || "Try rephrasing the prompt." },
      };
    }
    const output = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return { ok: true, output, usage: { input: response.usage?.input_tokens ?? null, output: response.usage?.output_tokens ?? null } };
  } catch (e) {
    const fail = (status: number, code: string, error: string, hint: string): RunResult => {
      if (usingServerKey) {
        console.error("Claude error (server key)", status, code, e instanceof Error ? e.message : e);
        return { ok: false, status: status === 504 ? 504 : 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
      }
      return { ok: false, status, body: { error, code, hint } };
    };
    if (e instanceof Anthropic.AuthenticationError) return fail(502, "INVALID_API_KEY", "Invalid Claude API key", "Check the key in Settings → AI API keys (it starts with sk-ant-).");
    if (e instanceof Anthropic.PermissionDeniedError) return fail(502, "PERMISSION_DENIED", "Claude API key lacks access", e.message);
    if (e instanceof Anthropic.RateLimitError) return fail(429, "UPSTREAM_RATE_LIMITED", "Claude rate limit reached", "Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) return fail(504, "UPSTREAM_TIMEOUT", "AI request timed out or could not connect", "Try again, or shorten the prompt.");
    if (e instanceof Anthropic.APIError) return fail(502, e.type ?? "CLAUDE_ERROR", e.message, `Claude: ${e.message}`);
    throw e;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders();
  if (!cors) {
    console.error("PKS_APP_ORIGIN is not set; refusing to serve");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => json(body, status, { ...cors, ...extra });

  try {
    const auth = await getUserClient(req);
    if (!auth) return reply({ error: "Unauthorized" }, 401);
    const { supabase, user } = auth;

    // B19: validate before spending any quota.
    let raw: unknown;
    try { raw = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
    const parsed = parseRunRequest(raw);
    if (!parsed.ok) return reply({ error: parsed.error }, 400);
    const input = parsed.value;

    const { data: rl, error: rlErr } = await supabase.rpc("consume_usage", {
      p_scope: "run_prompt_minute", p_limit: RATE_LIMIT_PER_MINUTE, p_window_seconds: 60,
    });
    if (rlErr) return reply({ error: "Rate limit check failed", code: "RATE_LIMIT_ERROR", hint: "Try again in a moment." }, 503);
    if (rl?.limited) {
      const retryAfter = typeof rl.retry_after_sec === "number" ? rl.retry_after_sec : 60;
      return reply({
        error: "Too many requests", code: "RATE_LIMITED",
        hint: `Limit: ${RATE_LIMIT_PER_MINUTE} runs per minute. Try again in ${retryAfter}s.`, retryAfter,
      }, 429, { "Retry-After": String(retryAfter) });
    }

    // Load the object as the user (RLS) instead of trusting client-sent content.
    let title = input.legacyTitle;
    let content = input.legacyContent;
    if (input.objectId) {
      const { data: obj, error: objErr } = await supabase
        .from("knowledge_objects").select("title, content").eq("id", input.objectId).single();
      if (objErr || !obj) return reply({ error: "Object not found", code: "OBJECT_NOT_FOUND" }, 404);
      title = obj.title ?? "";
      content = obj.content ?? "";
    }

    let provider: Provider;
    let apiKey: string;
    const usingServerKey = !input.userProviderId;
    if (input.userProviderId) {
      const { data: row, error } = await getAdminClient()
        .from("user_ai_providers").select("api_key, provider_type")
        .eq("id", input.userProviderId).eq("user_id", user.id).single();
      if (error || !row?.api_key) {
        return reply({ error: "Invalid or missing AI provider", code: "USER_PROVIDER_INVALID", hint: "The selected API key may have been removed. Check Settings → AI API keys." }, 400);
      }
      if (!isProvider(row.provider_type)) {
        return reply({ error: "Unsupported AI provider", code: "PROVIDER_NOT_SUPPORTED", hint: "Add a DeepSeek or Claude API key in Settings → AI API keys." }, 400);
      }
      provider = row.provider_type;
      apiKey = row.api_key;
    } else {
      provider = input.provider ?? "deepseek";
      const cfg = PROVIDERS[provider];
      const serverKey = Deno.env.get(cfg.serverKeyEnv);
      if (!serverKey) {
        return reply({
          error: `${cfg.label} not configured`, code: `${provider.toUpperCase()}_API_KEY_MISSING`,
          hint: `No shared ${cfg.label} key is set on the server. Add your own ${cfg.label} key in Settings → AI API keys.`,
        }, 503);
      }
      // S2: per-user total, per-user per-provider, then a global cap across all users.
      const caps: Array<[string, number]> = [["server_key", SERVER_KEY_DAILY_LIMIT]];
      if (provider === "anthropic") caps.push(["server_key:anthropic", SERVER_KEY_DAILY_LIMIT_ANTHROPIC]);
      for (const [scope, limit] of caps) {
        const { data: q, error: qErr } = await supabase.rpc("consume_usage", { p_scope: scope, p_limit: limit, p_window_seconds: DAY });
        if (qErr || q?.limited !== false) {
          return reply({ error: "Daily limit reached", code: "SERVER_KEY_QUOTA", hint: `The shared ${cfg.label} key allows ${limit} runs per day. Add your own key in Settings → AI API keys to keep going.` }, 429);
        }
      }
      const { data: g, error: gErr } = await getAdminClient().rpc("consume_global_usage", {
        p_scope: "server_key_global", p_limit: SERVER_KEY_GLOBAL_DAILY_LIMIT, p_window_seconds: DAY,
      });
      if (gErr || g?.limited !== false) {
        console.error("Global server-key cap reached", gErr?.message ?? g);
        return reply({ error: "Shared AI capacity reached for today", code: "SERVER_KEY_GLOBAL_QUOTA", hint: "Add your own API key in Settings → AI API keys, or try again tomorrow." }, 429);
      }
      apiKey = serverKey;
    }

    const model = pickModel(provider, input.model, usingServerKey);
    if (provider === "deepseek") {
      const check = validateDeepSeekApiKey(apiKey);
      if (!check.ok) return reply({ error: "Invalid DeepSeek API key", code: check.code, hint: check.hint }, 400);
      apiKey = check.key;
    } else {
      const check = validateAnthropicApiKey(apiKey);
      if (!check.ok) return reply({ error: "Invalid Claude API key", code: "INVALID_API_KEY", hint: check.hint }, 400);
      apiKey = check.key;
    }

    const { message, truncated } = buildUserMessage(title, content, input.promptText);
    const result = provider === "anthropic"
      ? await runClaude(apiKey, model, message, usingServerKey)
      : await runDeepSeek(apiKey, model, message, usingServerKey);

    // B8/D13: one server-written run row per call, completed or failed.
    let run: { id: string; created_at: string } | undefined;
    if (input.objectId) {
      const { data: runRow, error: runErr } = await supabase.from("prompt_runs").insert({
        user_id: user.id,
        knowledge_object_id: input.objectId,
        prompt_template_id: input.promptTemplateId,
        status: result.ok ? "completed" : "failed",
        output: result.ok ? result.output : String(result.body.error ?? "AI request failed"),
        provider,
        model,
        input_tokens: result.ok ? result.usage.input : null,
        output_tokens: result.ok ? result.usage.output : null,
        truncated,
      }).select("id, created_at").single();
      if (runErr) console.error("Failed to record prompt run", runErr.message);
      else run = runRow;
    }

    if (!result.ok) return reply({ ...result.body, run }, result.status);
    return reply({ output: result.output, provider, model, truncated, run });
  } catch (e) {
    console.error("run-prompt error:", e instanceof Error ? e.stack ?? e.message : e);
    return reply({ error: "Server error", hint: "Something went wrong on the server. Try again in a moment." }, 500);
  }
});
```

- [ ] **Step 6: Type-check, then run a manual end-to-end check.**
  1. Run: `deno check supabase/functions/run-prompt/index.ts`. Expected: no errors.
  2. **Set up.** Create `supabase/functions/.env` from `.env.example` with a real `ANTHROPIC_API_KEY`, `SERVER_KEY_GLOBAL_DAILY_LIMIT=2` and `PKS_APP_ORIGIN=http://localhost:5173`.
  3. **Start.** Run `npx supabase functions serve --env-file supabase/functions/.env`.
  4. **Claude on the server key.** Run a prompt from the app on an object, provider Claude. The response's `model` is `claude-sonnet-5`, and `prompt_runs` has one completed row with token counts.
  5. **Global cap.** Run twice more. The 3rd call returns 429 `SERVER_KEY_GLOBAL_QUOTA`.
  6. **Invalid key.** With an invalid own key selected, the error hint shows, and a `failed` run row is recorded.
  7. **Old client.** Run `curl` with the legacy body (`objectTitle`/`objectContent`, no `object_id`) and a user JWT. You get 200 and no run row.

- [ ] **Step 7: Commit.**

```bash
git add supabase/functions/run-prompt
git commit -m "feat(run-prompt): validate first, per-user/provider/global caps, Sonnet 5 on server key, server-owned runs"
```

---

### Task 5: Frontend uses the server-owned run and the atomic save

**Files:**
- Modify: `frontend/src/pages/ObjectDetail.jsx` (`handleGenerateWithAI`, `handleSaveRun`, `handleSaveOutputAsObject`)
- Modify: `frontend/src/App.css` (add the `info` toast style; only `success`/`error` exist today)

**Interfaces:**
- Consumes (from Tasks 3 and 4): the `run-prompt` response `{ output, run, truncated }` and the RPC `save_prompt_output_as_object(p_run_id, p_title, p_content)`.
- Produces: component state `lastRun` (`{ id, created_at } | null`).

- [ ] **Step 1: Track the server's run.** Next to `const [runOutput, setRunOutput] = useState('');`, add:

```js
  const [lastRun, setLastRun] = useState(null);
```

- [ ] **Step 2: Rewrite the request part of `handleGenerateWithAI`.**
  1. Delete `let runId = null;` and the whole `prompt_runs` insert block (from `const { data: runRow, error: insertErr }` through `runId = runRow?.id;`).
  2. Replace the `body: { … }` passed to `supabase.functions.invoke('run-prompt', …)` with:

  ```js
          body: {
            promptText: promptToUse,
            object_id: object.id,
            prompt_template_id: runTemplateId || undefined,
            provider,
            model: modelForProvider(provider, runAiModel || DEFAULT_AI_MODEL),
            user_provider_id: userProviderId || undefined,
          },
  ```

  3. Replace the success tail

  ```js
        const outputText = data?.output ?? '';
        setRunOutput(outputText);
        if (runId) {
          await supabase.from('prompt_runs').update({ status: 'completed', output: outputText }).eq('id', runId);
        }
  ```

  with:

  ```js
        const outputText = data?.output ?? '';
        setRunOutput(outputText);
        setLastRun(data?.run ?? null);
        if (data?.run) {
          setPromptRuns((prev) => [{ id: data.run.id, prompt_template_id: runTemplateId || null, status: 'completed', output: outputText, created_at: data.run.created_at }, ...prev]);
        }
        if (data?.truncated) addToast('info', 'This object is long, so only its first 50,000 characters were sent to the AI.');
  ```

  4. In the `catch`, delete the `if (runId) { … update({ status: 'failed' … }) }` block. The server records failed runs.
  5. Append to `frontend/src/App.css`:

  ```css
  .toast-info {
    background: var(--hover-overlay-strong);
    border-color: var(--glass-border);
    color: var(--polar-white);
  }
  ```

- [ ] **Step 3: "Save run" no longer inserts.** In `handleSaveRun`:
  1. Delete the `const { data, error: err } = await supabase.from('prompt_runs').insert({…}).select(…).single();` statement, the `if (err) throw err;` line and the `setPromptRuns(…)` line. The run was recorded when it was generated.
  2. Add `setLastRun(null);` after `setRunOutput('');`.

- [ ] **Step 4: "Save as object" calls the atomic RPC.** In `handleSaveOutputAsObject`:
  1. Replace everything from `const { data: newObj, error: objErr } = await supabase.from('knowledge_objects').insert({` through the `if (!runErr) setPromptRuns(…);` line with:

  ```js
        if (!lastRun?.id) throw new Error('Generate an output first.');
        const { data: newId, error: saveErr } = await supabase.rpc('save_prompt_output_as_object', {
          p_run_id: lastRun.id,
          p_title: title,
          p_content: runOutput.trim(),
        });
        if (saveErr) throw saveErr;
        const newObj = { id: newId };
  ```

  2. Add `setLastRun(null);` after `setRunOutput('');`.

- [ ] **Step 5: Verify, including manual checks.**
  1. Run (in `frontend/`): `CG_OK=1 grep -n "from('prompt_runs').insert\|from('prompt_runs').update" src/pages/ObjectDetail.jsx`. Expected: no output.
  2. Run: `npm run lint && npm test && npm run build`. Expected: pass.
  3. **Manual, generate:** generate once. Run history shows one new entry, and the `prompt_runs` table has exactly one row.
  4. **Manual, double click:** double-click "Save as new object". One object is created, and you land on it.
  5. **Manual, failure:** with the network offline, generate. The error shows, and nothing hangs.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/ObjectDetail.jsx frontend/src/App.css
git commit -m "fix(ai): client uses server-recorded runs and atomic save-as-object"
```

---

### Task 6: Webhooks: write-only secrets, caps, signed timestamps, honest delivery counts

This fixes audit findings:
- **S7:** the webhook secret is readable by the browser.
- **S8:** unlimited webhooks and arbitrary payloads allow traffic amplification.
- **B18:** 4xx/5xx responses count as delivered; the HMAC has no timestamp; the rate limit is per instance.

Payloads are still sent by the client until Phase 0c moves them to server-side triggers. Until then they are capped at 16 KB and restricted to known event names.

**Files:**
- Create:
  - `supabase/migrations/20260928000003_webhook_secrets_and_caps.sql`, `supabase/tests/database/12_webhooks.test.sql`
  - `supabase/functions/webhook-deliver/lib.ts`, `supabase/functions/webhook-deliver/lib.test.ts`
- Modify:
  - `supabase/functions/webhook-deliver/index.ts`
  - `frontend/src/pages/Integrations.jsx`, `frontend/src/constants/index.js`

**Interfaces:**
- Produces:
  - Column `integrations.webhook_secret` (write-only).
  - Column `integrations.has_secret boolean` (generated, readable).
  - Request headers `X-PKS-Timestamp` and `X-PKS-Signature-256: v1=<hex HMAC-SHA256 of "<timestamp>.<body>">`. The legacy `X-PKS-Signature` is kept until Task 10.

- [ ] **Step 1: Write the failing DB test.** Create `supabase/tests/database/12_webhooks.test.sql`:

```sql
BEGIN;
SELECT plan(4);

SELECT tests.create_user('alice');
SELECT tests.act_as('alice');
INSERT INTO public.integrations (user_id, name, type, config)
VALUES (tests.uid('alice'), 'Hook', 'webhook', '{"url": "https://example.com/h", "secret": "s3cret"}');

SELECT is((SELECT has_secret FROM public.integrations WHERE name = 'Hook'), true, 'has_secret is readable');
SELECT is((SELECT config ? 'secret' FROM public.integrations WHERE name = 'Hook'), false,
  'secret is removed from config (old clients keep working)');
SELECT throws_ok($$SELECT webhook_secret FROM public.integrations$$, '42501', NULL,
  'the secret column cannot be read by the app (S7)');

INSERT INTO public.integrations (user_id, name, type, config)
SELECT tests.uid('alice'), 'H' || g, 'webhook', '{"url": "https://example.com/h"}' FROM generate_series(2, 10) g;
SELECT throws_ok(
  format($$INSERT INTO public.integrations (user_id, name, type, config)
           VALUES (%L, 'Eleventh', 'webhook', '{}')$$, tests.uid('alice')),
  'P0001', NULL, 'at most 10 webhooks per user (S8)');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `12_webhooks` fails, "column has_secret does not exist".

- [ ] **Step 3: Write the migration** `supabase/migrations/20260928000003_webhook_secrets_and_caps.sql`:

```sql
-- S7: the signing secret lives in a column the app can write but never read back.
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS webhook_secret text;
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS has_secret boolean GENERATED ALWAYS AS (webhook_secret IS NOT NULL) STORED;

UPDATE public.integrations
SET webhook_secret = nullif(trim(config ->> 'secret'), ''), config = config - 'secret'
WHERE config ? 'secret';

-- Old and new clients may still send config.secret: move it into the write-only column.
-- S8: cap webhooks per user.
CREATE OR REPLACE FUNCTION public.integrations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.config ? 'secret' THEN
    NEW.webhook_secret := nullif(trim(NEW.config ->> 'secret'), '');
    NEW.config := NEW.config - 'secret';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.type = 'webhook'
     AND (SELECT count(*) FROM public.integrations WHERE user_id = NEW.user_id AND type = 'webhook') >= 10 THEN
    RAISE EXCEPTION 'You can have at most 10 webhooks' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.integrations_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_integrations_before_write ON public.integrations;
CREATE TRIGGER trg_integrations_before_write
  BEFORE INSERT OR UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.integrations_before_write();

REVOKE SELECT ON public.integrations FROM anon, authenticated;
GRANT SELECT (id, user_id, name, type, enabled, config, created_at, updated_at, has_secret)
  ON public.integrations TO authenticated;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `12_webhooks .. ok`.

- [ ] **Step 5: Write the failing function tests.** Create `supabase/functions/webhook-deliver/lib.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { countDelivered, isAllowedEvent, isWebhookUrlAllowed, MAX_PAYLOAD_BYTES, signPayload } from "./lib.ts";

Deno.test("signs timestamp.body with HMAC-SHA256 (hex)", async () => {
  const sig = await signPayload("whsec_test", 1700000000, '{"event":"object.created"}');
  assertEquals(sig, "aabe67d47e4ed839a7db5f1db800a332ef23cdc46d9053902f8cd474baa84d5a");
});

Deno.test("only known events are accepted", () => {
  assertEquals(isAllowedEvent("object.created"), true);
  assertEquals(isAllowedEvent("anything.else"), false);
});

Deno.test("only 2xx responses count as delivered", () => {
  const results: PromiseSettledResult<Response | undefined>[] = [
    { status: "fulfilled", value: new Response(null, { status: 204 }) },
    { status: "fulfilled", value: new Response(null, { status: 500 }) },
    { status: "fulfilled", value: undefined },
    { status: "rejected", reason: new Error("x") },
  ];
  assertEquals(countDelivered(results), 1);
});

Deno.test("SSRF guard still blocks private targets", () => {
  assertEquals(isWebhookUrlAllowed("http://example.com").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://127.0.0.1/x").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://[::ffff:10.0.0.1]/x").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://hooks.example.com/x").allowed, true);
});

Deno.test("payload cap is 16 KB", () => {
  assertEquals(MAX_PAYLOAD_BYTES, 16 * 1024);
});
```

- [ ] **Step 6: Run it and confirm it fails.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: FAIL, "Module not found … webhook-deliver/lib.ts".

- [ ] **Step 7: Create `supabase/functions/webhook-deliver/lib.ts`.**
  1. **Move** these functions out of `index.ts`, unchanged, and add `export` to each: `isPrivateIpV4`, `parseIpV6`, `isPrivateIpV6`, `isWebhookUrlAllowed`, `assertResolvesToPublicIp`.
  2. Then append:

  ```ts
  /** Event names clients may send. Keep in sync with WEBHOOK_EVENTS in frontend/src/constants/index.js. */
  export const WEBHOOK_EVENTS = ["object.created", "prompt_run.completed", "export.completed"] as const;
  export const MAX_PAYLOAD_BYTES = 16 * 1024;

  export function isAllowedEvent(event: unknown): event is typeof WEBHOOK_EVENTS[number] {
    return typeof event === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(event);
  }

  async function hmac(secret: string, message: string): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  }

  /** v1 signature: hex HMAC-SHA256 over "<unix seconds>.<body>" (replay-resistant with the timestamp). */
  export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
    const bytes = await hmac(secret, `${timestamp}.${body}`);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** Legacy base64 HMAC over the body only; removed in the contract task. */
  export async function legacySignature(secret: string, body: string): Promise<string> {
    return btoa(String.fromCharCode(...await hmac(secret, body)));
  }

  export function countDelivered(results: PromiseSettledResult<Response | undefined>[]): number {
    return results.filter((r) => r.status === "fulfilled" && r.value?.ok === true).length;
  }
  ```

- [ ] **Step 8: Run it and confirm it passes.**

Run: `deno test --allow-env --allow-net=none supabase/functions`

Expected: all pass.

- [ ] **Step 9: Update `supabase/functions/webhook-deliver/index.ts`.**
  1. **Imports:**
     - Replace the `createClient` import, the `appOrigin`/`corsHeaders` constants, the moved helper functions, `RATE_LIMIT_*`, `rateLimitMap`, `checkRateLimit` and `MAX_BODY_BYTES` with:

     ```ts
     import { corsHeaders } from "../_shared/cors.ts";
     import { json } from "../_shared/http.ts";
     import { getAdminClient, getUserClient } from "../_shared/supabase.ts";
     import {
       assertResolvesToPublicIp, countDelivered, isAllowedEvent, isWebhookUrlAllowed,
       legacySignature, MAX_PAYLOAD_BYTES, signPayload,
     } from "./lib.ts";
     ```

  2. **The handler:** replace the body of `Deno.serve(async (req) => { … })` with:

     ```ts
       const cors = corsHeaders();
       if (!cors) {
         console.error("PKS_APP_ORIGIN is not set; refusing to serve");
         return new Response("Server misconfigured", { status: 500 });
       }
       if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
       const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => json(body, status, { ...cors, ...extra });

       try {
         const auth = await getUserClient(req);
         if (!auth) return reply({ error: "Unauthorized" }, 401);
         const { supabase, user } = auth;

         const rawBody = await req.text();
         if (new TextEncoder().encode(rawBody).length > MAX_PAYLOAD_BYTES) {
           return reply({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" }, 413);
         }
         let parsed: { event?: unknown; payload?: unknown };
         try { parsed = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON body" }, 400); }
         if (!isAllowedEvent(parsed.event)) return reply({ error: "Unknown event" }, 400);
         const event = parsed.event;

         // B18: rate limit shared across all function instances.
         const { data: rl, error: rlErr } = await supabase.rpc("consume_usage", {
           p_scope: "webhook_deliver", p_limit: 60, p_window_seconds: 60,
         });
         if (rlErr) return reply({ error: "Rate limit check failed" }, 503);
         if (rl?.limited) {
           return reply({ error: "Too many requests", code: "RATE_LIMITED", retryAfter: rl.retry_after_sec }, 429,
             { "Retry-After": String(rl.retry_after_sec ?? 60) });
         }

         // Secrets are write-only for users; read them with the service role, scoped to this user.
         const { data: integrations, error: intErr } = await getAdminClient()
           .from("integrations")
           .select("id, config, webhook_secret")
           .eq("user_id", user.id).eq("type", "webhook").eq("enabled", true);
         if (intErr) {
           console.error("webhook-deliver: failed to load integrations", intErr.message);
           return reply({ error: "Server error" }, 500);
         }

         const toCall = (integrations ?? []).filter((i) => {
           const events = i.config?.events;
           return !Array.isArray(events) || events.length === 0 || events.includes(event);
         });

         const timestamp = Math.floor(Date.now() / 1000);
         const body = JSON.stringify({ event, payload: parsed.payload ?? {}, timestamp: new Date(timestamp * 1000).toISOString() });
         const results = await Promise.allSettled(toCall.map(async (i) => {
           const url = i.config?.url;
           if (!url || typeof url !== "string") return undefined;
           const check = isWebhookUrlAllowed(url);
           if (!check.allowed) throw new Error(check.reason ?? "Webhook URL not allowed");
           await assertResolvesToPublicIp(new URL(url).hostname.toLowerCase());
           const headers: Record<string, string> = {
             "Content-Type": "application/json",
             "User-Agent": "PKS-Webhook/1.1",
             "X-PKS-Event": event,
             "X-PKS-Timestamp": String(timestamp),
           };
           if (i.webhook_secret) {
             headers["X-PKS-Signature-256"] = `v1=${await signPayload(i.webhook_secret, timestamp, body)}`;
             headers["X-PKS-Signature"] = await legacySignature(i.webhook_secret, body);
           }
           return await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
         }));

         return reply({ delivered: countDelivered(results), total: toCall.length });
       } catch (e) {
         console.error("webhook-deliver error:", e);
         return reply({ error: "Server error" }, 500);
       }
     ```

  3. Run: `deno check supabase/functions/webhook-deliver/index.ts`. Expected: no errors.

- [ ] **Step 10: Frontend: stop reading the secret; webhooks are the only type.**
  1. **`src/constants/index.js`:** change `export const INTEGRATION_TYPES = ['generic', 'import', 'webhook', 'api'];` to `export const INTEGRATION_TYPES = ['webhook'];`.
  2. **`src/pages/Integrations.jsx`:**
     - Change both `type: 'generic'` defaults (in the `useState` initial form and the reset after adding) to `type: 'webhook'`.
     - Change both `.select('id, name, type, enabled, config, created_at')` strings to `.select('id, name, type, enabled, config, created_at, has_secret')`.
     - In `openEditConfig`, change `secret: c.secret ? '********' : '',` to `secret: integration.has_secret ? '********' : '',`.
     - In `saveEditConfig`, delete the line `if (item?.config?.secret && editConfig.secret === '********') config.secret = item.config.secret;` and the `const item = …` line above it. Leaving `secret` out of `config` keeps the stored secret.
     - In the same function, change the `setList` mapper to `{ ...i, config, has_secret: config.secret ? true : i.has_secret }`.
  3. Below the webhook form, add help text:

  ```jsx
          <p className="settings-desc">Each request is signed: verify <code>X-PKS-Signature-256: v1=&lt;hex&gt;</code> as HMAC-SHA256 of <code>&lt;X-PKS-Timestamp&gt;.&lt;body&gt;</code> with your secret, and reject timestamps older than 5 minutes.</p>
  ```

- [ ] **Step 11: Verify, including manual checks.**
  1. Run: `npx supabase test db`, `deno test --allow-env --allow-net=none supabase/functions`, and (in `frontend/`) `npm run lint && npm test && npm run build`. Expected: all pass.
  2. **Manual, secret:** add a webhook pointing at https://webhook.site with a secret. The secret is never visible in the page's network responses, and "Secret set" shows as `********`.
  3. **Manual, delivery:** create an object. webhook.site receives the event with `X-PKS-Timestamp` and `X-PKS-Signature-256`.
  4. **Manual, delivery count:** point the webhook at a URL that returns 500. The function's `delivered` count is 0.

- [ ] **Step 12: Commit.**

```bash
git add supabase/migrations/20260928000003_webhook_secrets_and_caps.sql supabase/tests/database/12_webhooks.test.sql supabase/functions/webhook-deliver frontend/src/pages/Integrations.jsx frontend/src/constants/index.js
git commit -m "fix(webhooks): write-only secrets, 10-per-user cap, event allowlist, timestamped signatures, honest counts"
```

---

### Task 7: Remove the unused "Output format" field from the Prompt Bank

The UI part of the audit's §2 removal. The column is dropped in Task 10.

**Files:**
- Modify: `frontend/src/pages/PromptBank.jsx` (the lines around 26, 71, 84, 152 and 444–456)

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Remove the field.**
  1. Remove `output_format: 'text',` from the initial form state (line ~26) and from the reset (line ~71).
  2. Remove `output_format: t.output_format || 'text',` (line ~84) and `output_format: form.output_format,` (line ~152).
  3. Delete the whole `<label className="prompt-bank-field">` block containing "Output format".
  4. Delete the `OUTPUT_FORMATS` constant.

- [ ] **Step 2: Verify, including a manual check.**
  1. Run (in `frontend/`): `CG_OK=1 grep -n "output_format\|OUTPUT_FORMATS" src/pages/PromptBank.jsx`. Expected: no output.
  2. Run: `npm run lint && npm run build`. Expected: pass.
  3. Manual: creating and editing a prompt works.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/pages/PromptBank.jsx
git commit -m "chore(prompts): remove unused output format field"
```

---

### Task 8: CAPTCHA on signup, login, password reset and password change

This covers open-signup abuse (decision 1) and part of S12 (password change needs a fresh, verified login).

**Files:**
- Create:
  - `frontend/src/lib/turnstile.js`
  - `frontend/src/components/Turnstile.jsx`, `frontend/src/components/Turnstile.test.jsx`
- Modify:
  - `frontend/src/pages/Register.jsx`, `Login.jsx`, `ForgotPassword.jsx`, `Settings.jsx`
  - `frontend/vercel.json`, `frontend/.env.example`, `supabase/config.toml`

**Interfaces:**
- Produces:
  - `loadTurnstile(): Promise<Turnstile>`
  - `<Turnstile siteKey onToken />`. It renders nothing when `siteKey` is empty (dev without CAPTCHA). It calls `onToken('')` on expiry or error.

- [ ] **Step 1: Write the failing test.** Create `frontend/src/components/Turnstile.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Turnstile from './Turnstile';

afterEach(() => { delete window.turnstile; });

describe('Turnstile', () => {
  it('renders nothing without a site key (dev)', () => {
    const { container } = render(<Turnstile siteKey="" onToken={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the widget and forwards tokens, expiry and errors', async () => {
    let options;
    window.turnstile = { render: vi.fn((el, opts) => { options = opts; return 'w1'; }), remove: vi.fn() };
    const onToken = vi.fn();
    const { unmount } = render(<Turnstile siteKey="1x00000000000000000000AA" onToken={onToken} />);
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled());
    expect(options.sitekey).toBe('1x00000000000000000000AA');
    options.callback('tok');
    options['expired-callback']();
    options['error-callback']();
    expect(onToken.mock.calls).toEqual([['tok'], [''], ['']]);
    unmount();
    expect(window.turnstile.remove).toHaveBeenCalledWith('w1');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run (in `frontend/`): `npx vitest run src/components/Turnstile.test.jsx`

Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement the loader and component.** Create `frontend/src/lib/turnstile.js`:

```js
/** Loads Cloudflare Turnstile once (explicit rendering). */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => { scriptPromise = null; reject(new Error('Could not load the security check')); };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}
```

Create `frontend/src/components/Turnstile.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { loadTurnstile } from '../lib/turnstile';

/**
 * Cloudflare Turnstile widget. onToken receives the token, or '' when it expires or fails,
 * so the form can block submit until a fresh token exists. Remount (change `key`) after a
 * failed submit: tokens are single-use.
 */
export default function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!siteKey) return undefined;
    let widgetId;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !ref.current) return;
        widgetId = turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => onToken(''));
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="turnstile-widget" />;
}
```

- [ ] **Step 4: Run it and confirm it passes.**

Run (in `frontend/`): `npx vitest run src/components/Turnstile.test.jsx`

Expected: 2 passed.

- [ ] **Step 5: Wire it into the four forms.** Apply the same pattern in `Register.jsx`, `Login.jsx`, `ForgotPassword.jsx` and the password form of `Settings.jsx`:
  1. **Imports and state:**

  ```jsx
  import Turnstile from '../components/Turnstile';
  // inside the component:
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  ```

  2. **The widget:** render `<Turnstile key={captchaKey} siteKey={captchaSiteKey} onToken={setCaptchaToken} />` directly above the submit button.
  3. **Disable submit without a token:** add `|| (captchaSiteKey && !captchaToken)` to the submit button's `disabled` expression.
  4. **Pass the token:**
     - Register: add `captchaToken: captchaToken || undefined,` inside the existing `options: { … }` of `supabase.auth.signUp`.
     - Login: add `options: { captchaToken: captchaToken || undefined },` to `signInWithPassword({ email: email.trim(), password, … })`.
     - ForgotPassword: add `captchaToken: captchaToken || undefined,` next to `redirectTo` in `resetPasswordForEmail`.
     - Settings: add `options: { captchaToken: captchaToken || undefined },` to the current-password `signInWithPassword` call.
  5. **After any failure,** in each form's `catch` or error branch, add `setCaptchaToken(''); setCaptchaKey((k) => k + 1);` to get a fresh widget. If the error message contains `captcha`, show "Please complete the security check and try again."

- [ ] **Step 6: Configure the CSP, env and local stack.**
  1. **`frontend/vercel.json`, in the CSP value:**
     - Add ` https://challenges.cloudflare.com` to `script-src`.
     - Add a directive `frame-src https://challenges.cloudflare.com;`.
  2. **`frontend/.env.example`:** add

  ```bash
  # Cloudflare Turnstile site key (public). Leave empty in dev to disable the widget.
  # Local test key that always passes: 1x00000000000000000000AA
  VITE_TURNSTILE_SITE_KEY=
  ```

  3. **`supabase/config.toml`:** replace the commented `# [auth.captcha]` block with the block below. These are Cloudflare's always-pass test keys, for local use only.

  ```toml
  [auth.captcha]
  enabled = true
  provider = "turnstile"
  secret = "1x0000000000000000000000000000000AA"
  ```

- [ ] **Step 7: Verify, including manual checks.**
  1. Run (in `frontend/`): `npm run lint && npm test && npm run build`. Expected: pass.
  2. **Manual setup:** local stack with `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` in `frontend/.env`.
  3. **Manual, happy path:** sign up. The widget passes and a confirmation email arrives in Inbucket. Log in, reset the password, and change the password in Settings; each works.
  4. **Manual, script blocked:** in devtools block `challenges.cloudflare.com`. Submit stays disabled, and no silent failure occurs.

- [ ] **Step 8: Commit.**

```bash
git add frontend/src/lib/turnstile.js frontend/src/components/Turnstile.jsx frontend/src/components/Turnstile.test.jsx frontend/src/pages/Register.jsx frontend/src/pages/Login.jsx frontend/src/pages/ForgotPassword.jsx frontend/src/pages/Settings.jsx frontend/vercel.json frontend/.env.example supabase/config.toml
git commit -m "feat(auth): Turnstile CAPTCHA on signup, login, reset and password change"
```

---

### Task 9: Run the edge-function tests in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `supabase/functions/deno.json` and the `*.test.ts` files.
- Produces: none.

- [ ] **Step 1: Add the job.** Append under `jobs:`:

```yaml
  functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - run: deno check supabase/functions/run-prompt/index.ts supabase/functions/webhook-deliver/index.ts
        working-directory: .
      - run: deno test --allow-env --allow-net=none supabase/functions
```

- [ ] **Step 2: Run the same commands locally.**

Run: `deno check supabase/functions/run-prompt/index.ts supabase/functions/webhook-deliver/index.ts && deno test --allow-env --allow-net=none supabase/functions`

Expected: pass.

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: type-check and test edge functions"
```

---

### Task 10 (gated): Contract: drop legacy quota tables, `output_format` and the legacy signature

**Gate:** run this only when **all** of these are true. Ask the owner to confirm.
- Tasks 4–8 have been in production for at least 2 weeks.
- The owner has confirmed that webhook receivers have moved to `X-PKS-Signature-256`.

**Files:**
- Create: `supabase/migrations/20260927000013_contract_quota_and_output_format.sql`, `supabase/tests/database/13_contract_quota.test.sql`

  Note: `20260927000013` is a placeholder. Since this task's migration collides with plan −1B1's Task 11 contract migration, give it a fresh timestamp for the date it's actually written, after the earlier migrations in both plans are already in production.
- Modify:
  - `supabase/functions/webhook-deliver/index.ts` and `lib.ts` (remove `legacySignature`)
  - `supabase/functions/run-prompt/lib.ts` and its test (remove the legacy body fields)

**Interfaces:**
- Removes:
  - `rate_limit_run_prompt`, `server_key_daily_usage`, `increment_run_prompt_rate_limit`, `consume_server_key_quota`
  - `prompt_templates.output_format`
  - The `X-PKS-Signature` header
  - The `objectTitle` / `objectContent` request fields

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/13_contract_quota.test.sql`:

```sql
BEGIN;
SELECT plan(4);
SELECT hasnt_table('public', 'rate_limit_run_prompt', 'legacy per-minute table dropped');
SELECT hasnt_table('public', 'server_key_daily_usage', 'legacy daily quota table dropped');
SELECT hasnt_function('public', 'consume_server_key_quota', 'legacy quota function dropped');
SELECT hasnt_column('public', 'prompt_templates', 'output_format', 'output_format dropped');
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `13_contract_quota` fails on the first assertion.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000013_contract_quota_and_output_format.sql`:

```sql
DROP FUNCTION IF EXISTS public.increment_run_prompt_rate_limit(int);
DROP FUNCTION IF EXISTS public.consume_server_key_quota(int);
DROP TABLE IF EXISTS public.rate_limit_run_prompt;
DROP TABLE IF EXISTS public.server_key_daily_usage;
ALTER TABLE public.prompt_templates DROP COLUMN IF EXISTS output_format;
```

- [ ] **Step 4: Remove the legacy code paths.**
  1. **Webhook signature:**
     - In `webhook-deliver/index.ts`, delete the `headers["X-PKS-Signature"] = …` line and `legacySignature` from the import.
     - In `lib.ts`, delete the `legacySignature` function.
  2. **Legacy request body:**
     - In `run-prompt/lib.ts`, delete `legacyTitle` and `legacyContent` from `RunRequest` and from `parseRunRequest`, and require `object_id` (return `{ ok: false, error: "object_id is required" }` when it is null).
     - In `run-prompt/index.ts`, set `title` and `content` only from the loaded object.
  3. **Test:** in `lib.test.ts`, replace the legacy-body test with:

  ```ts
  Deno.test("object_id is required", () => {
    assertEquals(parseRunRequest({ promptText: "Hi" }).ok, false);
  });
  ```

  Also add `object_id: "00000000-0000-0000-0000-000000000001"` to the remaining valid `parseRunRequest` calls in that file.

- [ ] **Step 5: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db && deno test --allow-env --allow-net=none supabase/functions`

Expected: all pass.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260927000013_contract_quota_and_output_format.sql supabase/tests/database/13_contract_quota.test.sql supabase/functions
git commit -m "chore: drop legacy quota tables, output_format, legacy webhook signature and run-prompt body"
```

---

### Task 11: Production hand-off (owner checklist)

- [ ] **Step 1: Apply the database migrations.** Follow plan −1B1 Task 12 (backup → `db diff` → `db push`). This plan's migrations are included.
- [ ] **Step 2: Set the function secrets.** Run `npx supabase secrets set PKS_APP_ORIGIN=https://<your-app-domain> SERVER_KEY_DAILY_LIMIT=50 SERVER_KEY_DAILY_LIMIT_ANTHROPIC=10 SERVER_KEY_GLOBAL_DAILY_LIMIT=<budget-based number>`.
  - Add `DEEPSEEK_API_KEY` and `ANTHROPIC_API_KEY` if they aren't set yet.
  - For the global limit, start at 300 and raise it once real costs are known.
- [ ] **Step 3: Deploy the functions.** Run `npx supabase functions deploy run-prompt webhook-deliver`.
- [ ] **Step 4: Change the hosted Auth settings** (Supabase dashboard → Authentication):
  - Email: **Confirm email ON**, **Secure password change ON**.
  - Bot and abuse protection: **Enable CAPTCHA, provider Turnstile**, with the secret key from Cloudflare (Turnstile → add site → secret key).
  - Rate limits: review the email-sending limits for signups.
- [ ] **Step 5: Set up the frontend.** In Vercel, set `VITE_TURNSTILE_SITE_KEY` to the Cloudflare site key and deploy.
- [ ] **Step 6: Smoke test in production:**
  - Sign up with a new email: confirmation required, then login works.
  - Run a prompt on the server key: the response model is `claude-sonnet-5`.
  - Add a webhook: the secret isn't visible.
- [ ] **Step 7: Schedule Task 10** two weeks later.
