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
