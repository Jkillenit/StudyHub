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
