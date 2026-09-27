# Phase −1C: Migration Squash Runbook (owner-run)

> **This is a runbook for the project owner, not an agent plan.** It needs production database credentials and changes production migration *history*. Run it by hand, step by step. An agent may help read output, but must not run the commands against production.

**Goal:** Replace the 46 historical migrations (unreliable, partly built in the SQL editor, with a non-idempotent enum migration and redefined search RPCs) with **one baseline migration that matches production exactly**. Then mark the history so `supabase db push` and `supabase db reset` work cleanly from then on.

**What changes:** only migration *files* in the repo and the *migration history table* in production. **No production schema or data changes.** The baseline describes what production already is.

**Why:** −1B1 and every later phase ship forward migrations. Their tests replay migrations on a fresh local database, and that replay must reproduce production. See audit §4, "Squash recommendation".

**Spec:**
- [`docs/plans/2026-09-26-codebase-audit.md`](../../plans/2026-09-26-codebase-audit.md): §4 Migrations, §H/§I of the database audit.
- [Roadmap Phase −1](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md).

## When to run it

**Recommended order:**
1. −1A (frontend)
2. **−1C (this runbook)**
3. Apply −1B1 migrations to production
4. Apply −1B2 migrations to production

- **If −1B1's local work is already merged but not yet in production:** fine. Run this runbook; the −1B1 migration files (`20260927000001…`) stay where they are and are applied afterwards.
- **If −1B1 or −1B2 migrations are already applied in production:** use the "Already applied" variant in Step 6.

Allow about 1–2 hours. Pick a time when nobody is changing the schema from the dashboard.

## Prerequisites

- Docker Desktop running (`docker info` works). The CLI runs `pg_dump` inside Docker.
- Supabase CLI: `npx supabase --version` (2.x).
- The production **project ref** (Supabase dashboard URL: `supabase.com/dashboard/project/<ref>`).
- The **database password** (dashboard → Project Settings → Database). Keep it out of shell history; the CLI prompts for it.
- A clean git working tree on a new branch: `git switch -c chore/migration-squash`.

---

### Step 1: Freeze and link

