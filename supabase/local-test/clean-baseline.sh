#!/usr/bin/env bash
# Make a pg_dump 17/18 schema dump safe to use as a Supabase migration (−1C squash runbook).
# Removes, in place:
#   \restrict / \unrestrict      psql-only meta-commands; `supabase db push` rejects them
#   SET transaction_timeout      PostgreSQL 17+ only; fails on a PG15 server
#   set_config('search_path'…)   would leave later migrations in the same session with an empty search_path
#   CREATE/COMMENT ON SCHEMA public, ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
#                                already provided by every Supabase database
# and prepends a reset of postgres's default privileges in public. pg_dump writes each object's
# ACL relative to PostgreSQL's built-in defaults, but a Supabase database's default privileges
# grant ALL to anon/authenticated/service_role on every new object. Without the reset, a fresh
# replay re-grants what production revoked (e.g. anon EXECUTE, SELECT on user_ai_providers).
# The dump ends with production's own ALTER DEFAULT PRIVILEGES lines, which restore the defaults.
#
# Usage: bash supabase/local-test/clean-baseline.sh supabase/migrations/<version>_baseline.sql
set -euo pipefail
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Usage: $0 <baseline.sql>"; exit 2; }

before=$(wc -l < "$1")
sed -E -i \
  -e '/^[\]restrict /d' -e '/^[\]unrestrict /d' \
  -e '/^SET transaction_timeout/d' \
  -e "/^SELECT pg_catalog[.]set_config[(]'search_path'/d" \
  -e '/^CREATE SCHEMA public;/d' -e '/^COMMENT ON SCHEMA public /d' \
  -e '/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/d' \
  "$1"

reset='-- Added by clean-baseline.sh: create objects with built-in default privileges so the
-- dumped GRANT/REVOKE lines reproduce production exactly. The ALTER DEFAULT PRIVILEGES lines
-- at the end of this file restore production'"'"'s defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
'
grep -q '^-- Added by clean-baseline.sh' "$1" || { printf '%s\n' "$reset" | cat - "$1" > "$1.tmp" && mv "$1.tmp" "$1"; }
grep -q '^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT' "$1" \
  || echo "WARNING: no ALTER DEFAULT PRIVILEGES lines at the end of the dump; defaults stay revoked. Check production's defaults."
echo "Cleaned $1: $before -> $(wc -l < "$1") lines."
