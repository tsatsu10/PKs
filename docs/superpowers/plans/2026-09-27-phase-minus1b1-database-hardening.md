# Phase −1B1: Database Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the data-integrity and security bugs in the Supabase Postgres layer (audit findings B1, B14, B15, B16, D1, D3–D6, S1, S3–S6, S9, S10, S13) behind a pgTAP test suite, with the small frontend changes they require.

**Architecture:**
- **Forward migrations only.** Each task adds one migration file on top of the existing 46 (the squash is plan −1C).
- **Tests:** each migration ships with a pgTAP file run by `supabase test db` against a local stack. Tests impersonate users by setting `role` and `request.jwt.claims`, so every RLS policy is exercised as a real user.
- **Frontend:** changes only where a DB change needs one (conflict check, sharing, permanent delete, owner-only fields).
- **Expand → contract:** schema that old app versions still use is removed only in the gated Task 11.

**Tech Stack:** Supabase CLI (`npx supabase`), Postgres 15/17, pgTAP, Docker Desktop, React 19 frontend (Vitest).

**Spec:**
- [`docs/plans/2026-09-26-ultimate-knowledge-base-roadmap.md`](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md): Phase −1, the −1B scope, and the migration rules.
- [`docs/plans/2026-09-26-codebase-audit.md`](../../plans/2026-09-26-codebase-audit.md): the finding IDs.

**Depends on:** plan −1A merged. Task 2 edits code that −1A Task 7 creates (`frontend/src/lib/objectForm.js`, the ObjectDetail save).

**Sibling plan:** −1B2 (edge functions & abuse protection) covers:
- B8, D8, D13: prompt runs owned by the server
- S2, B19, R14: AI caps
- B18, S7, S8: webhooks
- S12, CAPTCHA and hosted auth settings
- The old quota tables

## Global Constraints

- **Working directory:** commands run from the repo root unless a step says otherwise. Use `npx supabase …`; the CLI is not a project dependency.
- **Migration files:**
  - Name: `supabase/migrations/20260927NNNNNN_<name>.sql`, one per task, numbered in task order (`…000001` for Task 2, `…000002` for Task 3, and so on).
  - Use `IF [NOT] EXISTS` / `CREATE OR REPLACE` wherever Postgres allows it.
- **Every new `SECURITY DEFINER` function must:**
  - have `SET search_path = public`;
  - be followed by `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;` and `GRANT EXECUTE ON FUNCTION … TO authenticated, service_role;`.
  - Trigger functions also revoke from `authenticated`.
  - Migration 20260926000001 applied these grants only once, to functions that existed then.
- **Every new policy:**
  - uses `TO authenticated`;
  - calls `(SELECT auth.uid())`, never bare `auth.uid()`.
- **Expand → contract.** Nothing an old client still calls or writes is removed before Task 11:
  - `resolve_user_id_by_email`
  - the `export_jobs` tables
  - the `pulse` stats key
- **pgTAP file shape:**
  - Location: `supabase/tests/database/NN_<name>.test.sql`.
  - Structure: `BEGIN; SELECT plan(N); … SELECT * FROM finish(); ROLLBACK;`.
  - Create users with `SELECT tests.create_user('alice');` and act as one with `SELECT tests.act_as('alice');`.
  - Return to superuser with `RESET ROLE; SELECT set_config('request.jwt.claims', '', true);`.
  - Fixed UUIDs for test rows use the prefix `00000000-0000-0000-0000-0000000000` plus two hex digits.
- **Checks after every task:**
  - `npx supabase db reset && npx supabase test db`, and all tests pass.
  - If the task touched the frontend, run `npm run lint && npm test && npm run build` in `frontend/`.
- **Production is owner-only.** Never run `supabase db push` or `supabase link` against production inside a task. After the plan, the owner applies the migrations (see Task 12).
- **Commits:** one per task, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Old app versions keep working after the migrations deploy.** Pre-update clients still:
   - guard saves with `current_version`;
   - call `resolve_user_id_by_email`;
   - insert into `export_jobs`;
   - read `stats.pulse`.

   All of these keep working until Task 11. Test: Task 2 keeps a `current_version` guard test green.
2. **Service-role and SQL-editor writes** (no `auth.uid()`) must still succeed on every trigger. Tests: Task 3 (version snapshot as postgres) and Task 4 (guard bypass as postgres).
3. **A shared editor saving after the restriction.** An editor saving title and content still works, and an editor can't change owner-only fields through the API or the UI. Task 4 has the tests plus a UI step.
4. **Sharing reveals nothing about which emails are registered.** The same response for registered, unregistered and unconfirmed emails, and access granted when the recipient confirms. Task 5 tests.
5. **Existing duplicate tags and domains** ("AI" and "ai") are merged without losing any object's tags. Task 9 test.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/config.toml` | move from `frontend/supabase/` + edit | Local stack config (seed, auth mirror of production) |
| `supabase/seed.sql` | create | pgTAP extension + `tests` helper schema (local/CI only) |
| `supabase/tests/database/*.test.sql` | create | One pgTAP file per task |
| `supabase/migrations/20260927000001_object_touch_and_revision.sql` | create | B1 + `revision` (D1) |
| `…000002_version_history_hardening.sql` | create | B15, D5, S4, forged-insert policy |
| `…000003_shared_object_guard.sql` | create | S9, S10, S6, `can_read_object` / `can_edit_object` |
| `…000004_share_invites.sql` | create | S1, S5 |
| `…000005_dashboard_rpcs.sql` | create | S3, B16, D6 |
| `…000006_permanent_delete_and_files.sql` | create | D4/B14, files UPDATE policy, bucket size limit |
| `…000007_prompt_runs_integrity.sql` | create | D3, S13 |
| `…000008_rls_and_index_hygiene.sql` | create | `(SELECT auth.uid())`, indexes, case-insensitive taxonomy, `search_path` |
| `…000009_shared_related_trash.sql` | create | S9, trash-aware shared child policies (tags/domains/link_edges) |
| `…000010_contract_dead_schema.sql` | create (Task 11, gated) | Drops dead tables and functions |
| `frontend/src/lib/objectForm.js` (+test) | modify | Base *revision* in drafts |
| `frontend/src/hooks/useObjectDetail.js` | modify | Select `revision` |
| `frontend/src/pages/ObjectDetail.jsx` | modify | Revision guard, share RPC, owner-only fields |
| `frontend/src/components/ObjectDetailSharePanel.jsx` | modify | Pending invites |
| `frontend/src/pages/Trash.jsx` | modify | Permanent delete via RPC + storage cleanup |
| `.github/workflows/ci.yml` | modify | Database job |

---

### Task 1: Local Supabase stack and pgTAP harness

**Files:**
- Move: `frontend/supabase/config.toml` → `supabase/config.toml`
- Create: `supabase/seed.sql`, `supabase/tests/database/00_harness.test.sql`
- Delete: `supabase/verify_db_up_to_date.sql` (stale; replaced by the tests)

**Interfaces:**
- Produces (used by every later test file):
  - `tests.create_user(p_key text, p_confirmed boolean DEFAULT true) RETURNS uuid`. Email is `<key>@test.local`.
  - `tests.uid(p_key text) RETURNS uuid`
  - `tests.act_as(p_key text) RETURNS void`

- [ ] **Step 1: Prerequisites (owner action if missing).**
  1. Run `docker info`.
  2. If it fails, install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it, and re-run until it prints server info.
  3. If Docker can't be installed, stop and report back; the alternative is a separate free Supabase *dev* project, never production.

- [ ] **Step 2: Move and fix the config.**

```bash
git mv frontend/supabase/config.toml supabase/config.toml
```

Edit `supabase/config.toml`:
- `project_id = "frontend"` → `project_id = "pks"`.
- `[db] major_version`: set it to the production Postgres major version (Supabase dashboard → Settings → Infrastructure; 15 or 17). If you can't check, leave 15 and note it in the commit message.
- `[db.seed]`: make sure `enabled = true` and `sql_paths = ["./seed.sql"]`.
- `[auth.email]`: `enable_confirmations = true` and `secure_password_change = true`. Local now mirrors what production will have after −1B2.