- [ ] Tell anyone with dashboard access not to change tables, policies or functions until this runbook is finished.
- [ ] Link the repo to production (you'll be prompted for the DB password):

```bash
npx supabase link --project-ref <ref>
```

- [ ] Record the current remote history, to compare against later:

```bash
npx supabase migration list --linked > squash-history-before.txt
```

Expected: a table of local vs remote versions. Note any version that exists **remotely but not locally**, or the reverse. Those rows are the drift this runbook resolves.

### Step 2: Back up production (never skip)

- [ ] Keep backups out of git:

```bash
mkdir -p supabase/backups
echo "supabase/backups/" >> .gitignore
```

- [ ] Dump schema, data and roles:

```bash
npx supabase db dump --linked -f supabase/backups/2026-09-27-schema.sql
npx supabase db dump --linked --data-only --use-copy -f supabase/backups/2026-09-27-data.sql
npx supabase db dump --linked --role-only -f supabase/backups/2026-09-27-roles.sql
```

Expected: three non-empty files. Check with `wc -l supabase/backups/*.sql`.

- [ ] Also download the latest daily backup from dashboard → Database → Backups, if your plan has them.
- [ ] Storage files (attachments in the `pks-files` bucket) are **not** in these dumps. The squash doesn't touch storage, so a separate storage backup is optional here.

### Step 3: Measure the drift between the repo and production

- [ ] Replay the current repo migrations on a local database:

```bash
npx supabase start
npx supabase db reset
```

- **If this fails:** note the failing migration file and error in `squash-notes.md`. That is exactly the drift the squash removes. Continue; the baseline comes from production, not from these files.
- [ ] If it succeeded, diff the local database (repo history) against production:

```bash
npx supabase db diff --linked --schema public,storage -f squash-drift
```

- The file lands in `supabase/migrations/…_squash-drift.sql`. **Read it, then delete it**; it is information, not a migration.
- Every statement in it is a place where production differs from the repo, for example a policy or function edited in the SQL editor.
- Production is the source of truth, and the baseline captures it. Write anything surprising in `squash-notes.md`.

### Step 4: Create the baseline from production

- [ ] Dump the `public` schema from production as the baseline. The timestamp sorts after every old migration and before −1B1's `20260927000001`:

```bash
npx supabase db dump --linked --schema public -f supabase/migrations/20260926235959_baseline.sql
```

- [ ] **Append what `--schema public` leaves out.** These objects live in the managed `auth` and `storage` schemas and would otherwise be lost on a fresh `db reset`. Append the block below to the end of `supabase/migrations/20260926235959_baseline.sql`. Each part is copied from the named historical migration, so check it against the Step 2 schema dump before saving.

```sql
-- ---------------------------------------------------------------------------
-- Objects outside the public schema (not included by `db dump --schema public`)
-- ---------------------------------------------------------------------------

-- auth.users triggers (from 20250212000001_phase1_users.sql and 20260926000001 §4)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- Storage bucket and policies (from 20250219000003_storage_bucket_pks_files.sql)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pks-files', 'pks-files', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

DROP POLICY IF EXISTS "pks-files insert own" ON storage.objects;
CREATE POLICY "pks-files insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "pks-files select own" ON storage.objects;
CREATE POLICY "pks-files select own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "pks-files delete own" ON storage.objects;
CREATE POLICY "pks-files delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);
```

- [ ] **Cross-check the appended block against production.** In the Step 2 schema dump, run `grep -n "ON auth.users\|ON storage.objects" supabase/backups/2026-09-27-schema.sql`.
  - If production has an **extra** trigger or storage policy that isn't in the block, add it.
  - If a policy's text differs, use production's text.
- [ ] Check the baseline's header. Remove any `CREATE SCHEMA public` / `ALTER SCHEMA public OWNER` lines if `db reset` complains in Step 5. The public schema already exists in a fresh Supabase database.

### Step 5: Archive the old migrations and replay the baseline locally

- [ ] Move the history out of the CLI's path (kept for reference, never applied again):

```bash
mkdir -p supabase/migrations_archive
git mv supabase/migrations/2025*.sql supabase/migrations_archive/
git mv supabase/migrations/20260926000001_security_sharing_and_privileges.sql \
       supabase/migrations/20260926000002_ai_key_privacy_and_server_quota.sql \
       supabase/migrations/20260926000003_ai_provider_anthropic.sql \
       supabase/migrations_archive/
ls supabase/migrations
```

Expected: `20260926235959_baseline.sql`, plus any −1B1/−1B2 migrations (`20260927…`) if their code is already merged.

- [ ] Replay from scratch:

```bash
npx supabase db reset
```

Expected: success. If it fails, read the error. Common fixes:
- a statement referencing a role or extension that production has but local doesn't: add `CREATE EXTENSION IF NOT EXISTS <name> WITH SCHEMA extensions;` at the top of the baseline;
- the `CREATE SCHEMA public` line from Step 4.

Fix and re-run until it passes.

- [ ] If the −1B1 test harness exists, run the tests:

```bash
npx supabase test db
```

Expected: `All tests successful.`

- [ ] **Prove the baseline equals production.** Temporarily move any `20260927…` migrations aside, so only the baseline is compared:

```bash
mkdir -p /tmp/pks-pending && mv supabase/migrations/20260927*.sql /tmp/pks-pending/ 2>/dev/null || true
npx supabase db reset
npx supabase db diff --linked --schema public,storage
mv /tmp/pks-pending/*.sql supabase/migrations/ 2>/dev/null || true
```

Expected: **"No schema changes found"**, or only harmless noise such as ownership or grant ordering. Any real difference (a missing policy, a different function body) means the baseline is incomplete. Fix it in the baseline file and repeat this check. **Don't continue until the diff is empty.**

### Step 6: Repair the production migration history

This step only edits `supabase_migrations.schema_migrations` in production. It tells the CLI that the old versions are gone and the baseline is already applied.

- [ ] Mark every archived version as reverted:

```bash
ls supabase/migrations_archive/*.sql | xargs -n1 basename | cut -d_ -f1 \
  | xargs npx supabase migration repair --linked --status reverted
```

- [ ] Mark the baseline as applied (production already has this schema):

```bash
npx supabase migration repair --linked --status applied 20260926235959
```

- [ ] **"Already applied" variant.** If any `20260927…` migrations were already pushed to production before this runbook:
  1. They are already inside the baseline dump.
  2. Move those files to `supabase/migrations_archive/` as well.
  3. Mark them `--status reverted` with the command above.
  4. Re-run Step 5's replay and diff.

- [ ] Verify:

```bash
npx supabase migration list --linked > squash-history-after.txt
cat squash-history-after.txt
```

Expected:
- The baseline shows in both the Local and Remote columns.
- No archived versions remain.
- Any pending `20260927…` migrations show as Local only, ready for `db push` later.

### Step 7: Clean up and commit

- [ ] Delete the scripts the audit marked for removal once the squash is done:

```bash
git rm supabase/scripts/repair-migration-history.ps1 supabase/scripts/apply-link-edges-only.sql
```

- [ ] Commit (backups and notes are not committed):

```bash
git add .gitignore supabase/migrations supabase/migrations_archive
git commit -m "chore(db): squash 46 historical migrations into a verified production baseline"
```

- [ ] Push the branch and open a PR. CI's `database` job (from −1B1 Task 10, if merged) must be green.
- [ ] Keep `supabase/backups/` somewhere safe outside the repo for at least 30 days.

### Step 8: Unfreeze

- [ ] Tell collaborators that schema changes now go **only** through new migration files. No more SQL-editor edits.
- [ ] Continue with −1B1 Task 12 to apply the pending migrations.

---

## Rollback

Squashing changes no production schema or data. Only history rows change, so rollback is also history-only:

```bash
npx supabase migration repair --linked --status reverted 20260926235959
ls supabase/migrations_archive/*.sql | xargs -n1 basename | cut -d_ -f1 \
  | xargs npx supabase migration repair --linked --status applied
git switch main   # discard the squash branch
```

If anything in production looks wrong afterwards, restore from the Step 2 dumps. This should never be needed, because no step alters production objects.

## Done when

- `npx supabase db reset` replays cleanly from the baseline.
- `npx supabase db diff --linked --schema public,storage` shows no changes, with only the baseline in `supabase/migrations`.
- `migration list --linked` shows the baseline in Local and Remote, and no archived versions.
- The −1B1 test suite (if present) passes on the baseline.
