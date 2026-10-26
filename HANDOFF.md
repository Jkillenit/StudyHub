# HANDOFF — S1.1 Job engine

## For orchestrator (`electron/station/index.cjs`)

Wire the real engine behind `station.enabled` when merging Wave 1:

```js
const { createJobEngine } = require("./jobs.cjs");

// inside start(), when enabled:
const jobs = createJobEngine({ db: adapter.getDb(), handlers: {} });
jobs.start();
// stubs.jobs = jobs;  // expose enqueue/cancel/emitter to api/scheduler later
// on stop: jobs.stop();
```

Handlers stay empty until Wave 2 registers `bb_sync`, `instructions_sync`, `drafts_prep`, etc.
S1.5 API and S1.2 scheduler should call `jobs.enqueue` / `jobs.cancel` / listen on `jobs.emitter`.

## Public API (`createJobEngine`)

| method | notes |
|---|---|
| `enqueue({ type, source, params?, dedupeKey?, runId? })` | rejects non-allowlisted types; dedupe returns existing queued/running row |
| `cancel(id)` | `{ ok }` — queued → cancelled; running → AbortSignal |
| `register(type, handler)` | allowlist only |
| `recover()` | also called from `start()` |
| `start()` / `stop()` | single runner pump |
| `emitter` | `job.updated`, `job.event` |
| `getJob(id)` / `getEvents(jobId)` | DB reads |

Handler contract: `({ params, progress, log, signal }) => { summary?, status? }`.
`status: "needs_you"` cancels remaining queued jobs with the same `run_id`.

---

# HANDOFF — S1.2 Scheduler

## Done (this branch)

- `electron/station/scheduler.cjs` — `createScheduler` with injectable `now` / `setTimeout` / `clearTimeout`
- `electron/station/scheduler.test.js` — fake clock covers morning/evening once/day, resume → one `bb_sync`, 2h draft eligibility, nightly `health_check`, custom morning time, `stop()`

## Wire in (orchestrator / Wave 1 exit) — do **not** edit here

`electron/station/index.cjs` still uses an empty scheduler stub. After S1.1 jobs lands:

```js
const { createScheduler } = require("./scheduler.cjs");

const scheduler = createScheduler({
  enqueue: (spec) => {
    // Jobs engine: accept { type, source, params } or { preset, source }
    // preset "drafts" → expandPreset("drafts") / enqueueRun("drafts")
    if (spec.preset) return jobs.enqueueRun(spec.preset, { source: spec.source });
    return jobs.enqueue({ type: spec.type, source: spec.source, params: spec.params || {} });
  },
  hasEligibleDrafts: () => /* S2.3 eligibility query, or false until drafts land */,
  getMorningBriefAt: () => {
    const row = adapter.getDb().prepare("SELECT value FROM settings WHERE key = ?").get("station.morning_brief_at");
    return row?.value || "06:45";
  },
});
scheduler.start();
adapter.onPower("resume", () => scheduler.resumed());
// on stop: adapter.offPower("resume", ...); scheduler.stop();
```

## Enqueue shapes (for S1.1)

| When | Spec |
|------|------|
| Morning | `{ type: "briefing_build", source: "schedule", params: { kind: "morning" } }` |
| Evening | `{ type: "briefing_build", source: "schedule", params: { kind: "evening" } }` |
| Nightly 03:30 | `{ type: "health_check", source: "schedule", params: {} }` |
| Resume +90s | `{ type: "bb_sync", source: "event", params: {} }` |
| Every 2h if eligible | `{ preset: "drafts", source: "schedule" }` |

## Notes

- No electron import (adapter owns `powerMonitor`).
- `bbWatcher` cadence unchanged; scheduler does not touch it.
- `hasEligibleDrafts` is injected — until S2.3, pass `() => false` so the 2h tick is a no-op.

---

# HANDOFF — S1.3 Notify (ntfy)

## Done
- `electron/station/notify.cjs` + `notify.test.js` (Owns only)
- `createNotify({ fetch, now, setTimeout, clearTimeout, getConfig })`
- `push({ title, body, priority, click, eventType })` — never throws
- `mapEvent` + `notifyEvent` for BRIEFING §3.5 table
- Detail strip when `pushDetails` false (body cleared at send; scores only in map when on)
- Rate limit: max 1 HTTP POST per `eventType` per 2 min; extras flush as `"<latest title> +N more"`
- `stop()` clears pending batch timers

