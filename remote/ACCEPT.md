# S2.1 Remote PWA — acceptance

## Automated

- `npx vitest run remote` — storage, viewModels, api client, SSE parser, markdown
- `npm test` — full suite green
- `npm run build` — emits `dist/remote.html` and `dist/station-remote/` (index.html + assets + manifest/sw/icon)

## Playwright (390×844)

Playwright MCP / `@playwright/test` were **not available** in this environment. Manual checks below stand in.

## Manual checks (phone or DevTools device mode 390×844)

1. Open the remote shell (dev: Vite `/remote.html`, or Station `staticRoot` → `/`).
2. Paste a Station bearer token (or scan QR / open `?token=` link) → health succeeds → briefing cards render.
3. Choose preset **Full run** → **Run** → jobs list shows queued/running updates (SSE) → briefing refreshes on `briefing.ready`.
4. Tap a draft-ready / review_draft card → markdown reader → **Mark reviewed** / **Dismiss**.
5. Toggle offline (DevTools) → last briefing still visible, Run disabled, offline banner shown.
6. Add to Home Screen uses `manifest.webmanifest` (name Study Hub Station, theme `#000000`).
