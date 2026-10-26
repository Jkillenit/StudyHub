# Nova Station — Project Brief

> Study Hub running always on from the home PC. From anywhere, Jack opens a phone page,
> hits **Run**, and the home PC syncs Blackboard, preps drafts for review, and sends back
> a briefing: new grades, what's due, what's ready for him, what still needs him.
> One briefing object, two views: phone card and PC panel with Nova presenting it.

Repo: `github.com/jkillenit/studyhub` (snapshot reviewed: commit `85b6f28`, Oct 8 2026).
If local work is newer than that commit, reconcile before Wave 0.

Read this with `docs/PROJECT_BRIEF.md` (§6 Guardrails still apply) and `.cursorrules`.

---

## 1. What already exists (do not rebuild)

| Capability | Status | Where |
|---|---|---|
| Always-on process: single instance, tray, launch at login `--hidden` | ✅ Built | `electron/main.cjs` (instance lock, `--hidden`), `electron/desktop/index.cjs` (`setLoginItemSettings`), `electron/desktop/tray.cjs` |
| Blackboard auth via persisted session partition `persist:blackboard` | ✅ Built | `electron/bbSync.cjs`, `electron/blackboardWindow.cjs` |
| Background BB checks every 30–60 min, skips metered/offline | ✅ Built | `electron/desktop/bbWatcher.cjs` (`createBbWatcher`, `connectionCost`) |
| Diff engine: new announcements, new/changed grades, new assignments, due date changes, due in 20–35 min | ✅ Built, tested | `bbWatcher.cjs` `diffCourse`, `dueSoon` + `desktop_announced` table |
| Session expired detection | ✅ Built (local only) | `bbWatcher` → `onSession("expired")`; `blackboardWindow.cjs` returns `not-logged-in` |
| Mirror tables: assignments (`submitted`, `score`, `bb_id`), announcements, bb_items, bb_grade_items | ✅ Built | `electron/database.cjs` numbered migrations |
| Today priority engine + local briefing text | ✅ Built, tested | `src/features/today/priority.js`, `briefing.js`, `todayView.js` |
| Nova desktop speech + bubbles, briefing hook | ✅ Built | `electron/desktop/speech.cjs`, `src/companion/hooks/useNovaBriefing.js` |
| Claude client (main process, key in safeStorage) | ✅ Built | `electron/anthropicClient.cjs` `callMessages`, `electron/aiConfig.cjs` |
| File text extraction (PPTX/DOCX/XLSX/PDF) | ✅ Built | `officeparser`, `pdf-parse` in main |
| Job queue with progress + persistence | ❌ Missing | new: `electron/station/` |
| Remote API reachable from phone | ❌ Missing | new |
| Phone push notifications | ❌ Missing | new (ntfy) |
| Phone dashboard (briefing, Run, jobs, drafts) | ❌ Missing | new: `remote/` |
| Assignment instructions + attachments fetched for drafting | ❌ Missing | BB mirror stores title/due/score only |
| Draft prep pipeline (outline or rough draft for review) | ❌ Missing | new |
| Host hardening (no sleep, watchdog restart, update hours) | ❌ Missing | new script |
| Daily AI spend cap | ❌ Missing | new |

**Architecture decision (changes earlier advice):** the Electron main process stays the
always-on host. The Blackboard session lives in Electron's `persist:blackboard` partition and
`net` requests, so a separate Node service would have to re-solve auth. Instead, all new
logic goes in `electron/station/` as plain CommonJS modules with **no direct `electron`
imports** except in one adapter file. That keeps it testable in vitest and movable later.

---

## 2. System shape

```
Phone (Tailscale)                         Home PC (Study Hub, tray, --hidden)
──────────────────                        ─────────────────────────────────────────────
remote PWA  ──HTTPS──▶ tailscale serve ──▶ 127.0.0.1:47811  station/api.cjs (Fastify)
   ▲                                          │
   │ push (ntfy)                              ▼
   └──────────── station/notify.cjs ◀── station/jobs.cjs (queue, runner, events)
                                              │      ▲
                                              ▼      │ schedule
                                     job handlers ── station/scheduler.cjs
                                      │  bb_sync        → existing backgroundCheck()
                                      │  instructions   → new BB read (GET only)
                                      │  drafts_prep    → station/drafts.cjs → Claude
                                      │  briefing_build → station/briefing.cjs
                                      ▼
                                 SQLite (existing DB + station migrations)
                                      │
                                      ▼
                         PC: BriefingPanel + Nova speech (IPC "station:*")
```

