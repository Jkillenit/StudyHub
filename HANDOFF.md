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
