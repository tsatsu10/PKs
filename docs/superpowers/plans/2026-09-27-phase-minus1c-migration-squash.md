# Phase −1C: Migration Squash Runbook (owner-run, no Docker)

> **This is a runbook for the project owner, not an agent plan.** It needs production database credentials and changes production migration *history*. Run it by hand, step by step. An agent may help read output, but must not run commands against production.

**Goal:** replace the 46 historical migrations with **one baseline migration that matches production exactly**. The old migrations are unreliable: some were built in the SQL editor, one enum migration isn't idempotent, and the search RPCs were redefined. After the squash, mark the history so `supabase db push` works cleanly from then on.

**What changes:** only migration *files* in the repo and the *migration history table* in production. **No production schema or data changes.** The baseline describes what production already is.

**Why:** −1B1 and every later phase ship forward migrations. Their tests replay the migrations on a fresh database, and that replay must reproduce production. See audit §4, "Squash recommendation".

**No Docker.** The owner's machine has no Docker, so this runbook uses Docker-free tools only:

| Job | Tool |
|---|---|
| Dumps (replacing `supabase db dump`) | The local PostgreSQL 18 `pg_dump` |
| Local replays (replacing `supabase start` / `db reset`) | The private test server and `supabase/local-test/run.sh` |
| Schema comparison (replacing `supabase db diff`) | `supabase/local-test/compare-schema.sh` |
| Link, history and repair | The Supabase CLI commands `link`, `migration list` and `migration repair`. They talk to production directly and don't need Docker. |

CI's `database` job still replays everything on the real Supabase stack. That is the final check.

**Spec:**
- [`docs/plans/2026-09-26-codebase-audit.md`](../../plans/2026-09-26-codebase-audit.md): §4 Migrations, §H/§I of the database audit.
- [Roadmap Phase −1](../../plans/2026-09-26-ultimate-knowledge-base-roadmap.md).

## When to run it

**Recommended order:**
1. −1A (frontend)
2. **−1C (this runbook)**
3. Apply −1B1 migrations to production
4. Apply −1B2 migrations to production

- **If −1B1's code is already merged but not yet in production:** fine. Run this runbook. The −1B1 migration files (`20260927…`) stay where they are and are applied afterwards.
- **If −1B1 or −1B2 migrations are already applied in production:** use the "Already applied" variant in Step 6.

Allow about 1–2 hours. Pick a time when nobody is changing the schema from the dashboard.

## Prerequisites

- **PostgreSQL 18 client tools** on PATH: `pg_dump --version` and `psql --version` both print 18.x. They are already installed with PostgreSQL 18. pg_dump 18 can dump the older production server.
- **The private test server** is running on port 54329. If `psql -h localhost -p 54329 -U postgres -c "select 1"` fails, start it:

  ```bash
  "/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D C:/Users/elike/AppData/Local/pks-pgtest/data \
    -l C:/Users/elike/AppData/Local/pks-pgtest/server.log -o "-p 54329 -c listen_addresses=localhost" start
  ```

