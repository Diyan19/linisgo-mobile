# LinisGo Finder — Read-Only Windows Environment Prerequisite Check
# Does not install software, modify system state, or access credentials.

$ErrorActionPreference = 'SilentlyContinue'

function Test-PrerequisiteTool {
  param (
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [Parameter(Mandatory = $true)][string]$CommandName,
    [Parameter(Mandatory = $true)][string[]]$VersionArgs
  )

  $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
  if (-not $cmd) {
    return [PSCustomObject]@{
      Tool    = $DisplayName
      Status  = 'MISSING'
      Version = 'Not found in PATH'
    }
  }

  try {
    $rawOutput = & $CommandName @VersionArgs 2>&1 | Out-String
    $firstLine = ($rawOutput -split "`r?`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
    if (-not $firstLine) {
      $firstLine = 'Detected (version output empty)'
    }
    return [PSCustomObject]@{
      Tool    = $DisplayName
      Status  = 'INSTALLED'
      Version = $firstLine
    }
  } catch {
    return [PSCustomObject]@{
      Tool    = $DisplayName
      Status  = 'MISSING'
      Version = 'Command failed to execute'
    }
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " LinisGo Finder — Local Windows Environment Check (Read-Only)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$results = @(
  (Test-PrerequisiteTool -DisplayName 'Node.js'          -CommandName 'node'   -VersionArgs @('-v')),
  (Test-PrerequisiteTool -DisplayName 'npm'              -CommandName 'npm'    -VersionArgs @('-v')),
  (Test-PrerequisiteTool -DisplayName 'Git'              -CommandName 'git'    -VersionArgs @('--version')),
  (Test-PrerequisiteTool -DisplayName 'Google Cloud CLI' -CommandName 'gcloud' -VersionArgs @('--version')),
  (Test-PrerequisiteTool -DisplayName 'Java (JDK/JRE)'   -CommandName 'java'   -VersionArgs @('-version'))
)

foreach ($item in $results) {
  $statusColor = if ($item.Status -eq 'INSTALLED') { 'Green' } else { 'Red' }
  Write-Host ("[{0,-9}] {1,-18} : {2}" -f $item.Status, $item.Tool, $item.Version) -ForegroundColor $statusColor
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

$missing = $results | Where-Object { $_.Status -eq 'MISSING' }

if ($missing.Count -eq 0) {
  Write-Host "Summary: All 5 prerequisites are INSTALLED." -ForegroundColor Green
  exit 0
} else {
  $missingNames = ($missing | Select-Object -ExpandProperty Tool) -join ', '
  Write-Host ("Summary: {0} prerequisite(s) MISSING -> {1}" -f $missing.Count, $missingNames) -ForegroundColor Yellow
  exit 1
}
