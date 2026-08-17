# ValiAutoFlow — Cron Runner
# Usage: .\scripts\cron-runner.ps1 -Endpoint automations|snapshot|follow-ups|education
# Called by Windows Task Scheduler

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("automations","snapshot","follow-ups","education","briefing","weekly-report")]
  [string]$Endpoint
)

$baseUrl   = "http://localhost:3105"
$envFile   = Join-Path $PSScriptRoot "..\\.env"
$logFile   = Join-Path $PSScriptRoot "..\\.cron-logs\$Endpoint.log"

# --- Load CRON_SECRET from .env ---
$secret = $null
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^CRON_SECRET=(.+)$') {
      $secret = $Matches[1].Trim()
    }
  }
}
if (-not $secret) {
  Write-Error "[ValiAutoFlow Cron] CRON_SECRET not found in .env — aborting"
  exit 1
}

# --- Ensure log directory ---
$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# --- Call endpoint ---
$url  = "$baseUrl/api/cron/$Endpoint"
$ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
  $response = Invoke-WebRequest `
    -Uri $url `
    -Method GET `
    -Headers @{ Authorization = "Bearer $secret" } `
    -TimeoutSec 120 `
    -UseBasicParsing

  $entry = "[$ts] OK $($response.StatusCode) — $($response.Content -replace '\s+', ' ')"
} catch {
  $entry = "[$ts] ERROR — $($_.Exception.Message)"
}

# Write log (keep last 500 lines)
Add-Content -Path $logFile -Value $entry
$lines = Get-Content $logFile -ErrorAction SilentlyContinue
if ($lines.Count -gt 500) {
  $lines | Select-Object -Last 500 | Set-Content $logFile
}

Write-Host $entry