- [ ] **Step 3: Create `supabase/seed.sql`** (local and CI only; seeds never run in production):

```sql
-- Local/CI only: test tooling. Never applied to production.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO authenticated, anon;

-- Create a confirmed (or unconfirmed) auth user; handle_new_user adds public.users.
CREATE OR REPLACE FUNCTION tests.create_user(p_key text, p_confirmed boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_key || '@test.local', '',
    CASE WHEN p_confirmed THEN now() END, '{}'::jsonb, '{}'::jsonb, now(), now()
  );
  PERFORM set_config('tests.' || p_key, v_id::text, true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION tests.uid(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT current_setting('tests.' || p_key)::uuid $$;

-- Impersonate a user for the rest of the transaction (RLS applies).
CREATE OR REPLACE FUNCTION tests.act_as(p_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_key), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;
```

- [ ] **Step 4: Write the harness test.** Create `supabase/tests/database/00_harness.test.sql`:

```sql
BEGIN;
SELECT plan(3);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Alice private');

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id IN (tests.uid('alice'), tests.uid('bob'))),
  2, 'handle_new_user created profile rows');

SELECT tests.act_as('bob');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects), 0, 'bob cannot see alice''s object');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('alice');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects), 1, 'alice sees her object');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 5: Start the stack and run the tests.**

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Expected: `00_harness.test.sql .. ok`, then `All tests successful.`

If `db reset` fails on an existing migration, **stop**. Report the failing file and error; that is −1C (squash) territory, and working around it here would hide drift from production.

- [ ] **Step 6: Delete the stale checker and commit.**

```bash
git rm supabase/verify_db_up_to_date.sql
git add supabase/config.toml supabase/seed.sql supabase/tests
git commit -m "test(db): local Supabase stack config, pgTAP harness and test helpers"
```

---

### Task 2: Views and pins stop counting as edits; add `revision` for conflict checks

This fixes audit findings B1 and D1.
- **B1:** opening an object bumps `updated_at` through `touch_object_view`.
- **D1:** `current_version` only changes on title/content/summary/key_points, so metadata edits race silently.

`revision` bumps on **every** real edit and is what the client checks.

**Files:**
- Create: `supabase/migrations/20260927000001_object_touch_and_revision.sql`, `supabase/tests/database/01_object_touch.test.sql`
- Modify:
  - `frontend/src/lib/objectForm.js`, `frontend/src/lib/objectForm.test.js`
  - `frontend/src/hooks/useObjectDetail.js` (`OBJECT_COLS`)
  - `frontend/src/pages/ObjectDetail.jsx` (save and draft code from −1A Task 7)

**Interfaces:**
- Produces:
  - Column `knowledge_objects.revision bigint NOT NULL DEFAULT 1`.
  - Function `public.touch_knowledge_object()`.
  - Frontend `draftFromForm(form, baseRevision)` → `{ ...form, _baseRevision }`, and `formFromDraft(draft, object)` → `{ form, baseRevision }`.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/01_object_touch.test.sql`:

```sql
BEGIN;
SELECT plan(7);

SELECT tests.create_user('alice');
INSERT INTO public.knowledge_objects (id, user_id, title, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Note', now() - interval '1 day');
SELECT tests.act_as('alice');

SELECT has_column('public', 'knowledge_objects', 'revision', 'revision column exists');

SELECT public.touch_object_view('00000000-0000-0000-0000-000000000001');
SELECT ok(
  (SELECT updated_at < now() - interval '23 hours' AND revision = 1
   FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'viewing does not change updated_at or revision');

UPDATE public.knowledge_objects SET is_pinned = true WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  1::bigint, 'pinning does not change revision');

UPDATE public.knowledge_objects SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT revision = 2 AND updated_at > now() - interval '1 minute'
   FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'a metadata edit bumps revision and updated_at');
SELECT is((SELECT current_version FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  1, 'a metadata edit does not create a version snapshot');

UPDATE public.knowledge_objects SET title = 'Renamed' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT revision FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  3::bigint, 'a text edit bumps revision');

-- Old clients still guard on current_version: that path must keep working.
UPDATE public.knowledge_objects SET summary = 's'
WHERE id = '00000000-0000-0000-0000-000000000001' AND current_version = 2;
SELECT is((SELECT summary FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  's', 'current_version guard still works for old clients');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `01_object_touch` fails at "revision column exists", and later tests error on the missing column.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000001_object_touch_and_revision.sql`:

```sql
-- B1: view tracking and pinning are bookkeeping, not edits, so they must not bump updated_at.
-- D1: revision bumps on every real edit (current_version only bumps on text fields and counts
--     snapshots), so the client's optimistic-concurrency check catches metadata races too.

ALTER TABLE public.knowledge_objects
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.knowledge_objects.revision IS
  'Bumped by trigger on every real edit (not views/pins). Clients use it for optimistic concurrency.';

CREATE OR REPLACE FUNCTION public.touch_knowledge_object()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Columns whose changes are not user edits. fts is generated (not yet computed in BEFORE
  -- triggers); current_version is maintained by the version trigger.
  ignored text[] := ARRAY['last_viewed_at', 'is_pinned', 'updated_at', 'revision', 'current_version', 'fts'];
BEGIN
  IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
    NEW.updated_at := now();
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_objects_updated_at ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_updated_at
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_object();

REVOKE EXECUTE ON FUNCTION public.touch_knowledge_object() FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `01_object_touch .. ok`.

- [ ] **Step 5: Update the frontend drafts to store a base *revision*.** In `frontend/src/lib/objectForm.js`, replace `draftFromForm` and `formFromDraft` with:

```js
/** Draft payload that remembers which revision the edit started from. */
export function draftFromForm(form, baseRevision) {
  return { ...form, _baseRevision: baseRevision };
}

/**
 * Drafts saved before revisions existed carry `_baseVersion` (a different
 * counter); ignore it and fall back to the row's current revision.
 * @returns {{ form: ReturnType<typeof objectToEditForm>, baseRevision: number }}
 */
export function formFromDraft(draft, object) {
  const { _baseRevision, _baseVersion, ...fields } = draft;
  void _baseVersion;
  return {
    form: { ...objectToEditForm(object), ...fields },
    baseRevision: _baseRevision ?? object.revision,
  };
}
```

In `frontend/src/lib/objectForm.test.js`, replace the `describe('drafts keep the version they were based on', …)` block with:

```js
describe('drafts keep the revision they were based on', () => {
  const row = { ...object, revision: 7 };

  it('round-trips form and base revision', () => {
    const form = { ...objectToEditForm(row), title: 'Draft title' };
    const restored = formFromDraft(draftFromForm(form, 7), { ...row, revision: 9 });
    expect(restored.baseRevision).toBe(7);
    expect(restored.form.title).toBe('Draft title');
    expect(restored.form).not.toHaveProperty('_baseRevision');
  });

  it('ignores legacy _baseVersion drafts and uses the row revision', () => {
    const restored = formFromDraft({ title: 'Old draft', _baseVersion: 4 }, row);
    expect(restored.baseRevision).toBe(7);
    expect(restored.form).not.toHaveProperty('_baseVersion');
  });
});
```

- [ ] **Step 6: Run the frontend tests.**

Run (in `frontend/`): `npx vitest run src/lib/objectForm.test.js`

Expected: 7 passed.

- [ ] **Step 7: Guard saves on `revision`.**
  1. **`useObjectDetail.js`:** append `, revision` to the `OBJECT_COLS` string.
  2. **`ObjectDetail.jsx`, the ref:** rename `editBaseVersionRef` to `editBaseRevisionRef` everywhere (four places: the ref declaration, the draft restore, the draft save and the Edit button).
     - In the draft restore, set `editBaseRevisionRef.current = restored.baseRevision;`.
     - In the Edit button, set `editBaseRevisionRef.current = object.revision;`.
  3. **`ObjectDetail.jsx`, `handleSave`:** replace the `touchesVersioned` block (from `// Optimistic concurrency, only for versioned fields` through the `let query …` / `if (touchesVersioned) { … }` lines) with:

  ```js
        // Optimistic concurrency: revision bumps on every edit (views and pins
        // excluded), so any change made elsewhere since this edit began is caught.
        const query = supabase
          .from('knowledge_objects')
          .update(patch)
          .eq('id', object.id)
          .eq('revision', editBaseRevisionRef.current ?? object.revision);
  ```

  4. In the `.select('…')` string of that query, append `, revision`.

