# Station S0.4 — Model router

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development.

**Goal:** Add `createModelRouter` / `route(task, opts)` per BRIEFING §3.6 so Station drafts call one door (local Ollama first, Anthropic cloud fallback) with spend-cap and Opus gates. No live network in tests.

**Architecture:** Plain CommonJS under `electron/station/`. ESM packages (`ai`, `@ai-sdk/anthropic`, `ollama-ai-provider-v2`) load via lazy `import()` only inside default local/cloud generators. Tests inject `probeOllama`, `generateLocal`, `generateCloud`.

**Tech stack:** vitest + `createRequire`, better-sqlite3 settings + `station_ai_usage`, AI SDK (`generateText`) + Ollama provider v2 + `@ai-sdk/anthropic` + `zod` (peer). Prefer versions that run on Electron 34's Node 20 (`ai@5` / `ollama-ai-provider-v2@3` family) unless proven otherwise.

**Owns:** `electron/station/modelRouter.cjs`, `modelRouter.test.js`, `package.json` / lock (those four deps only), optional migration **14** for router settings defaults.

**Not owned:** `index.cjs` wiring of `route` into `draftsPrep` → `HANDOFF.md`.

**Base:** `main` after docs commit `station: model router + build decisions` (S0.1–S0.3 already merged; Wave 1–2 drafts already inject `route`).

## Status note

Wave 0 S0.1–S0.3 are on `main`. No Wave 0 story remains in progress except this S0.4 docs→code follow-through. Do **not** add `liteque`.

## Tasks

- [ ] Failing tests: unknown task, local-first, cloud fallback, cap deferred, opus_blocked, usage rows
- [ ] `createModelRouter` + settings readers + usage write
- [ ] Default generators via lazy `import()` (production path)
- [ ] Migration 14: `prefer_local`, `local_model`, `cloud_model`, `ollama_base_url`, `allow_opus`
- [ ] `npm install ai @ai-sdk/anthropic ollama-ai-provider-v2 zod` (no other deps)
- [ ] `npm test` green; HANDOFF for index wiring; commit `station: S0.4 model router`

## `route` contract (frozen §3.6)

```js
await route("draft_outline"|"draft_rough", {
  system, userContent, maxTokens?, cacheSystem?
})
// ok → { ok:true, text, model, tokensIn, tokensOut, provider:"ollama"|"anthropic" }
// cap → { ok:false, deferred:true, reason:"cap" }
// opus → { ok:false, deferred:true, reason:"opus_blocked" }
// none → { ok:false, reason:"unavailable", error }
// bad  → { ok:false, reason:"unknown_task" }
```

## Append to Wave 0 plan

See also `docs/superpowers/plans/2026-10-26-station-wave0-contracts.md` — add S0.4 after S0.1–S0.3 (this file is the execution plan).
