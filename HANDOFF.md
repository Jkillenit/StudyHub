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