- [ ] **Step 8: Verify, including a manual two-tab check.**
  1. Run (in `frontend/`): `npm run lint && npm test && npm run build`. Expected: pass.
  2. Manual, against the local stack: point `frontend/.env` at the local API. `npx supabase status` prints the URL and anon key.
  3. Tab A changes an object's status and saves. Tab B, not reloaded, edits the title and saves. Tab B shows the conflict message.
  4. Opening the object in a third tab does **not** cause a conflict for tab A's next save.

- [ ] **Step 9: Commit.**

```bash
git add supabase/migrations/20260927000001_object_touch_and_revision.sql supabase/tests/database/01_object_touch.test.sql frontend/src/lib/objectForm.js frontend/src/lib/objectForm.test.js frontend/src/hooks/useObjectDetail.js frontend/src/pages/ObjectDetail.jsx
git commit -m "fix(db): views/pins no longer bump updated_at; revision column guards every edit"
```

---

### Task 3: Version history: service-role writes, user deletion, viewer privacy

This fixes audit findings:
- **B15:** `edited_by = auth.uid()` is NOT NULL, so SQL-editor, cron and MCP updates fail.
- **D5:** the `edited_by` FK blocks deleting a user.
- **S4:** viewers can read pre-share history.
- **The forged-version INSERT policy.**

**Files:**
- Create: `supabase/migrations/20260927000002_version_history_hardening.sql`, `supabase/tests/database/02_versions.test.sql`

**Interfaces:**
- Produces: `knowledge_object_versions.edited_by` is nullable, `ON DELETE SET NULL`. SELECT policy: owners and editors only.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/02_versions.test.sql`:

```sql
BEGIN;
SELECT plan(6);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
SELECT tests.create_user('viewer');
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'v1');
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000001', tests.uid('viewer'), 'viewer');

-- B15: an update with no auth.uid() (service role / SQL editor) must succeed.
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'v2' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'service-role update snapshots a version without a user');
SELECT ok(
  (SELECT edited_by IS NULL FROM public.knowledge_object_versions
   WHERE knowledge_object_id = '00000000-0000-0000-0000-000000000001'),
  'the snapshot records no editor');

SELECT tests.act_as('editor');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions), 1, 'editor can read history');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('viewer');
SELECT is((SELECT count(*)::int FROM public.knowledge_object_versions), 0, 'viewer cannot read history (S4)');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
SELECT throws_ok(
  format($$INSERT INTO public.knowledge_object_versions (knowledge_object_id, version, title, edited_by)
           VALUES ('00000000-0000-0000-0000-000000000001', 99, 'forged', %L)$$, tests.uid('owner')),
  '42501', NULL, 'nobody can insert version rows directly');

-- D5: deleting a user who edited a shared object must not fail on the FK.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('editor');
UPDATE public.knowledge_objects SET title = 'v3' WHERE id = '00000000-0000-0000-0000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok(format('DELETE FROM auth.users WHERE id = %L', tests.uid('editor')),
  'a user who edited someone else''s object can be deleted');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `02_versions` fails on the first `lives_ok`, with a not-null violation on `edited_by`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000002_version_history_hardening.sql`:

```sql
-- B15/D5: snapshots from service-role writes have no user; deleting a user keeps history.
ALTER TABLE public.knowledge_object_versions ALTER COLUMN edited_by DROP NOT NULL;
ALTER TABLE public.knowledge_object_versions
  DROP CONSTRAINT IF EXISTS knowledge_object_versions_edited_by_fkey;
ALTER TABLE public.knowledge_object_versions
  ADD CONSTRAINT knowledge_object_versions_edited_by_fkey
  FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kov_edited_by ON public.knowledge_object_versions(edited_by);

-- Versions are written only by the SECURITY DEFINER snapshot trigger; clients never insert.
DROP POLICY IF EXISTS "Users can insert versions for own objects" ON public.knowledge_object_versions;

-- S4: viewers see the current object only, not its history (which may predate the share).
DROP POLICY IF EXISTS "Users can read versions of own objects" ON public.knowledge_object_versions;
CREATE POLICY "Owners and editors can read versions"
  ON public.knowledge_object_versions FOR SELECT
  TO authenticated
  USING (
    public.owns_knowledge_object(knowledge_object_id)
    OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    )
  );
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `02_versions .. ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260927000002_version_history_hardening.sql supabase/tests/database/02_versions.test.sql
git commit -m "fix(db): version snapshots work without a user, survive user deletion, hidden from viewers"
```

---

### Task 4: Shared objects: editors change content only; trashed objects are hidden

This fixes audit findings:
- **S9:** shared users can read and edit trashed objects.
- **S10/S6:** editors can change `created_at`, `status`, `slug`, `cover_url`…

It also adds the `can_read_object` / `can_edit_object` helpers used by later tasks.

**Files:**
- Create: `supabase/migrations/20260927000003_shared_object_guard.sql`, `supabase/tests/database/03_shared_guard.test.sql`
- Modify: `frontend/src/pages/ObjectDetail.jsx` (owner-only inputs)

**Interfaces:**
- Produces:
  - `public.can_read_object(obj_id uuid) RETURNS boolean`
  - `public.can_edit_object(obj_id uuid) RETURNS boolean`
  - Both are SECURITY DEFINER, and both treat trashed objects as invisible to non-owners.
- Editors may change only `title`, `content`, `summary`, `source`, `key_points`. **Phase 0a must add `content_json` to this allow-list.**

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/03_shared_guard.test.sql`:

```sql
BEGIN;
SELECT plan(8);

SELECT tests.create_user('owner');
SELECT tests.create_user('editor');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Live'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('owner'), 'Trashed');
UPDATE public.knowledge_objects SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('editor'), 'editor'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('editor'), 'editor');

SELECT tests.act_as('editor');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET title = 'Edited', content = 'Body', summary = 'S', source = 'x'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'editor can change content fields');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot change status');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET cover_url = 'https://evil.example/px' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot set cover_url (tracking pixel, S6)');
SELECT throws_ok(
  $$UPDATE public.knowledge_objects SET created_at = now() - interval '9 years' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'editor cannot rewrite created_at');
SELECT is((SELECT count(*)::int FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  0, 'shared user cannot read a trashed object (S9)');
UPDATE public.knowledge_objects SET title = 'x' WHERE id = '00000000-0000-0000-0000-000000000002';
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT title FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000002'),
  'Trashed', 'shared user cannot edit a trashed object');

