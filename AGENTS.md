# AGENTS.md — Study Hub

Study Hub is a local first Electron + React desktop app (see `.cursorrules` and
`docs/PROJECT_BRIEF.md`). The current build track is **Nova Station**: Study Hub running
always on from the home PC with a phone dashboard, push alerts, a job queue, draft prep for
review, and a briefing. Station work follows `docs/station/BRIEFING.md` and
`docs/station/STORIES.md`.

## Always

- Read `docs/station/BRIEFING.md` before any Station task. Its §3 contracts are frozen.
- Edit only the files your story **Owns**. Need something else? Write it in `HANDOFF.md`.
- Test first (vitest). Pure logic gets unit tests; Electron glue stays thin.
- `electron/station/electronAdapter.cjs` is the only Station file that imports `electron`.
- Keep it small. No new dependency unless BRIEFING §9 lists it or Jack approves.
- Match existing patterns: numbered migrations + `addColumn` in `database.cjs`, injectable
  clocks like `bbWatcher.cjs`, IPC through `preload.cjs` namespaces, `--sh-*` CSS tokens.
- Commit per story on your own branch. Never force push `main`.

## Never

- Never add a job type outside the allowlist in BRIEFING §3.2.
- Never write code that submits, uploads, posts, or answers anything on Blackboard or any
  publisher/LMS site. Station is read only toward school systems (`GET` only).
- Never bind a server to anything but `127.0.0.1`. No port forwarding, no public tunnels.
- Never log or push the API key, the bearer token, Blackboard cookies, or full grade
  details (unless `station.push_details` is on).
- Never call Claude without the daily spend cap check.

## Commands

- `npm test` — vitest (must be green before review)
- `npm run electron:dev` — build renderer + run the app
- `npm run rebuild` — rebuild better-sqlite3 for Electron after `npm ci`
- `npm run check:db` — inspect the local DB

## Reviewers

Before a story is done, run the `spec-reviewer`, `lean-reviewer`, and `guard-reviewer`
subagents on the diff. They are read only and report findings; the builder fixes them.
