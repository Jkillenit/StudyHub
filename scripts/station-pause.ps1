<#
.SYNOPSIS
  Pause Nova Station on the home PC. Idempotent. Run elevated for the task and powercfg steps.

.DESCRIPTION
  - Disable the watchdog scheduled task
  - tailscale serve off for https 443, then warn if anything is funneled
  - Restore AC standby / hibernate timeouts
  - Stop Study Hub if it is running
  Does not touch the database, tokens or settings.

.PARAMETER WhatIf
  Print each action without doing it.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [int]$StandbyMinutes = 30,
  [int]$HibernateMinutes = 180
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\station-common.ps1"

if ($WhatIfPreference) { Write-Step 'Mode: WhatIf (no changes)' }

# 1. Watchdog first, so it cannot restart the app we are about to stop.
if (Get-StationTask) {
  Invoke-Step "disable scheduled task $($script:StationTaskName)" {
    Disable-ScheduledTask -TaskName $script:StationTaskName | Out-Null
  }
} else {
  Write-Step "Skip: scheduled task $($script:StationTaskName) not found"
}

# 2. Tailscale
$ts = Get-TailscaleExe
if ($ts) {
  Invoke-Step 'tailscale serve --https=443 off' {
    & $ts serve --https=443 off | Out-Host
  }
  Write-Step 'tailscale funnel status (read only):'
  $funnel = (& $ts funnel status 2>&1 | Out-String).Trim()
  Write-Host $funnel
  if ($funnel -match 'Funnel on') {
    Write-Step 'WARNING: something is funneled to the public internet. Run: tailscale funnel reset'
  }
} else {
  Write-Step 'Skip: tailscale not found'
}

# 3. Power
Invoke-Step "powercfg standby-timeout-ac $StandbyMinutes" {
  & powercfg /change standby-timeout-ac $StandbyMinutes
}
Invoke-Step "powercfg hibernate-timeout-ac $HibernateMinutes" {
  & powercfg /change hibernate-timeout-ac $HibernateMinutes
}

# 4. App
$exe = Resolve-StudyHubExe ''
$name = if ($exe) { [IO.Path]::GetFileNameWithoutExtension($exe) } else { 'StudyHub' }
$running = Get-Process -Name $name -ErrorAction SilentlyContinue
if ($running) {
  Invoke-Step "stop $name" { $running | Stop-Process }
} else {
  Write-Step "Skip: $name is not running"
}

Write-Step 'Paused. Resume with scripts\station-resume.ps1'