---

## 3. Contracts (frozen in Wave 0; parallel work depends on these)

### 3.1 DB migrations (next numbered migration in `electron/database.cjs`)

```sql
CREATE TABLE station_jobs (
  id TEXT PRIMARY KEY,                 -- uuid
  type TEXT NOT NULL,                  -- see 3.2 allowlist
  status TEXT NOT NULL,                -- queued|running|done|failed|cancelled|needs_you
  source TEXT NOT NULL,                -- schedule|remote|desktop|event
  params TEXT NOT NULL DEFAULT '{}',   -- json
  progress INTEGER NOT NULL DEFAULT 0, -- 0..100
  summary TEXT,                        -- one line, shown on phone
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT,                     -- e.g. "drafts_prep:<assignmentUuid>"
  run_id TEXT,                         -- groups jobs started by one Run press
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT, finished_at TEXT
);
CREATE UNIQUE INDEX idx_station_jobs_dedupe ON station_jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
CREATE INDEX idx_station_jobs_created ON station_jobs(created_at);

CREATE TABLE station_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES station_jobs(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL DEFAULT 'info',  -- info|warn|error
  message TEXT NOT NULL,
  data TEXT                            -- json
);

CREATE TABLE station_drafts (
  id TEXT PRIMARY KEY,
  assignment_uuid TEXT NOT NULL,
  course_uuid TEXT NOT NULL,
  mode TEXT NOT NULL,                  -- outline|rough_draft
  status TEXT NOT NULL DEFAULT 'ready',-- ready|reviewed|dismissed
  docx_path TEXT, md_path TEXT,
  model TEXT, tokens_in INTEGER, tokens_out INTEGER,
  check_count INTEGER NOT NULL DEFAULT 0, -- number of [CHECK] markers left
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_uuid, mode)
);

CREATE TABLE station_ai_usage (
  day TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
  est_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, model)
);

ALTER TABLE assignments ADD COLUMN instructions TEXT;       -- via addColumn()
ALTER TABLE assignments ADD COLUMN instructions_synced_at TEXT;
```

Settings (existing `settings` table, keys prefixed `station.`):
`station.enabled`, `station.token_hash`, `station.ntfy_url`, `station.ntfy_topic`,
`station.push_details` (default `0`), `station.ai_cap_cents_per_day` (default `150`),
`station.draft_model`, `station.draft_mode.<courseUuid>` (`off|outline|rough_draft`),
`station.morning_brief_at` (default `06:45`).

### 3.2 Job type allowlist (v1)

| type | does | writes |
|---|---|---|
| `bb_sync` | runs existing `backgroundCheck` for every linked course, emits diff events | mirror tables, `desktop_announced` |
| `instructions_sync` | GET assignment instructions + attachment text for assignments due ≤ 7 days | `assignments.instructions*`, files in app data |
| `drafts_prep` | builds outline or rough draft for eligible assignments (see §6) | `station_drafts`, files in `Documents\Nova Drafts` |
| `briefing_build` | builds the Briefing object (§3.3), stores latest, pushes summary | settings key `station.last_briefing` |
| `health_check` | session state, disk, last sync age, AI spend | events only |
| `notify_test` | sends a test push | none |

The runner rejects any type not in this list. **No job type submits, uploads, posts, or
answers anything on Blackboard or any publisher/LMS site.** All station network calls to
school systems are `GET`. A guard test enforces this (§7).

"Run" presets (from phone or PC): `full` = `bb_sync → instructions_sync → drafts_prep →
briefing_build`; `sync` = `bb_sync → briefing_build`; `drafts` = `instructions_sync →
drafts_prep → briefing_build`; `briefing` = `briefing_build`.

### 3.3 Briefing object (one shape, two renderers)

```json
{
  "generatedAt": "2026-10-26T06:45:00-05:00",
  "kind": "run|morning|evening|on_demand",
  "headline": "Two new grades, one draft ready, OM 300 quiz tonight.",
  "session": { "blackboard": "ok|expired|unknown", "lastSyncAt": "ISO" },
  "newGrades":   [{ "course": "GBA 490", "title": "Case 3", "score": 88, "pointsPossible": 100, "changed": false }],
  "dueSoon":     [{ "course": "...", "title": "...", "dueAt": "ISO", "state": "not_started|draft_ready|submitted", "draftId": null }],
  "draftsReady": [{ "draftId": "...", "course": "...", "title": "...", "mode": "outline", "checks": 3 }],
  "needsYou":    [{ "kind": "sign_in|review_draft|submit_yourself|study", "text": "Review GBA 490 Case 4 outline", "ref": "draftId|assignmentUuid" }],
  "announcements": [{ "course": "...", "title": "...", "postedAt": "ISO" }],
  "jobs": { "ran": 4, "failed": 0, "failures": [] },
  "aiSpend": { "todayCents": 23, "capCents": 150 }
}
```

