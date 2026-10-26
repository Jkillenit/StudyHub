# Nova Station — Home PC host setup

Run once on the always-on Study Hub PC (Windows). Prefer an elevated PowerShell.

## Script

```powershell
# Preview only
.\scripts\station-host.ps1 -WhatIf

# Apply power + watchdog (admin)
.\scripts\station-host.ps1

# If Study Hub.exe is not auto-detected:
.\scripts\station-host.ps1 -ExePath "C:\Path\To\Study Hub.exe"
```

The script is idempotent. `-WhatIf` prints planned `powercfg` and Scheduled Task changes without applying them.

## What it does

| Step | Action |
|------|--------|
| Power | `powercfg` AC standby + hibernate timeouts → `0` |
| Windows Update | Prints guidance to widen active hours (manual) |
| Watchdog | Task Scheduler every 15 min: start `Study Hub.exe --hidden` if not running |
| Tailscale | Prints `tailscale serve --bg --https=443 http://127.0.0.1:47811` |
| Session recovery | Duo / Blackboard sign-in via CRD or RDP-over-Tailscale |
| Optional | Autologon trade-off; Ollama local model for drafts |

## After setup

1. Enable Station in Study Hub → Settings → Station (mint token + ntfy topic).
2. Confirm API is only on `127.0.0.1:47811` (never `0.0.0.0`).
3. Phone: open the Tailscale HTTPS URL, paste the bearer token, Add to Home Screen.
4. Optional: install Ollama, `ollama pull llama3.2` (or your `station.local_model`), leave it on `127.0.0.1:11434`.

## Guardrails

- Station never submits, uploads, or answers on Blackboard / publisher sites.
- Drafts are local review copies only.
- Push text stays minimal unless `station.push_details` is on.

See `docs/station/BRIEFING.md` for contracts and `docs/station/STORIES.md` for the story board.
