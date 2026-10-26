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