`station/briefing.cjs` builds it from DB facts only (pure function + thin DB reader, unit
tested). `headline` is a plain template; Nova's voice lines on PC come from the existing
renderer `briefing.js`/`character.js`. Phone shows the object as cards; PC shows it in
`BriefingPanel` and Nova speaks the headline.

### 3.4 Remote API (`station/api.cjs`, Fastify, `127.0.0.1:47811` only)

All routes require `Authorization: Bearer <token>`. Token generated when Station is enabled,
shown once on PC as a QR, stored as a hash. Reachable from the phone only through
`tailscale serve` (HTTPS inside the tailnet). Never bind `0.0.0.0`. Never port forward.

```
GET  /api/health                → { ok, version, uptimeSec, session, lastSyncAt, queueDepth }
GET  /api/briefing              → latest Briefing (rebuild if older than 10 min)
POST /api/run   { preset }      → { runId, jobIds }
GET  /api/jobs?since=ISO        → [job]
GET  /api/jobs/:id              → job + events
POST /api/jobs/:id/cancel       → { ok }
GET  /api/stream                → Server Sent Events: job.updated, job.event, briefing.ready
GET  /api/drafts/:id            → { meta, markdown }   (read on phone)
POST /api/drafts/:id/status { status: "reviewed"|"dismissed" }
GET  /                          → remote PWA static files
```

### 3.5 Push (ntfy)

`station/notify.cjs` posts to `station.ntfy_url/station.ntfy_topic` (default `https://ntfy.sh`
with a long random topic). Topic names on ntfy.sh are only as private as they are
unguessable, so push text stays minimal unless `station.push_details=1`:

| event | title | priority |
|---|---|---|
| run finished | "Nova: run done — 2 grades, 1 draft ready" | default |
| draft ready | "Draft ready: GBA 490 Case 4 (outline)" | default |
| new grade(s) | "New grade in GBA 490" (score only if push_details) | default |
| BB session expired | "Blackboard signed out — sign in on the PC" | high |
| job failed twice | "Nova: drafts_prep failed" | default |
| morning briefing | "Morning brief ready" | low |

Every push carries `Click: <tailnet dashboard URL>`.

---

## 4. Job engine rules (`station/jobs.cjs`)

- One job runs at a time (Blackboard already rate limited at 250 ms gaps; keep it simple).
- Queue survives restarts. On boot, `running` jobs become `failed: interrupted` and are
  requeued once if `attempts < 2`.
- Handlers get `{ params, progress(pct, msg), log(level, msg, data), signal }` and return
  `{ summary, status? }`. `signal` is an AbortSignal for cancel.
- Every state change writes `station_job_events` and emits on an in-process emitter that
  feeds SSE, IPC (`station:job`), and notify.
- `dedupe_key` blocks duplicate queued work (pressing Run twice does nothing new).
- Session expired inside any handler → job `needs_you`, push high priority, stop the run.

## 5. Scheduler (`station/scheduler.cjs`)

No new cron dependency; follow the `bbWatcher` setTimeout pattern. Schedule:
- Existing `bbWatcher` cadence stays as is (it already handles grades/announcements).
- `briefing_build` (kind `morning`) at `station.morning_brief_at`, and `evening` at 18:00.
- Every 2 h: if an eligible assignment is due within 72 h with no draft → enqueue `drafts`.
- Nightly 03:30: `health_check`.
- After `powerMonitor` resume: one `bb_sync` after 90 s (mirror existing `AFTER_RESUME_MS`).

## 6. Draft prep (`station/drafts.cjs`)

**Purpose:** a review copy that saves setup time. Jack reads, rewrites, and submits himself.
Station never submits or pastes anything anywhere.

Eligible when all are true: `assignmentKind(title) === "assignment"`; title or instructions
match writing work (`case|paper|essay|memo|reflection|discussion|write ?up|response|report`);
course draft mode is not `off`; due within 72 h; `submitted = 0` and `score IS NULL`; no
existing draft for that mode.

Modes (per course, set on PC):
- `outline` — **default for GBA 490 written cases** (Jack builds those section by section to
  learn them). Section skeleton matching the sample format, guiding questions per section,
  facts/figures to pull from the case, `[CHECK]` markers. No finished prose.