- **Supabase CLI:** `npx supabase --version` (2.x). Only the commands that don't need Docker are used.
- **The production project ref**, from the dashboard URL `supabase.com/dashboard/project/<ref>`.
- **The Session pooler connection details:** dashboard → **Connect** → **Session pooler**. They look like `postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
  - Use the Session pooler, not "Direct connection": direct connections are IPv6-only on many networks.
  - The database password is under Project Settings → Database, and can be reset there.
- **The password in pgpass, not in shell history.** Add one line to `C:\Users\elike\AppData\Roaming\postgresql\pgpass.conf`. Create the folder or file if missing, and watch that Notepad doesn't save it as `.txt`:

  ```
  aws-0-<region>.pooler.supabase.com:5432:postgres:postgres.<ref>:<password>
  ```

- **A clean git working tree** on a new branch: `git switch -c chore/migration-squash`.

In every shell you use for this runbook, set the production connection once. It holds no password:

```bash
PROD="host=aws-0-<region>.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require"
psql "$PROD" -c "select version()"   # expected: PostgreSQL 15.x or 17.x, and no password prompt
```

---

### Step 1: Freeze and link

- [ ] Tell anyone with dashboard access not to change tables, policies or functions until this runbook is finished.
- [ ] Link the repo to production. The CLI prompts for the database password:

```bash
npx supabase link --project-ref <ref>
```

- [ ] Record the current remote history, to compare against later:

```bash
npx supabase migration list --linked > squash-history-before.txt
```

Expected: a table of local versus remote versions. Note any version that exists **remotely but not locally**, or the reverse. Those rows are the drift this runbook resolves.

### Step 2: Back up production (never skip)

- [ ] Keep backups out of git:

```bash
mkdir -p supabase/backups
grep -qx "supabase/backups/" .gitignore || echo "supabase/backups/" >> .gitignore
```

- [ ] Dump the whole schema, and the data of the schemas that hold user data:

```bash
pg_dump "$PROD" --schema-only -f supabase/backups/squash-schema.sql
pg_dump "$PROD" --data-only --schema=public --schema=auth --schema=storage -f supabase/backups/squash-data.sql
```

Expected: two non-empty files. Check with `wc -l supabase/backups/*.sql`.
- If the data dump stops with "permission denied" on a table in `auth` or `storage`, drop that `--schema=` flag, re-run, and note it.
- The `public` data is what matters most.
- Roles are managed by Supabase, so they aren't dumped. `pg_dumpall --roles-only` needs superuser, which Supabase doesn't give you.

- [ ] Also download the latest daily backup from dashboard → Database → Backups, if your plan has them.
- [ ] Storage files (attachments in the `pks-files` bucket) are **not** in these dumps. The squash doesn't touch storage, so a separate storage backup is optional here.

### Step 3: Measure the drift between the repo and production

- [ ] Dump production's `public` schema. This is the reference for every comparison below:

```bash
pg_dump "$PROD" --schema-only --schema=public --no-owner -f supabase/backups/prod-public.sql
```

- [ ] Replay the current repo history locally, without the new `20260927…` files, and compare it with production:

```bash
mkdir -p ../pks-pending && mv supabase/migrations/20260927*.sql ../pks-pending/ 2>/dev/null || true
bash supabase/local-test/run.sh --build-only
bash supabase/local-test/compare-schema.sh supabase/backups/prod-public.sql
```

- **If `run.sh` fails:** note the failing migration file and error in `squash-notes.md`. That is exactly the drift the squash removes. Continue; the baseline comes from production, not from these files.
- **If the compare reports differences:** read `schema-diff.txt`. Lines starting with `-` exist only in production; `+` exist only in the repo history. Each one is a place where production differs from the repo, for example a policy edited in the SQL editor. Production is the source of truth, and the baseline captures it. Copy anything surprising into `squash-notes.md`, then delete `schema-diff.txt`.

Leave the `20260927…` files in `../pks-pending` until Step 5 says to restore them.

### Step 4: Create the baseline from production

- [ ] Copy production's `public` dump into place as the baseline, then clean it:

```bash
cp supabase/backups/prod-public.sql supabase/migrations/20260926235959_baseline.sql
bash supabase/local-test/clean-baseline.sh supabase/migrations/20260926235959_baseline.sql
```

The timestamp sorts after every old migration and before −1B1's `20260927000001`.

`clean-baseline.sh` does two things.

**It removes lines that break a Supabase migration:**
- `\restrict` / `\unrestrict` (psql-only; `supabase db push` rejects them);
- `SET transaction_timeout` (fails on Postgres 15);
- the empty `search_path` setting (would leak into the `20260927…` migrations that run after it);
- `CREATE SCHEMA public`;
- Supabase's own `supabase_admin` default privileges.

**It adds a reset of default privileges at the top.** Without it, a fresh replay would re-grant what production revoked, for example `anon` EXECUTE on `resolve_user_id_by_email` and reads on `user_ai_providers`. pg_dump writes permissions as if PostgreSQL's built-in defaults applied, but every Supabase database grants new objects to `anon`/`authenticated`/`service_role`. The dump's last lines restore production's defaults.

Expected: `Cleaned …` and no `WARNING`.

- [ ] **Append what `--schema=public` leaves out.** These objects live in the managed `auth` and `storage` schemas and would otherwise be missing from a fresh replay. Append this block to the end of `supabase/migrations/20260926235959_baseline.sql`. Each part is copied from the named historical migration.

```sql
-- ---------------------------------------------------------------------------
-- Objects outside the public schema (not included by `pg_dump --schema=public`)
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

- [ ] **Cross-check that block against production.** List production's triggers on `auth.users` and its policies on `storage.objects`:

```bash
psql "$PROD" -X -At \
  -c "select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1" \
  -c "select policyname || ' | ' || cmd || ' | ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1" \
  > supabase/backups/prod-extras.txt
cat supabase/backups/prod-extras.txt
```

Expected: the triggers `on_auth_user_created` and `on_auth_user_email_changed`, and the three `pks-files …` policies.
- If production has an **extra** trigger or storage policy, add it to the block.
- If a policy's condition differs, use production's text.
- Ignore triggers and policies that Supabase itself manages, if any show up. Note them in `squash-notes.md`.

### Step 5: Archive the old migrations and prove the baseline equals production

- [ ] Move the history out of the migration path. It is kept for reference and never applied again:

```bash
mkdir -p supabase/migrations_archive
git mv supabase/migrations/2025*.sql supabase/migrations_archive/
git mv supabase/migrations/20260926000001_security_sharing_and_privileges.sql \
       supabase/migrations/20260926000002_ai_key_privacy_and_server_quota.sql \
       supabase/migrations/20260926000003_ai_provider_anthropic.sql \
       supabase/migrations_archive/
ls supabase/migrations
```

Expected: only `20260926235959_baseline.sql`, because the `20260927…` files are still in `../pks-pending`.

- [ ] **Prove the baseline equals production.** Replay the baseline alone and compare:

```bash
bash supabase/local-test/run.sh --build-only
bash supabase/local-test/compare-schema.sh supabase/backups/prod-public.sql
```

Expected: `Built pks_test.`, then **`No schema differences.`**

- If the replay fails, read the error and fix the baseline. A statement may reference an extension production has, in which case you add `CREATE EXTENSION IF NOT EXISTS <name> WITH SCHEMA extensions;` at the top of the baseline. Or it may be a role the local test server lacks; ask for help, since the test stand-in may need that role.
- If the compare shows differences, the baseline is incomplete. Fix the baseline file and repeat. **Don't continue until it says `No schema differences.`** Permission lines (`GRANT`/`REVOKE`) are not noise: they are real access differences.
- [ ] Check the auth and storage extras in the replayed database against production:

```bash
psql -h localhost -p 54329 -U postgres -d pks_test -X -At \
  -c "select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1" \
  -c "select policyname || ' | ' || cmd || ' | ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1" \
  | diff supabase/backups/prod-extras.txt - && echo "extras match"
```

Expected: `extras match`. Differences in ignored Supabase-managed items, noted in Step 4, are fine.

- [ ] Put the pending migrations back and run the full test suite on the baseline:

```bash
mv ../pks-pending/*.sql supabase/migrations/ 2>/dev/null || true
rmdir ../pks-pending 2>/dev/null || true
bash supabase/local-test/run.sh
```

Expected: `All tests successful.`

### Step 6: Repair the production migration history

This step only edits `supabase_migrations.schema_migrations` in production. It tells the CLI that the old versions are gone and that the baseline is already applied. No Docker is needed.

- [ ] Mark every archived version as reverted:

```bash
ls supabase/migrations_archive/*.sql | xargs -n1 basename | cut -d_ -f1 \
  | xargs npx supabase migration repair --linked --status reverted
```

- [ ] Mark the baseline as applied, since production already has this schema:

```bash
npx supabase migration repair --linked --status applied 20260926235959
```

- [ ] **"Already applied" variant.** If any `20260927…` migrations were already pushed to production before this runbook:
  1. They are already inside the baseline dump.
  2. Move those files to `supabase/migrations_archive/` as well.
  3. Mark them `--status reverted` with the command above.
  4. Re-run Step 5's replay and compare.

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

- [ ] Commit. Backups and notes are not committed:

```bash
git add .gitignore supabase/migrations supabase/migrations_archive
git commit -m "chore(db): squash 46 historical migrations into a verified production baseline"
```

- [ ] Push the branch and open a PR. CI's `database` job must be green: it replays the baseline and runs every test on the real Supabase stack.
- [ ] Keep `supabase/backups/` somewhere safe outside the repo for at least 30 days, then delete the password line from `pgpass.conf` if you don't need it any more.

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

- `bash supabase/local-test/run.sh --build-only` replays cleanly from the baseline.
- `compare-schema.sh` prints `No schema differences.` against production's `public` dump, with only the baseline in `supabase/migrations`, and the auth/storage extras match.
- `migration list --linked` shows the baseline in Local and Remote, and no archived versions.
- The full test suite passes locally on the baseline, and CI's `database` job is green.
