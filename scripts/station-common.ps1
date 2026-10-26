<#
.SYNOPSIS
  Shared names and helpers for station-host.ps1, station-pause.ps1, station-resume.ps1.
  Dot-source it: . "$PSScriptRoot\station-common.ps1"
  The watchdog task name and the exe lookup live ONLY here so the scripts cannot drift.
#>

$script:StationTaskName = 'NovaStationStudyHubWatchdog'
$script:StationApiUrl = 'http://127.0.0.1:47811'

function Write-Step([string]$Message) {
  Write-Host "[station] $Message"
}

# Runs $Do unless -WhatIf is on; prints every action either way. A failure is
# reported and the caller carries on, so one bad step never blocks the rest.
function Invoke-Step([string]$Desc, [scriptblock]$Do) {
  if ($WhatIfPreference) { Write-Step "WhatIf: $Desc"; return }
  try {
    & $Do
    Write-Step "Done: $Desc"
  } catch {
    Write-Step "FAILED: $Desc ($($_.Exception.Message))"
  }
}

function Get-StationTask {
  Get-ScheduledTask -TaskName $script:StationTaskName -ErrorAction SilentlyContinue
}

# The watchdog wrapper is registered with -EncodedCommand holding "$exe = '<path>'".
# Decode it so resume starts exactly the exe the watchdog uses.
function Get-WatchdogExe {
  $task = Get-StationTask
  if (-not $task) { return $null }
  $argText = [string]$task.Actions[0].Arguments
  if ($argText -notmatch '-EncodedCommand\s+(\S+)') { return $null }
  $script = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))
  if ($script -match "\`$exe = '([^']+)'") { return $Matches[1] }
  return $null
}

function Resolve-StudyHubExe([string]$Hint) {
  if ($Hint -and (Test-Path -LiteralPath $Hint)) { return (Resolve-Path -LiteralPath $Hint).Path }
  $fromTask = Get-WatchdogExe
  if ($fromTask -and (Test-Path -LiteralPath $fromTask)) { return $fromTask }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\StudyHub\StudyHub.exe",
    "$env:LOCALAPPDATA\Programs\Study Hub\Study Hub.exe",
    "$env:LOCALAPPDATA\Programs\study-hub\Study Hub.exe",
    "$env:ProgramFiles\Study Hub\Study Hub.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

function Get-TailscaleExe {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $p = "$env:ProgramFiles\Tailscale\tailscale.exe"
  if (Test-Path -LiteralPath $p) { return $p }
  return $null
}
