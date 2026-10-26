# Station pause/resume - plan (branch station/pause-resume)

Executed inline with executing-plans, one task at a time, one story-reviewer at the end.

1. State check (done): main clean at fb3fda2; station/token-qr and station/token-script do not
   exist locally or on origin. Tests: 651 pass after `npm rebuild better-sqlite3` (it had been
   rebuilt for Electron, ABI 132).
2. docs/station/RESUME.md (ASCII). Checklist lines b-h are one line each so the resume script
   can print them from the file. Commit.
3. Scripts, test first: extend electron/station/hostScript.test.js to cover every
   scripts/station-*.ps1 (BOM, ASCII, parses in powershell.exe 5.1, only station-common.ps1
   names the watchdog task, RESUME.md has items b-h). Watch it fail, then add
   scripts/station-common.ps1 (task name, API url, exe lookup, tailscale lookup, Invoke-Step),
   station-pause.ps1, station-resume.ps1, and point station-host.ps1 at the common file.
   Run each with -WhatIf and diff machine state before and after. Commit.
4. HANDOFF.md 5 line pointer, STORIES.md token feature note. Commit.
5. npm test, story-reviewer once, fix real findings, merge to main, push.
