# Nova Station - resume notes

Station is paused on purpose. Nothing in this file is a secret: no token, ntfy topic or API key.

## WHERE WE STOPPED

Built and merged (all on main):
- Waves 0 to 3: model router, jobs, scheduler, notify, briefing, API, phone page, instructions
  sync, drafts, PC panel, host script, guard test, docs.
- The cleanup branch, and the host script BOM fix (station-host.ps1 parses in PowerShell 5.1).

Packaged app:
- Built as release\Study Hub-1.1.0-x64.exe and installed at
  C:\Users\Jack\AppData\Local\Programs\StudyHub\StudyHub.exe.
- A fresh install shows empty data. The old data is in the previous dev app's userData folder,
  not yet found or restored. Candidates seen: C:\Users\Jack\AppData\Roaming\Study Hub\studyhub.db
  and its backups folder (not checked which app wrote them).

Working:
- ntfy push test arrives on the phone.
- Host script applied: sleep never on AC, watchdog task NovaStationStudyHubWatchdog.
- Tailscale Serve on https://desktop-jtmq8g2.tail5bb447.ts.net/ (tailnet only, Funnel kept off).

Not working or unfinished:
- The phone page is blank.
- No way to see or create the phone token or QR in the app. Branches station/token-qr and
  station/token-script do NOT exist (not local, not on origin), so nothing is merged or half
  built there. Today the token is minted once when Station is enabled (Settings > Station) and
  shown as text; the qrcode package is not installed, so there is no QR, and no regenerate button.
- Blackboard is not connected in the new install.
- Ollama is not installed.
- No Claude API key entered yet in the installed app (verify in Settings).

Paused on purpose: watchdog disabled, tailscale serve off, sleep restored (AC standby 30 min,
hibernate 180 min), Station disabled, app quit. Scripts: scripts\station-pause.ps1 and
scripts\station-resume.ps1.

## RESUME CHECKLIST

- [ ] a. Run scripts\station-resume.ps1 as admin (preview first with -WhatIf).
- [ ] b. Fix the blank phone page: open /remote.html and /api/health, read the PC browser console error, fix the cause, add a regression test.
- [ ] c. Token: merge or finish the phone link feature (generate button + QR, hash only storage, token via URL fragment).
- [ ] d. Setup wizard story: a Station setup screen with status rows and fix buttons.
- [ ] e. Find and restore the old data (look under $env:APPDATA for .db files; Settings > Backup has restore).
- [ ] f. Connect Blackboard in the installed app, tick Duo remember this device.
- [ ] g. Add the Claude API key, put 2 or 3 writing samples in the style folder.
- [ ] h. Mobile data test: Wi-Fi off on the phone, Run from the phone, confirm the push and the briefing.
- [ ] i. 7 day soak, log failures in docs/station/SOAK.md.
- [ ] j. Optional: install Ollama and run ollama pull llama3.2.

## RULES TO KEEP

- Read only toward school systems (GET only).
- Loopback only (127.0.0.1). Tailscale Funnel stays off.
- No job types outside the BRIEFING section 3.2 allowlist.
- Every model call goes through route().
- Usage budget rules in AGENTS.md.
