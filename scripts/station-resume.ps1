<#
.SYNOPSIS
  Resume Nova Station on the home PC. Idempotent. Run elevated for the task and powercfg steps.

.DESCRIPTION
  - Enable the watchdog scheduled task
  - tailscale serve --bg https 443 -> 127.0.0.1:47811
  - AC standby / hibernate timeouts -> 0
  - Start Study Hub with --hidden (exe taken from the watchdog task)
  - Print the manual checklist items b to h from docs\station\RESUME.md
  Does not touch the database, tokens or settings. Station itself is turned on in the app.

.PARAMETER WhatIf
  Print each action without doing it.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ExePath = ''
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\station-common.ps1"

if ($WhatIfPreference) { Write-Step 'Mode: WhatIf (no changes)' }

# 1. Power
Invoke-Step 'powercfg standby-timeout-ac 0' { & powercfg /change standby-timeout-ac 0 }
Invoke-Step 'powercfg hibernate-timeout-ac 0' { & powercfg /change hibernate-timeout-ac 0 }

# 2. Watchdog
if (Get-StationTask) {
  Invoke-Step "enable scheduled task $($script:StationTaskName)" {
    Enable-ScheduledTask -TaskName $script:StationTaskName | Out-Null
  }
} else {
  Write-Step "WARN: scheduled task $($script:StationTaskName) not found. Run scripts\station-host.ps1 first."
}

# 3. Tailscale
$ts = Get-TailscaleExe
if ($ts) {
  Invoke-Step "tailscale serve --bg --https=443 $($script:StationApiUrl)" {
    & $ts serve --bg --https=443 $script:StationApiUrl | Out-Host
  }
} else {
  Write-Step 'WARN: tailscale not found'
}

# 4. App
$exe = Resolve-StudyHubExe $ExePath
if (-not $exe) {
  Write-Step 'WARN: Study Hub exe not found. Pass -ExePath.'
} else {
  $name = [IO.Path]::GetFileNameWithoutExtension($exe)
  if (Get-Process -Name $name -ErrorAction SilentlyContinue) {
    Write-Step "Skip: $name is already running"
  } else {
    Invoke-Step "start $exe --hidden" {
      Start-Process -FilePath $exe -ArgumentList '--hidden'
    }
  }
}

# 5. Reminders, read from the single source of truth.
$resume = Join-Path $PSScriptRoot '..\docs\station\RESUME.md'
Write-Step 'Still to do by hand (docs\station\RESUME.md):'
if (Test-Path -LiteralPath $resume) {
  Get-Content -LiteralPath $resume | Where-Object { $_ -match '^- \[ \] [b-h]\. ' } | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Step 'WARN: RESUME.md not found'
}
