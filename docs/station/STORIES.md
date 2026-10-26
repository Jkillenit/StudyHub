# Nova Station — Story Board

Rules for every story:
- One story = one agent = one git worktree/branch (`station/<id>`).
- An agent only edits the files listed under **Owns**. Anything else it needs goes in a
  `HANDOFF.md` note on its branch for the orchestrator.
- TDD: write the failing vitest first (superpowers test-driven-development).
- Done = acceptance checks pass, `npm test` green, spec-reviewer + lean-reviewer +
  guard-reviewer pass, then orchestrator merges.
- Contracts in `BRIEFING.md §3` are frozen after Wave 0. Changing one = stop and ask Jack.

Status keys: `todo` · `doing` · `review` · `merged`

---

## Wave 0 — Contracts (ONE agent, sequential, before anything parallel)

### S0.1 Station migration + settings defaults — `merged`
**Owns:** `electron/database.cjs` (new numbered migration only)
**Do:** add tables/columns from BRIEFING §3.1 via the existing migration + `addColumn` pattern.
**Accept:** fresh DB and an existing DB both migrate; `scripts/check-db.cjs` lists new tables;
migration test added.

### S0.2 Contracts module — `merged`
**Owns:** `electron/station/contracts.cjs`, `electron/station/contracts.test.js`
**Do:** export `JOB_TYPES` (frozen allowlist), `JOB_STATUS`, `RUN_PRESETS`, `EVENTS`
(`job.updated`, `job.event`, `briefing.ready`, `session.changed`), `validateBriefing(obj)`
(hand written checks, no schema lib), JSDoc typedefs for Job, JobEvent, Draft, Briefing.
**Accept:** tests cover every preset expanding to allowlisted types only; unknown type rejected.

### S0.3 Station adapter + boot wiring — `merged`
**Owns:** `electron/station/index.cjs`, `electron/station/electronAdapter.cjs`,
one `require` + `start()` call in `electron/main.cjs`
**Do:** `electronAdapter.cjs` is the only station file allowed to import `electron`; it exposes
`backgroundCheck`, `getDb`, `powerMonitor` events, `paths` (appData, documents), `ipcSend`.
`index.cjs` wires empty stubs for jobs/scheduler/api/notify behind `station.enabled`.
**Accept:** app boots with Station off (no behavior change) and on (logs "station ready").

### S0.4 Model router — `merged`
**Owns:** `electron/station/modelRouter.cjs`, `electron/station/modelRouter.test.js`,
`package.json` / `package-lock.json` (deps only: `ai`, `@ai-sdk/anthropic`,
`ollama-ai-provider-v2`, `zod`), optional next numbered migration in `electron/database.cjs`
for router settings defaults (`prefer_local`, `local_model`, `cloud_model`,
`ollama_base_url`, `allow_opus`).
**Do:** implement BRIEFING §3.6 `createModelRouter` + `route(task, opts)`. TDD with **fake**
`probeOllama` / `generateLocal` / `generateCloud` (no live network in tests). Lazy `import()`
of ESM AI packages from CommonJS. Seed router settings; do not reintroduce
`station.draft_model`.
**Accept:** tests cover local-first success, cloud fallback when Ollama down, spend-cap
`deferred`/`cap`, Opus blocked unless `allow_opus`, unknown task rejected, usage rows written
(local `est_cents=0`); `npm test` green; no `liteque`.

**Wave 0 exit:** merge S0.1–S0.4 to `main`. All Wave 1 branches start from this commit.
(S0.1–S0.3 already merged; land S0.4 next so Wave 2 drafts can call `route`.)

---

## Wave 1 — Core (4 agents in parallel)

### S1.1 Job engine — `merged`
**Owns:** `electron/station/jobs.cjs`, `jobs.test.js`
**Do:** persistent queue per BRIEFING §4: enqueue (dedupe), single runner, progress/log/abort
API for handlers, restart recovery, cancel, emitter. Handlers registered by type; reject
non allowlisted types.
**Accept:** tests for dedupe, ordering, crash recovery requeue, cancel mid run, failure after
2 attempts, events written for every transition.

### S1.2 Scheduler — `merged`
**Owns:** `electron/station/scheduler.cjs`, `scheduler.test.js`
**Do:** BRIEFING §5 using injectable clock (`now`, `setTimeout`) like `bbWatcher`.
**Accept:** fake clock tests: morning/evening briefing fire once per day, resume triggers one
sync, 2 h draft check only enqueues when eligible assignments exist (eligibility passed in).

### S1.3 Notify (ntfy) — `merged`
**Owns:** `electron/station/notify.cjs`, `notify.test.js`
**Do:** BRIEFING §3.5 table; `push({ title, body, priority, click })` with injectable fetch;
detail stripping when `push_details=0`; rate limit (max 1 push per event type per 2 min,
batch extras into "+N more").
**Accept:** tests for each event mapping, detail stripping, rate limit batching; network
failure never throws into the job engine.

