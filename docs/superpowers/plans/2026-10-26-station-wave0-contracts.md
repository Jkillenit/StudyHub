# Nova Station Wave 0 — Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do **not** start coding until Jackson approves this plan.

**Goal:** Freeze Station contracts in the real Study Hub repo: schema migration + settings defaults (S0.1), shared allowlist/preset/briefing validators (S0.2), and a thin Electron adapter + boot stub gated on `station.enabled` (S0.3). No job runner, API, notify, or drafts yet.

**Architecture:** Keep the Electron main process as the always-on host. New logic lives under `electron/station/` as plain CommonJS. Only `electronAdapter.cjs` may `require("electron")`. Wave 0 wires empty stubs so later waves plug into `index.cjs` without touching `main.cjs` again. Contracts in `docs/station/BRIEFING.md` §3 are **frozen** — do not edit that section; if something is wrong, stop and ask Jack.

**Tech Stack:** Electron main (CommonJS), better-sqlite3 numbered migrations + `addColumn`, vitest via `createRequire` (same pattern as `electron/assignmentKind.test.js`), existing `scripts/check-db.cjs` under Electron.

**Specs:** `docs/station/BRIEFING.md` §3, `docs/station/STORIES.md` Wave 0 (S0.1–S0.3), `AGENTS.md`.

**Base:** `main` at `85b6f28` (briefing snapshot). Reconcile note: local/`origin/main` matched that commit when this plan was written — no drift to fold in.

## Global Constraints

- Edit only files listed under each story's **Owns** (plus the acceptance wiring called out below). Anything else → `HANDOFF.md` on the branch.
- TDD: failing vitest (or failing `check:db` assertion) first, then minimal code, then pass, then commit **one commit per story**.
- No new npm dependencies in Wave 0 (Fastify/`docx`/`qrcode` wait for later waves).
- No `console.log` / `console.error` in production paths **except** the single intentional `"station ready"` line required by S0.3 acceptance (use injectable `log`, defaulting to one `console.info` when Station is enabled).
- Never bind a server, never call Blackboard write APIs, never add a job type outside §3.2.
- `npm test` green after each story. After S0.1 also `npm run check:db`.
- Commit subjects: `station: S0.1 migration`, `station: S0.2 contracts`, `station: S0.3 adapter boot`. Stage by explicit path. Never force-push `main`.

## File map

| File | Story | Change |
|------|-------|--------|
| `electron/database.cjs` | S0.1 | Append migration **version 13** (tables/indexes/columns + settings defaults) |
| `scripts/check-db.cjs` | S0.1 accept | Assert new tables/columns and schema version ≥ 13 (Owns exception: acceptance requires it; Wave 0 is one sequential agent) |
| `electron/station/contracts.cjs` | S0.2 | Create: allowlists, presets, events, `validateBriefing`, JSDoc typedefs |
| `electron/station/contracts.test.js` | S0.2 | Create: preset expansion + reject unknown types + briefing shape |
| `electron/station/electronAdapter.cjs` | S0.3 | Create: only Station file that imports `electron` |
| `electron/station/index.cjs` | S0.3 | Create: `start()` / `stop()` behind `station.enabled`, empty stubs |
| `electron/station/index.test.js` | S0.3 | Create: off = no-op; on = logs ready + stubs present |
| `electron/main.cjs` | S0.3 | One `require` + `start()` after existing desktop/BB wiring |

---

### Task 1 — S0.1 Station migration + settings defaults

**Owns:** `electron/database.cjs` (new numbered migration only)  
**Also (accept):** `scripts/check-db.cjs`

**Interfaces / contract (§3.1):**

- Tables: `station_jobs`, `station_job_events`, `station_drafts`, `station_ai_usage` exactly as BRIEFING §3.1 (including partial unique index on `dedupe_key` for `queued|running`).
- Columns via `addColumn`: `assignments.instructions`, `assignments.instructions_synced_at`.
- Settings defaults (`INSERT OR IGNORE` into existing `settings` table):

