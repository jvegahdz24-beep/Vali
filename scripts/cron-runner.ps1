# ValiAutoFlow — Windows Task Scheduler cron runner
# Usage: .\scripts\cron-runner.ps1 -Endpoint automations|snapshot|follow-ups|education|briefing|weekly-report

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("automations","snapshot","follow-ups","education","briefing","weekly-report")]
  [string]$Endpoint
)

$baseUrl = "http://localhost:3105"
$root = Join-Path $PSScriptRoot ".."
$envFile = Join-Path $root ".env"
$logFile = Join-Path $root ".cron-logs\$Endpoint.log"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^$Name=(.*)$") {
      $value = $Matches[1].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return $null
}

$cronSecret = Get-EnvValue "CRON_SECRET"
$workerKey = Get-EnvValue "WORKER_KEY"
if (-not $cronSecret) {
  Write-Error "[ValiAutoFlow Cron] CRON_SECRET not found in .env — aborting"
  exit 1
}

$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-RunLog([string]$Entry) {
  Add-Content -Path $logFile -Value $Entry
  $lines = @(Get-Content $logFile -ErrorAction SilentlyContinue)
  if ($lines.Count -gt 500) {
    $lines | Select-Object -Last 500 | Set-Content $logFile
  }
  Write-Host $Entry
}

function Invoke-Endpoint([string]$Url, [string]$Method, [hashtable]$Headers) {
  return Invoke-WebRequest `
    -Uri $Url `
    -Method $Method `
    -Headers $Headers `
    -TimeoutSec 120 `
    -UseBasicParsing
}

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
  if ($Endpoint -eq "follow-ups") {
    if (-not $workerKey) {
      throw "WORKER_KEY not found in .env — follow-up worker cannot run"
    }

    $workerResponse = Invoke-Endpoint `
      "$baseUrl/api/followups/worker" `
      "POST" `
      @{ "Content-Type" = "application/json"; "x-worker-key" = $workerKey }
    Write-RunLog "[$ts] WORKER OK $($workerResponse.StatusCode) — $($workerResponse.Content -replace '\s+', ' ')"
  }

  $response = Invoke-Endpoint `
    "$baseUrl/api/cron/$Endpoint" `
    "GET" `
    @{ Authorization = "Bearer $cronSecret" }
  Write-RunLog "[$ts] OK $($response.StatusCode) — $($response.Content -replace '\s+', ' ')"
} catch {
  Write-RunLog "[$ts] ERROR — $($_.Exception.Message)"
  exit 1
}