- `rough_draft` — plain first pass in his voice, `DRAFT — REVIEW BEFORE USE` header, `[CHECK]`
  wherever a fact, number, or citation needs confirming.
- `off`.

Inputs: assignment instructions (`instructions_sync`), attachment text (officeparser /
pdf-parse), syllabus excerpt already mirrored, and the style profile folder
`%APPDATA%\Study Hub\station\style\` (Jack copies his writing rules + 2–3 past samples here;
core rules: plain everyday words, no hyphens or dashes, contractions and "I" are fine, follow
the sample format, no extra interpretive sentences).

Pipeline: build prompt → Claude (`station.draft_model`, default `claude-sonnet-5-5`; style
profile as cached system prompt) → style lint (flag every `-` `–` `—` as a `[CHECK]`, do not
silently rewrite) → write `.md` + `.docx` (npm `docx`) to
`Documents\Nova Drafts\<Course>\<YYYY-MM-DD> <Title>.docx` → `station_drafts` row → push.

Spend cap: before any Claude call, check `station_ai_usage` for today; over cap → job
`needs_you` with "AI cap reached". Record tokens after every call.

## 7. Guardrails (add to PROJECT_BRIEF §6 and its decision log)

1. Job allowlist only (§3.2). No submit/answer/post path to any LMS or publisher site.
   Guard test: station code contains no non-GET request to school or publisher origins and
   no handler type outside the allowlist.
2. Drafts are review copies saved locally. Nothing is auto-pasted or uploaded.
3. Remote surface = loopback + `tailscale serve` + bearer token. No `0.0.0.0`, no port forward.
4. Push text minimal by default; details live behind Tailscale.
5. Daily AI spend cap enforced in code.
6. Decision log entries: (a) Sonnet allowed for drafts (overrides "Haiku only" for this
   feature); (b) push summaries leave the machine via ntfy (opt-in when Station is enabled).

## 8. Home PC host setup (`scripts/station-host.ps1`, run once as admin, prints each change)

- Power: `powercfg /change standby-timeout-ac 0` and `hibernate-timeout-ac 0`.
- Windows Update: set active hours wide (manual step, printed instructions).
- Watchdog: Task Scheduler task every 15 min — if `Study Hub.exe` isn't running, start it
  with `--hidden`.
- Tailscale: install, `tailscale serve --bg --https=443 http://127.0.0.1:47811`.
- Duo / Blackboard sign-in recovery: when the session expires, Jack signs in through
  Chrome Remote Desktop (or RDP over Tailscale on Windows Pro). Tick "remember this device"
  in Duo to stretch the gap.
- Optional, with trade-off spelled out: Sysinternals Autologon so the PC returns to the
  desktop after a reboot (convenient, but anyone at the PC gets in).

## 9. Tools for the build

Already installed: **superpowers** (writing-plans, subagent-driven-development,
dispatching-parallel-agents, using-git-worktrees, test-driven-development,
requesting-code-review, finishing-a-development-branch) and **ponytail** (keeps agents from
over-building; `/ponytail-review` as a review gate).

Add:
- **Context7 MCP** — current docs for Electron, Fastify, better-sqlite3, docx, vitest.
- **Playwright MCP** — drive the remote PWA in a phone-sized viewport to check it.
- **GitHub MCP** (hosted endpoint + PAT) — optional, if you want PRs per story.
- Cursor **Agents Window** + git worktrees for parallel stories; project subagents in
  `.cursor/agents/` (station-builder, spec-reviewer, lean-reviewer, guard-reviewer).

Runtime deps to add (keep it to these): `fastify`, `@fastify/static`, `docx`, `qrcode`.

## 10. Timeline (part time, Cursor doing most typing)

| Wave | Work | Est. |
|---|---|---|
| 0 | Contracts: migration, allowlist, briefing schema, station adapter + boot wiring | 2–3 evenings |
| 1 | Jobs engine, scheduler, notify, API, briefing builder (4 parallel) | 1 weekend + evenings |
| 2 | Remote PWA, instructions sync, drafts pipeline, PC panel + Nova wiring (4 parallel) | 1 weekend + evenings |
| 3 | Host script, guard test, end to end run, soak week | 1 weekend + 1 week soak |

≈ 3–4 weeks to v1 because the watcher, tray, session, and diff engine already exist.
Soak week matters most: Duo expiry, reboots, and sleep are what break unattended runs.