| key | value |
|-----|-------|
| `station.enabled` | `0` |
| `station.push_details` | `0` |
| `station.ai_cap_cents_per_day` | `150` |
| `station.morning_brief_at` | `06:45` |
| `station.ntfy_url` | `https://ntfy.sh` |
| `station.draft_model` | `claude-sonnet-5-5` |

Leave `station.token_hash`, `station.ntfy_topic`, and `station.draft_mode.<courseUuid>` unset until Station is enabled / configured (no placeholder secrets).

Next migration version is **13** (current tip is 12: `study_sessions.exam_uuid`).

- [ ] **Step 1: Write the failing check** — in `scripts/check-db.cjs`, after the existing `exam_uuid` assert, add:

```js
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ["station_jobs", "station_job_events", "station_drafts", "station_ai_usage"]) {
    assert.ok(tables.includes(t), `missing table ${t} (migration 13)`);
  }
  const asgCols = db.prepare("PRAGMA table_info(assignments)").all().map((c) => c.name);
  assert.ok(asgCols.includes("instructions"), "assignments.instructions");
  assert.ok(asgCols.includes("instructions_synced_at"), "assignments.instructions_synced_at");
  const ver = db.prepare("SELECT MAX(version) AS v FROM schema_version").get().v;
  assert.ok(ver >= 13, `schema_version expected >= 13, got ${ver}`);
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'station.enabled'").get();
  assert.strictEqual(enabled?.value, "0", "station.enabled default");
```

- [ ] **Step 2: Run it, expect FAIL** — `npm run check:db` → fails: missing table `station_jobs` (or version < 13).

- [ ] **Step 3: Implement migration 13** — append to `MIGRATIONS` in `electron/database.cjs` (do not edit shipped 2–12):

```js
  {
    version: 13,
    up(dbRef) {
      dbRef.exec(`
        CREATE TABLE IF NOT EXISTS station_jobs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          params TEXT NOT NULL DEFAULT '{}',
          progress INTEGER NOT NULL DEFAULT 0,
          summary TEXT,
          error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          dedupe_key TEXT,
          run_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          finished_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_station_jobs_dedupe ON station_jobs(dedupe_key)
          WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
        CREATE INDEX IF NOT EXISTS idx_station_jobs_created ON station_jobs(created_at);

        CREATE TABLE IF NOT EXISTS station_job_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL REFERENCES station_jobs(id) ON DELETE CASCADE,
          at TEXT NOT NULL DEFAULT (datetime('now')),
          level TEXT NOT NULL DEFAULT 'info',
          message TEXT NOT NULL,
          data TEXT
        );

        CREATE TABLE IF NOT EXISTS station_drafts (
          id TEXT PRIMARY KEY,
          assignment_uuid TEXT NOT NULL,
          course_uuid TEXT NOT NULL,
          mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ready',
          docx_path TEXT,
          md_path TEXT,
          model TEXT,
          tokens_in INTEGER,
          tokens_out INTEGER,
          check_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(assignment_uuid, mode)
        );

        CREATE TABLE IF NOT EXISTS station_ai_usage (
          day TEXT NOT NULL,
          model TEXT NOT NULL,
          tokens_in INTEGER NOT NULL DEFAULT 0,
          tokens_out INTEGER NOT NULL DEFAULT 0,
          est_cents INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(day, model)
        );
      `);
      addColumn(dbRef, "assignments", "instructions", "TEXT");
      addColumn(dbRef, "assignments", "instructions_synced_at", "TEXT");
      dbRef.exec(`
        INSERT OR IGNORE INTO settings (key, value) VALUES
          ('station.enabled', '0'),
          ('station.push_details', '0'),
          ('station.ai_cap_cents_per_day', '150'),
          ('station.morning_brief_at', '06:45'),
          ('station.ntfy_url', 'https://ntfy.sh'),
          ('station.draft_model', 'claude-sonnet-5-5');
      `);
    },
  },
```

- [ ] **Step 4: Run it, expect PASS** — `npm run check:db` → `check-db ok`.