## Orchestrator must wire
1. In `electron/station/index.cjs`: replace notify stub with `createNotify({ getConfig: () => read ntfy settings + clickUrl })`.
2. Settings keys: `station.ntfy_url`, `station.ntfy_topic`, `station.push_details`, plus a click URL (Tailscale dashboard). **Note:** Wave 0 migration seeds `ntfy_url` but not `ntfy_topic` — topic must be set when Station is enabled (S2.4 settings / enable flow).
3. Job engine / briefing callers should use `notifyEvent(kind, data)` or `push(...)`; treat `{ ok: false }` as soft failure (already non-throwing).
4. `notify_test` job handler: call `push` / `notifyEvent` once.

## Not changed (by design)
- Contracts, DB, index wiring, API, jobs — out of Owns.
- No new npm deps.

## Tests
- `npm test` — 63 files, **515** passed (17 new in `notify.test.js`)

---

# HANDOFF — S1.4 Briefing builder

## Done
- `electron/station/briefing.cjs`: `buildBriefing(facts, now)`, `readFacts(db, now)`
- Output always passes `validateBriefing` (throws if not)
- `needsYou` order: `sign_in` → `submit_yourself` (due &lt; 24h, including overdue) → `review_draft` → `study`
- Submitted / completed / scored assignments excluded from `dueSoon`
- Headline template capped at 90 chars

## Wire-up (orchestrator / other stories)
1. **`briefing_build` handler** (jobs registry): `const facts = readFacts(db, now); const briefing = buildBriefing({ ...facts, kind }, now);` then store JSON in settings `station.last_briefing` and emit `briefing.ready`.
2. **Session persistence:** `readFacts` reads `settings.station.bb_session` (`ok|expired|unknown`, default `unknown`) and optional `station.last_sync_at`. Falls back to `MAX(bb_items/bb_grade_items.synced_at)` for `lastSyncAt`. Whoever handles `bbWatcher` `onSession` / `health_check` should UPSERT those keys.
3. **Do not import** `src/features/today/*` from station — ranking here is due-date sort + hot &lt;24h only.

## Settings keys introduced (read-only in this story)
| key | meaning |
|-----|---------|
| `station.bb_session` | `ok` \| `expired` \| `unknown` |
| `station.last_sync_at` | ISO last sync (optional) |
| `station.ai_cap_cents_per_day` | already seeded in Wave 0 |

## Tests
`npx vitest run electron/station/briefing.test.js` — 7 passed (pure + in-memory fixture DB).

---

# HANDOFF — S1.5 Remote API skeleton

Branch: `station/S1.5-api`

## Shipped (Owns only)

- `electron/station/auth.cjs` — `generateToken`, `hashToken` (SHA-256 hex), `verifyToken` (timing-safe), `bearerFromHeader`
- `electron/station/api.cjs` — Fastify app: `createApi` / `start`, bind guard (`127.0.0.1` only, port `47811`), bearer gate on all routes, §3.4 routes, SSE via Readable stream, `@fastify/static` for `GET /`
- `electron/station/api.test.js` — 16 inject tests (401, route shapes, non-loopback refuse, SSE)
- Runtime deps: `fastify`, `@fastify/static` (in `package.json` / lockfile)

## Orchestrator wiring (not Owned — do after merge)

1. **`electron/station/index.cjs`** — replace `api: emptyStub()` with `api.start({ tokenHash, services, staticRoot })` when `station.enabled`. Call `stop()` on shutdown.
2. **Services object** — inject from Wave 1 siblings once merged:
   - `getHealth` ← jobs queue depth + session/lastSync from adapter/DB
   - `getBriefing` ← S1.4 (`briefing.cjs` + rebuild-if-older-than-10-min)
   - `startRun` / `listJobs` / `getJob` / `cancelJob` ← S1.1 (`jobs.cjs`)
   - `getDraft` / `setDraftStatus` ← drafts table (S2.3 rows; meta+md read)
   - `events` ← jobs emitter (`job.updated`, `job.event`, `briefing.ready`)
3. **Token lifecycle** — on Station enable (S2.4): `generateToken()`, show once + QR, persist `hashToken(token)` as `station.token_hash`. API needs that hash at start.
4. **`staticRoot`** — point at built remote PWA (S2.1 `remote/` / Vite out). Until then API can start without static (or empty dir); `GET /` 404s without root.
5. **Do not** bind anything but `127.0.0.1`; Tailscale serve stays outside the app.

## Accept

- [x] `fastify.inject`: 401 without token
- [x] Every §3.4 route shape
- [x] Refuses non-loopback host
- [x] `npm test` green (514)
