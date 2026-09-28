#!/usr/bin/env bash
# Compare the public schema of the local test database (built by run.sh) with a production dump.
# Stands in for `supabase db diff --linked` without Docker.
#
# Usage: bash supabase/local-test/compare-schema.sh <production-public-schema.sql>
# Make the production file with the same flags this script uses locally:
#   pg_dump "$PROD" --schema-only --schema=public --no-owner -f prod-public.sql
# Exit 0 = no differences; otherwise the diff is written to schema-diff.txt.
set -euo pipefail

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
DB="${PKS_TEST_DB:-pks_test}"
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Usage: $0 <production-public-schema.sql>"; exit 2; }

# Drop comments, session settings and platform-owned lines that differ between servers.
normalize() {
  sed -E \
    -e '/^--/d' \
    -e '/^[\]restrict /d' -e '/^[\]unrestrict /d' \
    -e '/^SET /d' \
    -e "/^SELECT pg_catalog[.]set_config[(]'search_path'/d" \
    -e '/^CREATE SCHEMA public;/d' -e '/^COMMENT ON SCHEMA public /d' \
    -e '/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/d' \
    -e '/^[[:space:]]*$/d' "$1" > "$2"
  # An empty result means the dump or the filter is broken; never report that as "equal".
  [ -s "$2" ] || { echo "Normalized $1 is empty; check the dump."; exit 2; }
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pg_dump -d "$DB" --schema-only --schema=public --no-owner -f "$tmp/local.sql"
normalize "$1" "$tmp/prod.norm"
normalize "$tmp/local.sql" "$tmp/local.norm"

if diff -u "$tmp/prod.norm" "$tmp/local.norm" > schema-diff.txt; then
  rm -f schema-diff.txt
  echo "No schema differences."
else
  echo "Differences found: see schema-diff.txt ('-' = production only, '+' = local only)."
  exit 1
fi
