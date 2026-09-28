#!/usr/bin/env bash
# Local stand-in for `supabase db reset && supabase test db` on a plain Postgres server
# (no Docker). CI uses the real Supabase CLI.
#
# Usage: bash supabase/local-test/run.sh [--build-only | test files...]
#        --build-only: rebuild the database, run no tests (used by the −1C squash runbook).
# Env:   PGHOST/PGPORT/PGUSER (default localhost/54329/postgres), PKS_TEST_DB (default pks_test),
#        PGTAP_SRC (extracted pgTAP 1.3.3 source; otherwise downloaded once into a cache dir).
set -euo pipefail

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
DB="${PKS_TEST_DB:-pks_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGTAP_VERSION=1.3.3
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

# pgTAP as plain SQL: the source's pgtap.sql.in with its two placeholders filled in.
pgtap_sql() {
  local src="${PGTAP_SRC:-}"
  if [ -z "$src" ]; then
    local cache="${XDG_CACHE_HOME:-$HOME/.cache}/pks-pgtap"
    src="$cache/pgtap-$PGTAP_VERSION"
    if [ ! -f "$src/sql/pgtap.sql.in" ]; then
      mkdir -p "$cache"
      curl -fsSL "https://github.com/theory/pgtap/archive/refs/tags/v$PGTAP_VERSION.tar.gz" | tar -xz -C "$cache"
    fi
  fi
  local os; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) os=windows ;; *) os=linux ;; esac
  echo 'SET search_path = extensions;'
  sed -e "s,__OS__,$os,g" -e 's,__VERSION__,1.3,g' "$src/sql/pgtap.sql.in"
}

# Reset: fresh database, platform shim, pgTAP, migrations, seed.
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/local-test/supabase_shim.sql"
pgtap_sql | "${PSQL[@]}" -d "$DB"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" || { echo "Migration failed: $(basename "$f")"; exit 1; }
done
sed '/CREATE EXTENSION.*pgtap/d' "$ROOT/supabase/seed.sql" | "${PSQL[@]}" -d "$DB"

if [ "${1:-}" = "--build-only" ]; then echo "Built $DB."; exit 0; fi

# Test: each file passes only with a clean psql exit, no `not ok` and no finish() complaint.
if [ $# -gt 0 ]; then tests=("$@"); else tests=("$ROOT"/supabase/tests/database/*.test.sql); fi
failed=0
for t in "${tests[@]}"; do
  if out="$("${PSQL[@]}" -At -d "$DB" -f "$t" 2>&1)" && ! grep -qE '^(not ok|# Looks like)' <<<"$out"; then
    echo "$(basename "$t") .. ok"
  else
    echo "$(basename "$t") .. FAILED"
    grep -E '^(not ok|#)|ERROR|FATAL' <<<"$out" | sed 's/^/    /' || true
    failed=1
  fi
done

if [ "$failed" -eq 0 ]; then echo "All tests successful."; else echo "Some tests failed."; exit 1; fi