SELECT tests.act_as('owner');
SELECT lives_ok(
  $$UPDATE public.knowledge_objects SET status = 'archived', cover_url = NULL WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can change owner-only fields');
SELECT ok(public.can_edit_object('00000000-0000-0000-0000-000000000001'), 'can_edit_object true for owner');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `03_shared_guard` fails on "editor cannot change status" (it currently succeeds) and on the trashed-object read.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000003_shared_object_guard.sql`:

```sql
-- Read/edit helpers for policies on related tables. SECURITY DEFINER so they can read
-- knowledge_objects/share_permissions without recursing through RLS.
CREATE OR REPLACE FUNCTION public.can_read_object(obj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id
      AND (
        ko.user_id = auth.uid()
        OR (NOT ko.is_deleted AND EXISTS (
          SELECT 1 FROM public.share_permissions sp
          WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_object(obj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id
      AND (
        ko.user_id = auth.uid()
        OR (NOT ko.is_deleted AND EXISTS (
          SELECT 1 FROM public.share_permissions sp
          WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
            AND sp.role = 'editor'
        ))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_object(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_object(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_object(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_object(uuid) TO authenticated, service_role;

-- S9: shared users never see or edit trashed objects.
DROP POLICY IF EXISTS "Users can read own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can read own knowledge_objects"
  ON public.knowledge_objects FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Users can update own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can update own knowledge_objects"
  ON public.knowledge_objects FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    ))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR (NOT is_deleted AND EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = knowledge_objects.id
        AND sp.shared_with_user_id = (SELECT auth.uid())
        AND sp.role = 'editor'
    ))
  );

-- S10/S6: shared editors may change content fields only. Sessions without auth.uid()
-- (service role, SQL editor, migrations) are unrestricted.
CREATE OR REPLACE FUNCTION public.guard_knowledge_object_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Keep in sync with the editor UI. Phase 0a adds content_json here.
  editor_writable text[] := ARRAY['title', 'content', 'summary', 'source', 'key_points',
                                  'updated_at', 'revision', 'current_version', 'fts'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing the owner of an object is not allowed' USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id <> auth.uid()
     AND (to_jsonb(NEW) - editor_writable) IS DISTINCT FROM (to_jsonb(OLD) - editor_writable) THEN
    RAISE EXCEPTION 'Only the owner can change status, dates, cover, pin or trash state'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `03_shared_guard .. ok`, and all earlier files still ok.

- [ ] **Step 5: Disable owner-only inputs for editors.** In `frontend/src/pages/ObjectDetail.jsx`, in the edit form (the `<label>Status <select value={editForm.status}` line and the three lines after it):
  1. Add `disabled={!isOwner}` to the Status `<select>` and to the Due date, Remind at and Cover URL `<input>`s.
  2. Directly after the Cover URL `<label>…</label>`, add:

  ```jsx
            {!isOwner && <p className="form-hint">Only the owner can change status, dates and cover.</p>}
  ```

- [ ] **Step 6: Verify, including a manual check.**
  1. Run (in `frontend/`): `npm run lint && npm run build`. Expected: pass.
  2. Manual: sign in as a shared editor. The status, date and cover fields are disabled. Editing the title and saving works.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/20260927000003_shared_object_guard.sql supabase/tests/database/03_shared_guard.test.sql frontend/src/pages/ObjectDetail.jsx
git commit -m "fix(db): editors limited to content fields; trashed objects hidden from shared users"
```

---

### Task 5: Share by email without leaking accounts (invites)

This fixes audit findings:
- **S1:** unverified emails can receive shares.
- **S5:** emails can be enumerated, and shares are pushed without consent.

Sharing now always goes through `share_object_by_email`. It returns the same answer whether or not the email has an account, and grants access only to a **confirmed** email. Pending invites convert when the recipient confirms. A consent/accept screen is Phase 6 (U12).

**Files:**
- Create: `supabase/migrations/20260927000004_share_invites.sql`, `supabase/tests/database/04_share_invites.test.sql`
- Modify:
  - `frontend/src/pages/ObjectDetail.jsx` (`loadShares`, `handleAddShare`, `handleRevokeShare`)
  - `frontend/src/components/ObjectDetailSharePanel.jsx`

**Interfaces:**
- Produces:
  - Table `public.share_invites(id, knowledge_object_id, email, role, invited_by, created_at, accepted_at)`.
  - `public.share_object_by_email(p_object_id uuid, p_email text, p_role share_role) RETURNS jsonb`. Always returns `{"status":"ok"}`, or raises 42501 / 22023 / P0001.
  - Trigger `on_auth_user_confirmed` on `auth.users`.
- The legacy `resolve_user_id_by_email` gets a confirmed-email check now and is dropped in Task 11.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/04_share_invites.test.sql`:

```sql
BEGIN;
SELECT plan(9);

SELECT tests.create_user('owner');
SELECT tests.create_user('known');
SELECT tests.create_user('unconfirmed', false);
INSERT INTO public.knowledge_objects (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Doc');

SELECT tests.act_as('owner');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'KNOWN@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'sharing with a confirmed user returns ok');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'nobody@test.local', 'viewer'),
  '{"status": "ok"}'::jsonb, 'same response for an unknown email (no enumeration)');
SELECT is(public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'unconfirmed@test.local', 'editor'),
  '{"status": "ok"}'::jsonb, 'same response for an unconfirmed email');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('known')), 1, 'confirmed user got access immediately');
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 0, 'unconfirmed user got no access (S1)');

UPDATE auth.users SET email_confirmed_at = now() WHERE id = tests.uid('unconfirmed');
SELECT is((SELECT role::text FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('unconfirmed')), 'editor', 'invite converts on confirmation');

SELECT tests.create_user('latecomer');  -- the invite for this email was sent before signup
SELECT tests.act_as('owner');
SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'latecomer@test.local', 'viewer');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT is((SELECT count(*)::int FROM public.share_permissions
           WHERE shared_with_user_id = tests.uid('latecomer')), 1, 'an existing confirmed signup gets access');

SELECT tests.act_as('known');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'x@test.local', 'viewer')$$,
  '42501', NULL, 'only the owner can share');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('owner');
SELECT throws_ok(
  $$SELECT public.share_object_by_email('00000000-0000-0000-0000-000000000001', 'not-an-email', 'viewer')$$,
  '22023', NULL, 'invalid email is rejected');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `04_share_invites` fails with "function public.share_object_by_email does not exist".

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000004_share_invites.sql`:

```sql
-- S1/S5: sharing by email reveals nothing about which emails have accounts, and grants
-- access only to confirmed emails. Unconfirmed/unknown emails get a pending invite that
-- converts when that email is confirmed.

CREATE TABLE IF NOT EXISTS public.share_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_object_id uuid NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  email               text NOT NULL CHECK (email = lower(email)),
  role                share_role NOT NULL DEFAULT 'viewer',
  invited_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz,
  UNIQUE (knowledge_object_id, email)
);
CREATE INDEX IF NOT EXISTS idx_share_invites_email_pending
  ON public.share_invites(email) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_share_invites_invited_by
  ON public.share_invites(invited_by, created_at DESC);

ALTER TABLE public.share_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read invites for own objects"
  ON public.share_invites FOR SELECT TO authenticated
  USING (public.owns_knowledge_object(knowledge_object_id));
CREATE POLICY "Owners can delete invites for own objects"
  ON public.share_invites FOR DELETE TO authenticated
  USING (public.owns_knowledge_object(knowledge_object_id));
-- No INSERT/UPDATE policy: invites are written only by share_object_by_email.

CREATE OR REPLACE FUNCTION public.share_object_by_email(p_object_id uuid, p_email text, p_role share_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_recipient uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.owns_knowledge_object(p_object_id) THEN
    RAISE EXCEPTION 'Only the owner can share this object' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_email = (SELECT lower(email) FROM auth.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'You cannot share with yourself' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.share_invites
      WHERE invited_by = v_uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many shares in the last hour. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.share_invites (knowledge_object_id, email, role, invited_by)
  VALUES (p_object_id, v_email, p_role, v_uid)
  ON CONFLICT (knowledge_object_id, email) DO UPDATE SET role = EXCLUDED.role;

  SELECT id INTO v_recipient FROM auth.users
  WHERE lower(email) = v_email AND email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, shared_with_email, role)
    VALUES (p_object_id, v_recipient, v_email, p_role)
    ON CONFLICT (knowledge_object_id, shared_with_user_id) DO UPDATE SET role = EXCLUDED.role;
    UPDATE public.share_invites SET accepted_at = coalesce(accepted_at, now())
    WHERE knowledge_object_id = p_object_id AND email = v_email;
  END IF;

  -- Identical response whether or not the email has an account.
  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.share_object_by_email(uuid, text, share_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_object_by_email(uuid, text, share_role) TO authenticated, service_role;

-- Convert pending invites when an email becomes confirmed (signup with confirmation,
-- or a later confirmation of an existing account).
CREATE OR REPLACE FUNCTION public.accept_pending_share_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, shared_with_email, role)
  SELECT si.knowledge_object_id, NEW.id, si.email, si.role
  FROM public.share_invites si
  WHERE si.email = lower(NEW.email) AND si.accepted_at IS NULL
  ON CONFLICT (knowledge_object_id, shared_with_user_id) DO NOTHING;
  UPDATE public.share_invites SET accepted_at = now()
  WHERE email = lower(NEW.email) AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_pending_share_invites() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER INSERT OR UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.accept_pending_share_invites();

-- Revoking a share also removes its invite, so a later confirmation can't re-grant it.
CREATE OR REPLACE FUNCTION public.delete_invite_for_revoked_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.share_invites
  WHERE knowledge_object_id = OLD.knowledge_object_id
    AND email = lower(coalesce(OLD.shared_with_email,
                               (SELECT email FROM auth.users WHERE id = OLD.shared_with_user_id)));
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_invite_for_revoked_share() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_share_permissions_delete_invite ON public.share_permissions;
CREATE TRIGGER trg_share_permissions_delete_invite
  AFTER DELETE ON public.share_permissions
  FOR EACH ROW EXECUTE FUNCTION public.delete_invite_for_revoked_share();

-- S1 for old clients until Task 11 drops it: only confirmed emails resolve.
CREATE OR REPLACE FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id
  FROM auth.users au
  WHERE lower(au.email) = lower(trim(target_email))
    AND au.email_confirmed_at IS NOT NULL
    AND p_knowledge_object_id IS NOT NULL
    AND public.owns_knowledge_object(p_knowledge_object_id)
  LIMIT 1;
$$;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `04_share_invites .. ok`.

- [ ] **Step 5: Frontend: share through the RPC and show pending invites.** In `frontend/src/pages/ObjectDetail.jsx`:
  1. **`loadShares`:** replace its body with the code below.

  ```js
    async function loadShares() {
      if (!object?.id || !user?.id) return;
      const [sharesRes, invitesRes] = await Promise.all([
        supabase.from('share_permissions').select('id, shared_with_email, role, created_at')
          .eq('knowledge_object_id', object.id).order('created_at', { ascending: false }),
        supabase.from('share_invites').select('id, email, role, created_at')
          .eq('knowledge_object_id', object.id).is('accepted_at', null)
          .order('created_at', { ascending: false }),
      ]);
      if (sharesRes.error || invitesRes.error) {
        if (import.meta.env.DEV) console.warn('Failed to load shares:', sharesRes.error || invitesRes.error);
        setShares([]);
        return;
      }
      const pending = (invitesRes.data || []).map((i) => ({
        id: `invite:${i.id}`, shared_with_email: i.email, role: i.role, created_at: i.created_at, pending: true,
      }));
      setShares([...pending, ...(sharesRes.data || [])]);
    }
  ```

  2. **`handleAddShare`:** replace the whole `try { … }` block with:

  ```js
      try {
        const email = shareEmail.trim();
        const { error: rpcErr } = await supabase.rpc('share_object_by_email', {
          p_object_id: object.id,
          p_email: email,
          p_role: shareRole,
        });
        if (rpcErr) throw rpcErr;
        await loadShares();
        setShareEmail('');
        addToast('success', `Shared with ${email}. If they don't have a verified PKS account yet, they'll get access when they sign up.`);
      }
  ```

  3. **`handleRevokeShare`:** replace the `const { error: err } = await supabase.from('share_permissions')…` line with:

  ```js
        const { error: err } = shareId.startsWith('invite:')
          ? await supabase.from('share_invites').delete().eq('id', shareId.slice('invite:'.length))
          : await supabase.from('share_permissions').delete().eq('id', shareId).eq('knowledge_object_id', object.id);
  ```

  4. **`ObjectDetailSharePanel.jsx`:** inside `shares.map((s) => (`, directly after the element that renders `s.shared_with_email`, add:

  ```jsx
                {s.pending && <span className="muted"> · pending</span>}
  ```

- [ ] **Step 6: Verify, including a manual check.**
  1. Run (in `frontend/`): `npm run lint && npm test && npm run build`. Expected: pass.
  2. Manual, on the local stack (Inbucket at the URL `npx supabase status` prints):
     - Share with an unregistered email. The toast shows the same message as for a registered one, and the list shows "pending".
     - Sign up with that email and confirm it in Inbucket. The object appears for the new user.
     - Revoke a pending invite; it disappears.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/20260927000004_share_invites.sql supabase/tests/database/04_share_invites.test.sql frontend/src/pages/ObjectDetail.jsx frontend/src/components/ObjectDetailSharePanel.jsx
git commit -m "feat(sharing): invite-based sharing to confirmed emails only, no account enumeration"
```

---

### Task 6: Dashboard RPCs: no title leaks, user timezone, trash-aware link counts

This fixes audit findings:
- **S3:** `get_dashboard_activity` leaks the titles of unreadable objects.
- **B16:** "today" is computed in UTC.
- **D6:** link counts include trashed objects.

**Files:**
- Create: `supabase/migrations/20260927000005_dashboard_rpcs.sql`, `supabase/tests/database/05_dashboard.test.sql`

**Interfaces:**
- Produces: `public.user_day_start() RETURNS timestamptz`. It gives the start of today in the caller's `users.timezone`, falling back to UTC for unknown zones.
- Changes:
  - `get_dashboard_activity` becomes SECURITY INVOKER.
  - `get_dashboard_stats` keeps its output keys, including `pulse`, until Task 11.
  - `get_object_links_batch` filters trashed objects before ranking.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/05_dashboard.test.sql`:

```sql
BEGIN;
SELECT plan(5);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
UPDATE public.users SET timezone = 'Asia/Tokyo' WHERE id = tests.uid('alice');
UPDATE public.users SET timezone = 'Not/AZone' WHERE id = tests.uid('bob');

-- S3 fixture: bob shares X with alice; X links to bob's private Y.
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('bob'), 'Shared X'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('bob'), 'Private Y secret title'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('alice'), 'Alice A'),
  ('00000000-0000-0000-0000-000000000004', tests.uid('alice'), 'Alice trashed'),
  ('00000000-0000-0000-0000-000000000005', tests.uid('alice'), 'Alice live');
INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'viewer');
INSERT INTO public.link_edges (from_object_id, to_object_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005');
UPDATE public.knowledge_objects SET is_deleted = true WHERE id = '00000000-0000-0000-0000-000000000004';

SELECT tests.act_as('alice');
SELECT is(public.user_day_start(),
  date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo',
  'day start uses the user''s timezone (B16)');
SELECT ok(
  NOT (public.get_dashboard_activity()::text LIKE '%secret title%'),
  'activity does not leak titles of objects the caller cannot read (S3)');
SELECT is(
  (public.get_object_links_batch(ARRAY['00000000-0000-0000-0000-000000000003'::uuid])
     -> '00000000-0000-0000-0000-000000000003' ->> 'total')::int,
  1, 'link count ignores trashed neighbours (D6)');
SELECT ok(public.get_dashboard_stats() ? 'pulse', 'stats keeps the pulse key for old clients');

RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT tests.act_as('bob');
SELECT is(public.user_day_start(), date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  'an invalid timezone falls back to UTC');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `05_dashboard` fails with "function public.user_day_start() does not exist".

- [ ] **Step 3: Write the migration.** Create `supabase/migrations/20260927000005_dashboard_rpcs.sql`. It must redefine the three RPCs **exactly** as in `supabase/migrations/20250520000001_dashboard_pulse_stats.sql` and `supabase/migrations/20250521000001_dashboard_phase3_activity_links.sql`, with only the changes below.
  1. First, add:

  ```sql
  -- B16: "today" in the user's own timezone (users.timezone), UTC when unset or invalid.
  CREATE OR REPLACE FUNCTION public.user_day_start()
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    WITH tz AS (
      SELECT coalesce(
        (SELECT u.timezone FROM public.users u
         WHERE u.id = auth.uid()
           AND u.timezone IN (SELECT name FROM pg_timezone_names)),
        'UTC') AS name
    )
    SELECT date_trunc('day', now() AT TIME ZONE tz.name) AT TIME ZONE tz.name FROM tz;
  $$;
  REVOKE EXECUTE ON FUNCTION public.user_day_start() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.user_day_start() TO authenticated, service_role;
  ```

  2. **`get_dashboard_stats`:** copy it from `20250520000001` and replace every `date_trunc('day', now())` with `public.user_day_start()`. There are three, in `capture_today`, `tend_today` and `close_today`.
  3. **`get_dashboard_activity`:** copy it from `20250521000001`, then:
     - Change `SECURITY DEFINER` to `SECURITY INVOKER`. RLS on `knowledge_objects` and `link_edges` then removes any endpoint the caller can't read, so an inner join never yields its title.
     - In `day_bounds`, replace both `date_trunc('day', now())` with `public.user_day_start()`.
  4. **`get_object_links_batch`:** copy it from `20250521000001`, then:
     - In the `neighbors` CTE, add `JOIN public.knowledge_objects nko ON nko.id = CASE WHEN le.from_object_id = i.object_id THEN le.to_object_id ELSE le.from_object_id END AND nko.is_deleted = false` after the `JOIN public.link_edges le …` line.
     - The later `JOIN public.knowledge_objects ko ON … AND ko.is_deleted = false` can stay.
  5. After each `CREATE OR REPLACE FUNCTION`, keep the `GRANT EXECUTE … TO authenticated` lines from the originals.

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `05_dashboard .. ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260927000005_dashboard_rpcs.sql supabase/tests/database/05_dashboard.test.sql
git commit -m "fix(db): dashboard uses user timezone, no title leaks, trash-aware link counts"
```

---

### Task 7: Permanent delete removes files and storage; files can record their storage key

This fixes audit findings D4/B14 (hard delete leaves `files` rows and storage objects forever). It also fixes the side bug where `files` has no UPDATE policy, so `storage_key` is never saved, and adds a bucket size limit.

Supabase blocks deleting storage objects from SQL, so the RPC deletes the rows and returns the storage paths, and the client removes them through the Storage API.

**Files:**
- Create: `supabase/migrations/20260927000006_permanent_delete_and_files.sql`, `supabase/tests/database/06_permanent_delete.test.sql`
- Modify: `frontend/src/pages/Trash.jsx` (`handlePermanentDelete`)

**Interfaces:**
- Produces: `public.delete_object_permanently(p_object_id uuid) RETURNS jsonb`. The result is an array of `{ "id": uuid, "storage_key": text|null, "filename": text }` for files that became orphaned.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/06_permanent_delete.test.sql`:

```sql
BEGIN;
SELECT plan(6);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Trashed'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('alice'), 'Live'),
  ('00000000-0000-0000-0000-000000000003', tests.uid('bob'), 'Bob trashed');
UPDATE public.knowledge_objects SET is_deleted = true
WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
INSERT INTO public.files (id, user_id, filename, storage_key) VALUES
  ('00000000-0000-0000-0000-0000000000f1', tests.uid('alice'), 'only.pdf', 'k/only.pdf'),
  ('00000000-0000-0000-0000-0000000000f2', tests.uid('alice'), 'shared.pdf', 'k/shared.pdf');
INSERT INTO public.knowledge_object_files VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f2');

SELECT tests.act_as('alice');
SELECT throws_ok($$SELECT public.delete_object_permanently('00000000-0000-0000-0000-000000000002')$$,
  '42501', NULL, 'cannot permanently delete an object that is not in Trash');
SELECT throws_ok($$SELECT public.delete_object_permanently('00000000-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'cannot permanently delete someone else''s object');
SELECT is(
  public.delete_object_permanently('00000000-0000-0000-0000-000000000001'),
  '[{"id": "00000000-0000-0000-0000-0000000000f1", "filename": "only.pdf", "storage_key": "k/only.pdf"}]'::jsonb,
  'returns only files that are now orphaned');
SELECT is((SELECT count(*)::int FROM public.files WHERE id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'orphaned file row deleted');
SELECT is((SELECT count(*)::int FROM public.files WHERE id = '00000000-0000-0000-0000-0000000000f2'), 1,
  'file still attached elsewhere is kept');

SELECT lives_ok($$UPDATE public.files SET storage_key = 'k/new' WHERE id = '00000000-0000-0000-0000-0000000000f2'$$,
  'owner can record a storage key');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `06_permanent_delete` fails with "function public.delete_object_permanently does not exist".

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000006_permanent_delete_and_files.sql`:

```sql
-- The client records storage_key after upload; without an UPDATE policy that write was a no-op.
DROP POLICY IF EXISTS "Users can update own files" ON public.files;
CREATE POLICY "Users can update own files"
  ON public.files FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- D4/B14: permanently delete a trashed object and the file rows only it used. Storage objects
-- can't be deleted from SQL, so the orphaned paths are returned for the client to remove.
CREATE OR REPLACE FUNCTION public.delete_object_permanently(p_object_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphans jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_objects
    WHERE id = p_object_id AND user_id = auth.uid() AND is_deleted
  ) THEN
    RAISE EXCEPTION 'Only objects you own that are in Trash can be permanently deleted'
      USING ERRCODE = '42501';
  END IF;

  WITH orphan AS (
    SELECT f.id, f.filename, f.storage_key
    FROM public.files f
    JOIN public.knowledge_object_files kof ON kof.file_id = f.id AND kof.knowledge_object_id = p_object_id
    WHERE f.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.knowledge_object_files other
        WHERE other.file_id = f.id AND other.knowledge_object_id <> p_object_id
      )
  ), deleted AS (
    DELETE FROM public.files f USING orphan o WHERE f.id = o.id
    RETURNING o.id, o.filename, o.storage_key
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'filename', filename, 'storage_key', storage_key)), '[]'::jsonb)
  INTO v_orphans FROM deleted;

  DELETE FROM public.knowledge_objects WHERE id = p_object_id;
  RETURN v_orphans;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_object_permanently(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_object_permanently(uuid) TO authenticated, service_role;

-- 50 MB per file.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'pks-files';
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `06_permanent_delete .. ok`.

- [ ] **Step 5: Frontend: delete through the RPC, then remove the storage objects.** In `frontend/src/pages/Trash.jsx`:
  1. Add `import { FILES_BUCKET, getStoragePath } from '../lib/storage';`.
  2. Replace the `try { … }` body of `handlePermanentDelete` with:

  ```js
      try {
        const { data: orphans, error: err } = await supabase.rpc('delete_object_permanently', { p_object_id: id });
        if (err) throw err;
        const paths = (orphans || []).map((f) => f.storage_key || getStoragePath(user.id, f.id, f.filename));
        if (paths.length) {
          const { error: storageErr } = await supabase.storage.from(FILES_BUCKET).remove(paths);
          if (storageErr && import.meta.env.DEV) console.warn('Storage cleanup failed:', storageErr);
        }
        addToast('success', 'Permanently deleted');
        setObjects((prev) => prev.filter((o) => o.id !== id));
      }
  ```

- [ ] **Step 6: Verify, including a manual check.**
  1. Run (in `frontend/`): `npm run lint && npm run build`. Expected: pass.
  2. Manual, local stack:
     - Attach a file to an object, trash it, and permanently delete it.
     - In Studio (`npx supabase status` → Studio URL) → Storage → `pks-files`, the file is gone.
     - Attach one file to two objects and permanently delete one of them. The file remains.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/20260927000006_permanent_delete_and_files.sql supabase/tests/database/06_permanent_delete.test.sql frontend/src/pages/Trash.jsx
git commit -m "fix(files): permanent delete removes orphaned files and storage; storage_key is saved"
```

---

### Task 8: Prompt runs keep history and can't point at others' objects

This fixes audit findings:
- **D3:** deleting a template deletes its runs (ON DELETE CASCADE).
- **S13:** runs can reference objects the user can't read.

**Files:**
- Create: `supabase/migrations/20260927000007_prompt_runs_integrity.sql`, `supabase/tests/database/07_prompt_runs.test.sql`

**Interfaces:**
- Produces: `prompt_runs.prompt_template_id` → ON DELETE SET NULL. The INSERT/UPDATE checks require `can_read_object(knowledge_object_id)` and own-template.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/07_prompt_runs.test.sql`:

```sql
BEGIN;
SELECT plan(3);

SELECT tests.create_user('alice');
SELECT tests.create_user('bob');
INSERT INTO public.knowledge_objects (id, user_id, title) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('alice'), 'Alice'),
  ('00000000-0000-0000-0000-000000000002', tests.uid('bob'), 'Bob');
INSERT INTO public.prompt_templates (id, user_id, name, prompt_text)
VALUES ('00000000-0000-0000-0000-0000000000a1', tests.uid('alice'), 'T', 'Summarize');
INSERT INTO public.prompt_runs (user_id, prompt_template_id, knowledge_object_id, status, output)
VALUES (tests.uid('alice'), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'completed', 'out');

SELECT tests.act_as('alice');
DELETE FROM public.prompt_templates WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT is((SELECT count(*)::int FROM public.prompt_runs WHERE prompt_template_id IS NULL), 1,
  'deleting a template keeps its runs (D3)');
SELECT throws_ok(
  format($$INSERT INTO public.prompt_runs (user_id, knowledge_object_id, status)
           VALUES (%L, '00000000-0000-0000-0000-000000000002', 'completed')$$, tests.uid('alice')),
  '42501', NULL, 'cannot record a run against an object you cannot read (S13)');
SELECT lives_ok(
  format($$INSERT INTO public.prompt_runs (user_id, knowledge_object_id, status)
           VALUES (%L, '00000000-0000-0000-0000-000000000001', 'completed')$$, tests.uid('alice')),
  'can record a run against your own object');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `07_prompt_runs` fails on "deleting a template keeps its runs" (count 0).

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000007_prompt_runs_integrity.sql`:

```sql
-- D3: template deletion must not destroy run history.
ALTER TABLE public.prompt_runs DROP CONSTRAINT IF EXISTS prompt_runs_prompt_template_id_fkey;
ALTER TABLE public.prompt_runs
  ADD CONSTRAINT prompt_runs_prompt_template_id_fkey
  FOREIGN KEY (prompt_template_id) REFERENCES public.prompt_templates(id) ON DELETE SET NULL;

-- S13: runs may only reference readable objects and the caller's own templates.
DROP POLICY IF EXISTS "Users can manage own prompt_runs" ON public.prompt_runs;
CREATE POLICY "Users can read own prompt_runs"
  ON public.prompt_runs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own prompt_runs"
  ON public.prompt_runs FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own prompt_runs"
  ON public.prompt_runs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_read_object(knowledge_object_id)
    AND (prompt_template_id IS NULL OR EXISTS (
      SELECT 1 FROM public.prompt_templates pt
      WHERE pt.id = prompt_template_id AND pt.user_id = (SELECT auth.uid())
    ))
  );
CREATE POLICY "Users can update own prompt_runs"
  ON public.prompt_runs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_read_object(knowledge_object_id));

CREATE INDEX IF NOT EXISTS idx_prompt_runs_user_created ON public.prompt_runs(user_id, created_at DESC);
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `07_prompt_runs .. ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260927000007_prompt_runs_integrity.sql supabase/tests/database/07_prompt_runs.test.sql
git commit -m "fix(db): prompt runs survive template deletion and only reference readable objects"
```

---

### Task 9: RLS performance, index hygiene, case-insensitive tags/domains, `search_path`

**Files:**
- Create: `supabase/migrations/20260927000008_rls_and_index_hygiene.sql`, `supabase/tests/database/08_hygiene.test.sql`

**Interfaces:**
- Produces:
  - Unique indexes `domains_user_lower_name_key` and `tags_user_lower_name_key` on `(user_id, lower(name))`.
  - `create_domain` / `create_tag` return the existing row for a case-insensitive match.

- [ ] **Step 1: Write the failing test.** Create `supabase/tests/database/08_hygiene.test.sql`:

```sql
BEGIN;
SELECT plan(8);

SELECT tests.create_user('alice');
SELECT tests.act_as('alice');
SELECT is(
  (public.create_tag('AI') ->> 'id'),
  (public.create_tag('ai') ->> 'id'),
  'tags are unique case-insensitively');
SELECT is((public.create_domain('Work') ->> 'name'), 'Work', 'domain keeps its original casing');
SELECT is((public.create_domain('WORK') ->> 'name'), 'Work', 'a case-variant returns the existing domain');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
     AND NOT (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select auth\.uid\(\)'),
  0, 'no policy calls bare auth.uid() per row');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_knowledge_objects_type'),
  'redundant type index dropped');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_link_edges_from'),
  'unique-prefix index dropped');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_ko_user_updated_live'),
  'per-user recency index added');
SELECT ok(
  (SELECT 'search_path=public' = ANY(proconfig) FROM pg_proc WHERE proname = 'set_updated_at'),
  'set_updated_at pins search_path');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `08_hygiene` fails on the case-insensitive tag assertion.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260927000008_rls_and_index_hygiene.sql`:

```sql
-- 1. set_updated_at: the only function without a pinned search_path (Supabase linter).
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 2. Evaluate auth.uid() once per statement, not once per row (Supabase advisor auth_rls_initplan).
DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
      AND NOT (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select auth\.uid\(\)'
  LOOP
    v_qual := replace(p.qual, 'auth.uid()', '(SELECT auth.uid())');
    v_check := replace(p.with_check, 'auth.uid()', '(SELECT auth.uid())');
    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
  END LOOP;
END $$;

-- 3. Drop indexes that duplicate a primary key / unique prefix or are global instead of per-user.
DROP INDEX IF EXISTS public.idx_knowledge_objects_is_deleted;
DROP INDEX IF EXISTS public.idx_knowledge_objects_type;
DROP INDEX IF EXISTS public.idx_knowledge_objects_updated_at;
DROP INDEX IF EXISTS public.idx_knowledge_object_versions_object_id;
DROP INDEX IF EXISTS public.idx_kod_object;
DROP INDEX IF EXISTS public.idx_kot_object;
DROP INDEX IF EXISTS public.idx_kof_object;
DROP INDEX IF EXISTS public.idx_link_edges_from;
DROP INDEX IF EXISTS public.idx_share_permissions_object;
DROP INDEX IF EXISTS public.idx_notifications_user_id;
DROP INDEX IF EXISTS public.idx_notifications_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_integrations_user_id;
DROP INDEX IF EXISTS public.idx_files_storage_key;

-- 4. Per-user indexes for the queries the app actually runs.
CREATE INDEX IF NOT EXISTS idx_ko_user_updated_live
  ON public.knowledge_objects(user_id, updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_ko_user_pinned_updated_live
  ON public.knowledge_objects(user_id, is_pinned DESC, updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs(user_id, created_at DESC);

-- 5. Case-insensitive tag/domain names. Merge existing case-duplicates into the oldest row.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['domains', 'tags'] LOOP
    EXECUTE format($f$
      WITH ranked AS (
        SELECT id, user_id, lower(name) AS lname,
               first_value(id) OVER (PARTITION BY user_id, lower(name) ORDER BY created_at, id) AS keep_id
        FROM public.%1$I
      )
      UPDATE public.%2$I j SET %3$I = r.keep_id
      FROM ranked r
      WHERE j.%3$I = r.id AND r.id <> r.keep_id
        AND NOT EXISTS (SELECT 1 FROM public.%2$I d
                        WHERE d.knowledge_object_id = j.knowledge_object_id AND d.%3$I = r.keep_id)
    $f$, t,
      CASE t WHEN 'domains' THEN 'knowledge_object_domains' ELSE 'knowledge_object_tags' END,
      CASE t WHEN 'domains' THEN 'domain_id' ELSE 'tag_id' END);
    EXECUTE format($f$
      DELETE FROM public.%1$I x
      USING public.%1$I k
      WHERE x.user_id = k.user_id AND lower(x.name) = lower(k.name)
        AND (k.created_at, k.id) < (x.created_at, x.id)
    $f$, t);
  END LOOP;
END $$;

ALTER TABLE public.domains DROP CONSTRAINT IF EXISTS domains_user_id_name_key;
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_user_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS domains_user_lower_name_key ON public.domains(user_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_lower_name_key ON public.tags(user_id, lower(name));

CREATE OR REPLACE FUNCTION public.create_domain(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_row public.domains;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Domain name is required' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION 'Domain name too long' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.domains (user_id, name) VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = public.domains.name
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tag(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_row public.tags;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION 'Tag name too long' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.tags (user_id, name) VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = public.tags.name
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END;
$$;
```

- [ ] **Step 4: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: `08_hygiene .. ok`, and **every** earlier file is still ok. The policy rewrite touches all of them.

- [ ] **Step 5: Add a merge test for existing duplicates.** Append to `08_hygiene.test.sql`, before `SELECT * FROM finish();`, and change `plan(8)` to `plan(9)`:

```sql
-- Duplicates created before the unique index are merged without losing tags on objects.
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.tags GROUP BY user_id, lower(name) HAVING count(*) > 1),
  'no case-duplicate tags remain');
```

Run: `npx supabase db reset && npx supabase test db`

Expected: ok.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260927000008_rls_and_index_hygiene.sql supabase/tests/database/08_hygiene.test.sql
git commit -m "perf(db): initplan-friendly RLS, per-user indexes, case-insensitive tags/domains"
```

---

### Task 10: Run the database tests in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (created in −1A Task 18)

**Interfaces:**
- Consumes: `supabase/config.toml`, `supabase/seed.sql`, `supabase/tests/database/*`.
- Produces: none.

- [ ] **Step 1: Add the job.** Append under `jobs:` in `.github/workflows/ci.yml`:

```yaml
  database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase db start
      - run: supabase test db
```

- [ ] **Step 2: Validate locally the way CI runs it.**

Run: `npx supabase stop --no-backup && npx supabase db start && npx supabase test db`

Expected: `All tests successful.`

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run pgTAP database tests"
```

---

### Task 11 (gated): Contract: drop schema that no client uses

**Gate:** run this task only when **all** of these are true. Ask the owner to confirm.
- −1A and Tasks 2 and 5 of this plan have been in production for at least 2 weeks.
- The owner has confirmed that no one runs an app version older than that. The update prompt from −1A Task 12 has been shown.

**Files:**
- Create: `supabase/migrations/20260927000010_contract_dead_schema.sql`, `supabase/tests/database/10_contract.test.sql`
- Modify: `supabase/tests/database/05_dashboard.test.sql` (drop the pulse assertion). Never edit an applied migration: `get_dashboard_stats` is redefined in the new one.

**Interfaces:**
- Removes:
  - `export_jobs`, `export_job_items`, and the `export_format` / `export_template` / `export_status` enums
  - `import_items`, `import_get_existing_object`, `import_register`
  - `prompt_templates.visibility`, `prompt_templates.version`
  - `resolve_user_id_by_email`
  - The `pulse` key of `get_dashboard_stats`

- [ ] **Step 1: Confirm nothing in the app uses them.**

Run: `CG_OK=1 grep -rnE "export_jobs|export_job_items|import_items|import_register|import_get_existing|resolve_user_id_by_email|\.visibility|pulse" frontend/src supabase/functions`

Expected: no output. If anything matches, stop and remove that usage first.

- [ ] **Step 2: Write the failing test.** Create `supabase/tests/database/10_contract.test.sql`:

```sql
BEGIN;
SELECT plan(5);
SELECT hasnt_table('public', 'export_jobs', 'export_jobs dropped');
SELECT hasnt_table('public', 'import_items', 'import_items dropped');
SELECT hasnt_column('public', 'prompt_templates', 'visibility', 'visibility dropped');
SELECT hasnt_function('public', 'resolve_user_id_by_email', 'legacy email resolver dropped');
SELECT tests.create_user('alice');
SELECT tests.act_as('alice');
SELECT ok(NOT (public.get_dashboard_stats() ? 'pulse'), 'stats no longer returns pulse');
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Run it and confirm it fails.**

Run: `npx supabase test db`

Expected: `10_contract` fails on "export_jobs dropped". Also delete the assertion `stats keeps the pulse key for old clients` from `05_dashboard.test.sql` and change its `plan(5)` to `plan(4)`.

- [ ] **Step 4: Write the migration** `supabase/migrations/20260927000010_contract_dead_schema.sql`:
  1. Start with:

  ```sql
  DROP TABLE IF EXISTS public.export_job_items;
  DROP TABLE IF EXISTS public.export_jobs;
  DROP TYPE IF EXISTS public.export_format;
  DROP TYPE IF EXISTS public.export_template;
  DROP TYPE IF EXISTS public.export_status;

  DROP FUNCTION IF EXISTS public.import_register(uuid, text, uuid, jsonb);
  DROP FUNCTION IF EXISTS public.import_get_existing_object(uuid, text);
  DROP TABLE IF EXISTS public.import_items;

  ALTER TABLE public.prompt_templates DROP COLUMN IF EXISTS visibility;
  ALTER TABLE public.prompt_templates DROP COLUMN IF EXISTS version;

  DROP FUNCTION IF EXISTS public.resolve_user_id_by_email(text, uuid);
  ```

  2. Then copy `get_dashboard_stats` from `20260927000005_dashboard_rpcs.sql` and remove:
     - the `capture_today`, `tend_today` and `close_today` lines in `totals`;
     - the `owned_today` CTE;
     - the `'pulse', jsonb_build_object(…)` entry.

- [ ] **Step 5: Run it and confirm it passes.**

Run: `npx supabase db reset && npx supabase test db`

Expected: all ok.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260927000010_contract_dead_schema.sql supabase/tests/database
git commit -m "chore(db): drop export/import bookkeeping, legacy resolver and pulse stats"
```

---

### Task 12: Hand-off for the production deploy (owner)

Nothing is applied to production inside a task. This is the checklist the owner runs.

No Docker is needed. Set `PROD` (the Session pooler connection, password in pgpass) as in the −1C runbook's Prerequisites.

- [ ] **Step 1: Back up.** Supabase dashboard → Database → Backups: download the latest. Also run:

  ```bash
  pg_dump "$PROD" --schema-only -f supabase/backups/pre-1b1-schema.sql
  pg_dump "$PROD" --data-only --schema=public --schema=auth --schema=storage -f supabase/backups/pre-1b1-data.sql
  ```

- [ ] **Step 2: Check for drift.** −1C must be done first. Production must still equal the baseline:

  ```bash
  pg_dump "$PROD" --schema-only --schema=public --no-owner -f supabase/backups/prod-public.sql
  mkdir -p ../pks-pending && mv supabase/migrations/20260927*.sql ../pks-pending/
  bash supabase/local-test/run.sh --build-only
  bash supabase/local-test/compare-schema.sh supabase/backups/prod-public.sql
  mv ../pks-pending/*.sql supabase/migrations/ && rmdir ../pks-pending
  ```

  - Expected: `No schema differences.`
  - If differences show up, someone changed production since the squash. Stop and reconcile them first.
- [ ] **Step 3: Apply.** Run `npx supabase db push` (link first with `npx supabase link --project-ref <ref>`). Then deploy the frontend. Never pass `--include-seed`: `supabase/seed.sql` holds test-only helpers (e.g. `tests.create_user`) that must not reach production.
- [ ] **Step 4: Check the advisors.** Supabase dashboard → Advisors → Security and Performance: no new errors. Fix any "auth_rls_initplan" or "function_search_path_mutable" warnings the rewrite missed.
- [ ] **Step 5: Schedule Task 11** two weeks after the frontend deploy.
