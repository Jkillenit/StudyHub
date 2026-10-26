#Requires -Version 5.1
<#
.SYNOPSIS
  Nova Station home-PC host setup (BRIEFING section 8).

.DESCRIPTION
  Idempotent hardening for always-on Study Hub:
  - AC standby/hibernate timeouts -> 0
  - Print Windows Update active-hours guidance
  - Task Scheduler watchdog (every 15 min) to start Study Hub.exe --hidden if missing
  - Print Tailscale serve guidance for 127.0.0.1:47811
  - Print Duo / Blackboard recovery + optional Autologon / Ollama notes

  Run elevated (Administrator) for powercfg + Scheduled Task changes.

.PARAMETER WhatIf
  Print planned changes only; make no system changes.

.PARAMETER ExePath
  Optional path to Study Hub.exe. Auto-detected from common install locations when omitted.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "[station-host] $Message"
}

function Resolve-StudyHubExe {
  param([string]$Hint)
  if ($Hint -and (Test-Path -LiteralPath $Hint)) { return (Resolve-Path -LiteralPath $Hint).Path }

  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Study Hub\Study Hub.exe",
    "$env:LOCALAPPDATA\Programs\study-hub\Study Hub.exe",
    "${env:ProgramFiles}\Study Hub\Study Hub.exe",
    "${env:ProgramFiles(x86)}\Study Hub\Study Hub.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

function Ensure-PowerNoSleep {
  $cmds = @(
    @{ Name = "standby-timeout-ac"; Args = @("/change", "standby-timeout-ac", "0") },
    @{ Name = "hibernate-timeout-ac"; Args = @("/change", "hibernate-timeout-ac", "0") }
  )
  foreach ($c in $cmds) {
    if ($WhatIfPreference -or $PSCmdlet.ShouldProcess("powercfg $($c.Name)", "Set to 0")) {
      if ($WhatIfPreference) {
        Write-Step "WhatIf: powercfg $($c.Args -join ' ')"
      } else {
        & powercfg @($c.Args) | Out-Null
        Write-Step "Applied powercfg $($c.Name) = 0"
      }
    }
  }
}

function Ensure-WatchdogTask {
  param([string]$Exe)
  $taskName = "NovaStationStudyHubWatchdog"
  $arg = "--hidden"
  $action = New-ScheduledTaskAction -Execute $Exe -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 9999)
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $desc = "Start Study Hub with --hidden if it is not running (Nova Station)."

  if ($WhatIfPreference) {
    Write-Step "WhatIf: upsert Scheduled Task '$taskName' -> `"$Exe`" $arg (every 15 min)"
    return
  }

  if ($PSCmdlet.ShouldProcess($taskName, "Register watchdog task")) {
    # Wrapper: only start when process missing.
    $ps = @"
`$exe = '$Exe'
`$name = [IO.Path]::GetFileNameWithoutExtension(`$exe)
if (-not (Get-Process -Name `$name -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath `$exe -ArgumentList '--hidden'
}
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ps))
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -EncodedCommand $encoded"
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $desc -Force | Out-Null
    Write-Step "Watchdog task '$taskName' registered (every 15 min)."
  }
}

Write-Step "Nova Station host setup"
if ($WhatIfPreference) { Write-Step "Mode: WhatIf (no changes)" }

$exe = Resolve-StudyHubExe -Hint $ExePath
if (-not $exe) {
  Write-Step "WARN: Study Hub.exe not found. Pass -ExePath after install. Watchdog will be skipped."
} else {
  Write-Step "Using exe: $exe"
}

Ensure-PowerNoSleep

Write-Step "Manual: set Windows Update active hours wide (Settings -> Windows Update -> Active hours), e.g. 06:00-23:00, so reboots avoid class time."

if ($exe) {
  Ensure-WatchdogTask -Exe $exe
}

Write-Step @'
Tailscale (manual / once):
  1. Install Tailscale and sign in.
  2. From an elevated shell on this PC:
       tailscale serve --bg --https=443 http://127.0.0.1:47811
  3. Phone uses the Tailscale HTTPS URL + Station bearer token (Settings -> Station).
  Never bind Study Hub / Station API to 0.0.0.0 - loopback only.
'@

Write-Step @'
Blackboard / Duo when session expires:
  Sign in via Chrome Remote Desktop or RDP-over-Tailscale, open Study Hub -> Blackboard,
  complete Duo, tick 'remember this device' to stretch the gap. Station pushes a high-priority
  alert on expiry; nothing is submitted to Blackboard automatically.
'@

Write-Step @'
Optional:
  - Sysinternals Autologon: desktop returns after reboot (convenient; anyone at the PC gets in).
  - Ollama: install, 'ollama pull' the model in station.local_model (default llama3.2), leave
    running on 127.0.0.1:11434. Station prefers local when station.prefer_local=1.
'@

Write-Step "Done."