### S1.4 Briefing builder — `merged`
**Owns:** `electron/station/briefing.cjs`, `briefing.test.js`
**Do:** pure `buildBriefing(facts, now)` + `readFacts(db, now)`; output passes
`validateBriefing`. Reuse ranking ideas from `src/features/today/priority.js` but do not import
renderer code. `needsYou` order: sign_in, submit_yourself (due < 24 h), review_draft, study.
**Accept:** fixture DB tests: expired session shows sign_in first; submitted items excluded;
headline under 90 chars.

### S1.5 Remote API skeleton — `merged` *(run in Wave 1 if you have a 5th slot, else Wave 2)*
**Owns:** `electron/station/api.cjs`, `api.test.js`, `electron/station/auth.cjs`
**Do:** Fastify on `127.0.0.1:47811`, routes from BRIEFING §3.4 wired to injected services,
bearer token (hash compare, constant time), SSE stream.
**Accept:** `fastify.inject` tests: 401 without token, every route shape, server refuses to
start on a non loopback host.

**Wave 1 exit:** orchestrator merges S1.1 → S1.4 (→ S1.5), wires them in `station/index.cjs`,
runs `npm test`, smoke test: enqueue `notify_test` from a dev IPC call, phone gets push.

---

## Wave 2 — Features (4 agents in parallel)

### S2.1 Remote PWA — `merged`
**Owns:** `remote/**`, `remote.html`, Vite config entry for `remote`
**Do:** phone first page: Briefing cards (§3.3), Run button with presets, live jobs list (SSE),
draft reader (markdown), mark reviewed/dismissed, token entry/QR scan, add to home screen
manifest. Reuse `--sh-*` tokens look; no Bootstrap JS.
**Accept:** Playwright MCP check at 390×844: Run → job list updates → briefing refresh;
works offline showing last briefing.

### S2.2 Instructions sync — `merged`
**Owns:** `electron/station/handlers/instructionsSync.cjs`, test, and one exported GET helper
added to `electron/bbSync.cjs` (read only)
**Do:** for assignments due ≤ 7 days, GET instructions body + attachment URLs from the BB
public API, extract attachment text with existing parsers, store per §3.1.
**Accept:** fixture payload tests; a guard assertion that the helper only issues `GET`.

### S2.3 Drafts pipeline — `merged`
**Owns:** `electron/station/drafts.cjs`, `electron/station/handlers/draftsPrep.cjs`,
`electron/station/styleLint.cjs`, tests, `electron/station/prompts/*.md`
**Do:** BRIEFING §6: eligibility, modes, prompt build from style folder, model call **only**
via injected `route("draft_outline"|"draft_rough", { cacheSystem, system, userContent })`
(§3.6 / S0.4) — never `callMessages` or direct providers. Treat
`{ ok:false, deferred:true, reason:"cap" }` as job `needs_you`. Style lint, write `.md` +
`.docx`, row in `station_drafts`.
**Accept:** tests with fake `route`: eligibility matrix, GBA 490 defaults to outline, deferred
cap → `needs_you`, lint flags dashes as `[CHECK]`, files land in the right folder.

### S2.4 PC panel + Nova wiring — `merged`
**Owns:** `src/features/station/**`, `electron/station/ipc.cjs`, preload additions in
`electron/preload.cjs` (station namespace only)
**Do:** Station settings tab (enable, token QR, ntfy topic, push details, AI cap, per course
draft mode, model); Briefing panel fed by `station:briefing`; Nova speaks `briefing.ready`
headline via existing speech path; jobs drawer.
**Accept:** vitest for view models; manual: Run from PC updates panel live.

**Wave 2 exit:** orchestrator merges, wires handlers into `jobs.cjs` registry, full run on
dev machine: `full` preset end to end.

---

## Wave 3 — Hardening (1 agent + reviewers)

### S3.1 Host script — `merged`
**Owns:** `scripts/station-host.ps1`, `docs/station/HOST_SETUP.md`
**Do:** BRIEFING §8; idempotent; `-WhatIf` mode prints changes only.

### S3.2 Guard test — `merged`
**Owns:** `electron/station/guard.test.js`
**Do:** static checks over `electron/station/**`: only allowlisted handler types registered;
no `method: "POST"|"PUT"|"PATCH"|"DELETE"` toward school or publisher origins; api binds
loopback only.

### S3.3 Docs + decision log — `merged`
**Owns:** `docs/PROJECT_BRIEF.md` (§6 + decision log), `README.md` Station section

### S3.4 Soak — `todo`
Run for 7 days on the home PC. Log every failure in `docs/station/SOAK.md` with cause + fix
story. v1 is done when 7 days pass with no missed morning briefing and every session expiry
produced a push.