- [ ] **Step 5: Existing-DB path** — sanity without a second fixture harness: `runMigrations` is forward-only and skips `version <= current`, so a DB already at 12 applies only 13; a DB already at 13 is a no-op. Confirm by reading `runMigrations` still uses `schema_version` inserts inside a transaction (no code change). Optional: reopen `getDb()` in the same check-db process after close is unnecessary; the fresh temp DB already exercises `initSchema` + all migrations including 13.

- [ ] **Step 6: Commit**

```bash
git add electron/database.cjs scripts/check-db.cjs
git commit -m "$(cat <<'EOF'
station: S0.1 migration

- Add schema_version 13: station_jobs/events/drafts/ai_usage + assignment instructions columns
- Seed station.* settings defaults; assert via check-db
EOF
)"
```

---

### Task 2 — S0.2 Contracts module

**Owns:** `electron/station/contracts.cjs`, `electron/station/contracts.test.js`

**Interfaces (§3.2–3.3):**

```js
/** @typedef {'bb_sync'|'instructions_sync'|'drafts_prep'|'briefing_build'|'health_check'|'notify_test'} JobType */
/** @typedef {'queued'|'running'|'done'|'failed'|'cancelled'|'needs_you'} JobStatus */
/** @typedef {'schedule'|'remote'|'desktop'|'event'} JobSource */
/** @typedef {'full'|'sync'|'drafts'|'briefing'} RunPreset */
/** @typedef {'job.updated'|'job.event'|'briefing.ready'|'session.changed'} StationEvent */

Object.freeze(JOB_TYPES)           // array or Set of JobType — treat as frozen allowlist
Object.freeze(JOB_STATUS)
Object.freeze(RUN_PRESETS)         // map preset → JobType[]
Object.freeze(EVENTS)
function isJobType(t) → boolean
function expandPreset(preset) → JobType[]  // throws on unknown
function validateBriefing(obj) → { ok: true } | { ok: false, errors: string[] }
```

`RUN_PRESETS` must match BRIEFING §3.2 exactly:

| preset | jobs |
|--------|------|
| `full` | `bb_sync` → `instructions_sync` → `drafts_prep` → `briefing_build` |
| `sync` | `bb_sync` → `briefing_build` |
| `drafts` | `instructions_sync` → `drafts_prep` → `briefing_build` |
| `briefing` | `briefing_build` |

`validateBriefing` — hand-written checks only (no AJV/Zod). Require top-level keys from §3.3 (`generatedAt`, `kind`, `headline`, `session`, `newGrades`, `dueSoon`, `draftsReady`, `needsYou`, `announcements`, `jobs`, `aiSpend`); `kind` ∈ `run|morning|evening|on_demand`; `session.blackboard` ∈ `ok|expired|unknown`; arrays are arrays; `jobs` has `ran`/`failed`/`failures`; `aiSpend` has `todayCents`/`capCents`. Do **not** deep-validate every nested field beyond types needed for Wave 1 consumers — keep it lean.

JSDoc `@typedef` for `Job`, `JobEvent`, `Draft`, `Briefing` matching §3.1 / §3.3 field names (documentation only; no runtime classes).

- [ ] **Step 1: Write the failing test** — create `electron/station/contracts.test.js`:

```js
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const {
  JOB_TYPES,
  JOB_STATUS,
  RUN_PRESETS,
  EVENTS,
  isJobType,
  expandPreset,
  validateBriefing,
} = createRequire(import.meta.url)("./contracts.cjs");

describe("station contracts", () => {
  it("freezes the job allowlist", () => {
    expect(Object.isFrozen(JOB_TYPES)).toBe(true);
    expect([...JOB_TYPES].sort()).toEqual([
      "bb_sync",
      "briefing_build",
      "drafts_prep",
      "health_check",
      "instructions_sync",
      "notify_test",
    ]);
  });

  it("rejects unknown job types", () => {
    expect(isJobType("bb_sync")).toBe(true);
    expect(isJobType("submit_assignment")).toBe(false);
  });

  it.each(Object.keys(RUN_PRESETS))("preset %s expands to allowlisted types only", (preset) => {
    const types = expandPreset(preset);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(isJobType(t)).toBe(true);
  });

  it("maps presets to the briefing order", () => {
    expect(expandPreset("full")).toEqual([
      "bb_sync",
      "instructions_sync",
      "drafts_prep",
      "briefing_build",
    ]);
    expect(expandPreset("sync")).toEqual(["bb_sync", "briefing_build"]);
    expect(expandPreset("drafts")).toEqual([
      "instructions_sync",
      "drafts_prep",
      "briefing_build",
    ]);
    expect(expandPreset("briefing")).toEqual(["briefing_build"]);
  });

  it("throws on unknown preset", () => {
    expect(() => expandPreset("nuke")).toThrow(/preset/i);
  });

  it("lists SSE/IPC events", () => {
    expect([...EVENTS].sort()).toEqual([
      "briefing.ready",
      "job.event",
      "job.updated",
      "session.changed",
    ]);
  });

  it("validateBriefing accepts a minimal valid object", () => {
    const briefing = {
      generatedAt: "2026-10-26T06:45:00-05:00",
      kind: "morning",
      headline: "Quiet morning.",
      session: { blackboard: "ok", lastSyncAt: "2026-10-26T06:40:00-05:00" },
      newGrades: [],
      dueSoon: [],
      draftsReady: [],
      needsYou: [],
      announcements: [],
      jobs: { ran: 0, failed: 0, failures: [] },
      aiSpend: { todayCents: 0, capCents: 150 },
    };
    expect(validateBriefing(briefing)).toEqual({ ok: true });
  });

  it("validateBriefing rejects bad kind / missing keys", () => {
    expect(validateBriefing(null).ok).toBe(false);
    expect(validateBriefing({ kind: "nope" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run electron/station/contracts.test.js` → cannot find `./contracts.cjs`.

- [ ] **Step 3: Implement** — `electron/station/contracts.cjs` exporting the frozen constants + helpers above. Prefer `Object.freeze` on arrays/objects (and a frozen copy of `RUN_PRESETS` values). `JOB_TYPES` may be a frozen array; `isJobType` uses a `Set` built once from it.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run electron/station/contracts.test.js`. Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add electron/station/contracts.cjs electron/station/contracts.test.js
git commit -m "$(cat <<'EOF'
station: S0.2 contracts

- Freeze JOB_TYPES, JOB_STATUS, RUN_PRESETS, EVENTS
- expandPreset + validateBriefing with vitest coverage
EOF
)"
```

---

### Task 3 — S0.3 Station adapter + boot wiring

**Owns:** `electron/station/index.cjs`, `electron/station/electronAdapter.cjs`, one `require` + `start()` in `electron/main.cjs`  
**Also (test):** `electron/station/index.test.js`

**Interfaces:**

```js
// electronAdapter.cjs — ONLY station file that require("electron")
function createAdapter(opts = {}) → {
  getDb,                    // from ../database.cjs
  backgroundCheck,          // injected fn (courseId) → Promise; default throws until BB attached
  paths: { appData(), documents() },  // app.getPath('userData'|'documents')
  onPower(event, listener), // powerMonitor.on wrapper (resume/suspend/…)
  offPower(event, listener),
  ipcSend(channel, payload),// send to main BrowserWindow webContents; no-op if none
  setBackgroundCheck(fn),   // allow main/desktop to attach after BB register
}

// index.cjs
function readEnabled(db) → boolean   // settings key station.enabled truthy ("1" / "true")
function start(adapter, { log } = {}) → { started: boolean, stop(): void, stubs }
// When disabled: return { started: false, stop() {}, stubs: null } — zero side effects.
// When enabled: wire empty stubs { jobs, scheduler, api, notify } (each { start(){}, stop(){} }
// or null placeholders), call log("station ready") once, return { started: true, ... }.
```

**main.cjs wiring (minimal):**

After `desktop = registerDesktop(...)` and Blackboard attach (same `whenReady` block), add:

```js
const { createAdapter } = require("./station/electronAdapter.cjs");
const station = require("./station/index.cjs");
// ...
const stationAdapter = createAdapter();
station.start(stationAdapter);
// When BB handle exists, stationAdapter.setBackgroundCheck((id) => bb.backgroundCheck(id))
```

Keep the `setBackgroundCheck` hook ready even if Wave 0 only passes a stub — real `bb_sync` is Wave 1. Prefer calling `setBackgroundCheck` from the same place `desktop.attachBlackboard` gets its handle so the adapter does not import `blackboardWindow.cjs`.

Empty stubs must **not** open ports, timers, or network.

- [ ] **Step 1: Write the failing test** — `electron/station/index.test.js` with a fake adapter (no Electron):

```js
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const { start, readEnabled } = createRequire(import.meta.url)("./index.cjs");

function fakeAdapter({ enabled = "0" } = {}) {
  const settings = new Map([["station.enabled", enabled]]);
  return {
    getDb: () => ({
      prepare: (sql) => ({
        get: (key) => {
          if (/station\.enabled/.test(sql) || key === "station.enabled") {
            return { value: settings.get("station.enabled") };
          }
          return { value: settings.get(key) };
        },
      }),
    }),
    backgroundCheck: vi.fn(),
    paths: { appData: () => "/tmp/app", documents: () => "/tmp/docs" },
    onPower: vi.fn(),
    offPower: vi.fn(),
    ipcSend: vi.fn(),
    setBackgroundCheck: vi.fn(),
  };
}

describe("station boot", () => {
  it("does nothing when station.enabled is off", () => {
    const log = vi.fn();
    const result = start(fakeAdapter({ enabled: "0" }), { log });
    expect(result.started).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs station ready and exposes stubs when enabled", () => {
    const log = vi.fn();
    const result = start(fakeAdapter({ enabled: "1" }), { log });
    expect(result.started).toBe(true);
    expect(log).toHaveBeenCalledWith("station ready");
    expect(result.stubs).toMatchObject({
      jobs: expect.any(Object),
      scheduler: expect.any(Object),
      api: expect.any(Object),
      notify: expect.any(Object),
    });
    result.stop();
  });
});
```

Adjust the fake `getDb` to match whatever tiny SQL `readEnabled` actually uses (prefer a prepared `SELECT value FROM settings WHERE key = ?`).

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run electron/station/index.test.js`.

- [ ] **Step 3: Implement** `electronAdapter.cjs` + `index.cjs`. Default `log` in `start` = `(msg) => console.info(msg)` so a real enabled boot prints `station ready`; tests inject `log`.

- [ ] **Step 4: Wire `main.cjs`** — one require of the station modules + `station.start(createAdapter())` inside `app.whenReady` after desktop registration. Do not change tray/BB watcher behavior when Station is off (default).

- [ ] **Step 5: Run tests** — `npx vitest run electron/station/` and `npm test`. Manual smoke (when Jack runs Electron): launch with defaults → no Station log; set `station.enabled=1` in settings → next launch logs `station ready`.

- [ ] **Step 6: Commit**

```bash
git add electron/station/electronAdapter.cjs electron/station/index.cjs electron/station/index.test.js electron/main.cjs
git commit -m "$(cat <<'EOF'
station: S0.3 adapter boot

- electronAdapter is the only station file that imports electron
- start() no-ops when station.enabled is off; logs ready + empty stubs when on
- Wire one start() call from main
EOF
)"
```

---

## Wave 0 exit checklist

- [ ] `npm test` green
- [ ] `npm run check:db` green
- [ ] Diff reviewed by `spec-reviewer`, `lean-reviewer`, `guard-reviewer` (read-only); fix real findings
- [ ] Confirm no edits to BRIEFING §3 contracts
- [ ] Confirm `.cursor/agents/studyhub-advisor.md` untouched
- [ ] Stop — merge to `main` is Jack's call. Wave 1 branches start from that merge commit.

## Out of scope (do not implement in Wave 0)

Job engine, scheduler, ntfy, Fastify API, remote PWA, instructions sync, drafts, PC BriefingPanel, host PowerShell script, guard static test (S3.2).
