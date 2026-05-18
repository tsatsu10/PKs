# Mark existing migrations as "applied" on the linked remote project.
# Use when the DB was built via SQL Editor (or an old push) but
# supabase_migrations.schema_migrations is empty — otherwise `db push` re-runs
# phase1 and fails with "policy already exists".
#
# Usage (from repo root):
#   .\supabase\scripts\repair-migration-history.ps1
#   .\supabase\scripts\repair-migration-history.ps1 -Password "your-db-password"
#
# Then apply only pending migrations:
#   supabase db push -p "your-db-password"
#
# If verify_db_up_to_date.sql shows search_knowledge_objects_with_snippets is MISSING,
# do NOT repair 20250222000001–20250224000005 (stop at 20250221000001), then db push
# will apply the search snippet migrations.

param(
  [string]$Password
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

# All local migrations EXCEPT the newest link_edges policy fix (still pending).
$versions = @(
  "20250212000001", "20250213000001", "20250213000002", "20250213000003",
  "20250213000004", "20250213000005", "20250213000006", "20250213000007",
  "20250213000008", "20250213000009", "20250213000010", "20250213000011",
  "20250217000001", "20250217100001", "20250217100002", "20250217200001",
  "20250217200002", "20250218000001", "20250219000001", "20250219000002",
  "20250219000003", "20250220000001", "20250221000001", "20250222000001",
  "20250222000002", "20250223000001", "20250224000001", "20250224000002",
  "20250224000003", "20250224000004", "20250224000005", "20250225000001",
  "20250226000001", "20250227000001", "20250309100001", "20250309100002",
  "20250309100003", "20250309100004"
)

$passArg = @()
if ($Password) { $passArg = @("-p", $Password) }

Write-Host "Repairing $($versions.Count) migration versions as applied on linked project..."
Write-Host "(Skipping 20250518000001 — run 'supabase db push' to apply that one.)"
Write-Host ""

foreach ($v in $versions) {
  Write-Host "  repair $v"
  & supabase migration repair $v --status applied @passArg
  if ($LASTEXITCODE -ne 0) {
    Write-Error "migration repair failed for $v"
  }
}

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  supabase migration list"
Write-Host "  supabase db push"
