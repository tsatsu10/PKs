# Mark existing migrations as "applied" on the linked remote project.
# Use when the DB was built via SQL Editor (or an old push) but
# supabase_migrations.schema_migrations is empty — otherwise `db push` re-runs
# phase1 and fails with "policy already exists".
#
# Safe to re-run: skips versions already recorded on remote (duplicate key).
#
# Usage (from repo root):
#   .\supabase\scripts\repair-migration-history.ps1
#   .\supabase\scripts\repair-migration-history.ps1 -Password "your-db-password"
#
# Then apply only pending migrations (dashboard Phase 1–3):
#   supabase db push -p "your-db-password"

param(
  [string]$Password,
  # Migrations to leave PENDING (db push will apply these).
  [string[]]$LeavePending = @("20250519000001", "20250520000001", "20250521000001")
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

# Supabase CLI writes progress (e.g. "Connecting to remote database...") to stderr.
# With $ErrorActionPreference = Stop, PowerShell treats that as a terminating error.
function Invoke-SupabaseCli {
  param([string[]]$SupabaseArgs)

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $lines = [System.Collections.Generic.List[string]]::new()
    & supabase @SupabaseArgs 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        $lines.Add($_.ToString())
      } else {
        $lines.Add("$($_)".TrimEnd())
      }
    }
    $code = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    return @{ ExitCode = $code; Output = $lines.ToArray() }
  } finally {
    $ErrorActionPreference = $prevEap
  }
}

function Get-RemoteAppliedVersions {
  param([string[]]$PassArg)

  $applied = [System.Collections.Generic.HashSet[string]]::new()
  $result = Invoke-SupabaseCli -SupabaseArgs (@("migration", "list") + $PassArg)

  if ($result.ExitCode -ne 0) {
    Write-Host "  (could not read migration list; will skip duplicates on repair errors)" -ForegroundColor DarkYellow
    return $applied
  }

  foreach ($line in $result.Output) {
    if ($line -match 'LOCAL|REMOTE|TIME \(UTC\)|^[\s─\-]+$') { continue }
    if ($line -notmatch '\d{14}') { continue }

    # Avoid Unicode column chars (│) — encoding breaks regex on Windows PowerShell.
    $digits = [regex]::Matches($line, '\d{14}')
    if ($digits.Count -ge 2) {
      [void]$applied.Add($digits[1].Value)
      continue
    }
    if ($digits.Count -eq 1 -and $line -match '^\s*[^\d]') {
      # Remote-only row (no local version at start of line)
      [void]$applied.Add($digits[0].Value)
    }
  }

  return $applied
}

function Test-RepairAlreadyApplied {
  param([string]$Output)
  return $Output -match 'duplicate key|schema_migrations_pkey|23505|already exists'
}

$allMigrations = Get-ChildItem (Join-Path $repoRoot "supabase\migrations\*.sql") |
  Sort-Object Name |
  ForEach-Object {
    if ($_.BaseName -match '^(\d{14})') { $Matches[1] } else { $null }
  } |
  Where-Object { $_ }

$versions = @($allMigrations | Where-Object { $_ -notin $LeavePending })

$passArg = @()
if ($Password) { $passArg = @("-p", $Password) }

Write-Host "Reading remote migration history..."
$remoteApplied = Get-RemoteAppliedVersions -PassArg $passArg
if ($remoteApplied.Count -gt 0) {
  Write-Host "  $($remoteApplied.Count) version(s) already applied on remote (will skip)."
}

$toRepair = @($versions | Where-Object { -not $remoteApplied.Contains($_) })

Write-Host ""
Write-Host "Repairing $($toRepair.Count) migration version(s) as applied on linked project..."
if ($LeavePending.Count -gt 0) {
  Write-Host "Leaving pending: $($LeavePending -join ', ')"
}
Write-Host ""

$skipped = 0
$repaired = 0
$failed = 0

foreach ($v in $toRepair) {
  Write-Host "  repair $v"
  $result = Invoke-SupabaseCli -SupabaseArgs (@("migration", "repair", $v, "--status", "applied") + $passArg)
  $repairText = $result.Output -join "`n"

  if ($result.ExitCode -eq 0) {
    $repaired++
    continue
  }

  if (Test-RepairAlreadyApplied -Output $repairText) {
    Write-Host "    already applied on remote (skipped)" -ForegroundColor DarkYellow
    $skipped++
    continue
  }

  Write-Host $repairText -ForegroundColor Red
  $failed++
  Write-Error "migration repair failed for $v"
}

Write-Host ""
Write-Host "Summary: repaired=$repaired skipped=$skipped failed=$failed"
if ($failed -gt 0) { exit 1 }

Write-Host ""
Write-Host "Done. Next:"
if ($Password) {
  Write-Host "  supabase migration list -p `"$Password`""
  Write-Host "  supabase db push -p `"$Password`""
} else {
  Write-Host "  supabase migration list"
  Write-Host "  supabase db push"
}
