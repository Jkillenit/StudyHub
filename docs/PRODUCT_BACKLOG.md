# Product backlog — Study Hub

Features are **rated by the implementer** (impact, difficulty, rough time) when added — not a user vote — so we can sort and plan consistently.

---

## Strategic constraints

---

## API philosophy

Study Hub is designed local-first. Every core feature works without an Anthropic API key. The API key is an optional upgrade, never a requirement.

### Feature tiers

**Tier 1 — Fully local (no API key required, ever)**
- Rich text notes editor
- Manual flashcard creation and drill
- PPTX text extraction (raw slide text → notes, unformatted)
- PDF text extraction
- Blackboard ZIP course import
- Glossary and key term search
- SM-2 spaced repetition mastery system
- Chapter completion tracking
- Session history and drill streaks
- GitHub release installer and auto-updater

**Tier 2 — Enhanced by API (works without, meaningfully better with)**
- PPTX import: raw extraction (local) vs structured notes + auto flashcard generation (API)
- Formula practice: hand-authored problem templates (local) vs unlimited AI-generated variants (API)
- Notes: manual writing (local) vs AI summarize / expand / explain selection (API)

**Tier 3 — API-unlocked features (require key to function)**
- Full Blackboard live integration (authenticated scraper via embedded browser — complex enough that AI assistance is required for reliable parsing)
- AI study assistant chat panel
- Auto-generated practice exams from chapter content

### API key UX rules
- First-run onboarding does not gate on API key — user skips it freely
- Features that require API show a clear inline prompt: "Add API key in Settings to unlock this" — never a blocking modal
- Features that are enhanced by API show their local version by default with an unobtrusive "✦ Enhance with AI" affordance
- API key is stored locally in Electron safeStorage — never sent anywhere except api.anthropic.com

### Tag reference (used in backlog table)
  `local-first`   — works fully without API
  `AI-optional`   — local version exists, API improves it  
  `AI-required`   — only meaningful with API key

---

## Backlog (sorted by difficulty, then time)

**Sort rule:** Lower **Difficulty** first (1 = easiest). If tied, shorter **est. time** first.

| ID | Feature | Impact | Difficulty | Est. time | Tags |
|----|---------|--------|------------|-----------|------|
| **UI-001** | Formulas page — Bootstrap layout (`Container`, `Alert`, cards) | 2 | **1** | ~0.5 d | `UI` |
| **UI-002** | Materials offcanvas — align with hub patterns | 2 | **1** | ~0.5 d | `UI` |
| **UI-003** | AI assistant — React Bootstrap `Modal` | 3 | **2** | ~1 d | `UI` |
| **QZ-001** | Flashcard card editor — inline front/back edit without leaving drill | 3 | **2** | ~1 d | `content`, `UI` |
| **QZ-002** | End-of-session summary screen — known/again breakdown, weak card list, review again shortcut | 4 | **2** | ~1–2 d | `UI`, `content` |
| **UI-004** | User courses shell — Navbar / Nav / Collapse / Forms (match OM300) | 3 | **3** | ~1–2 d | `UI` |
| **B2** | PDF text extraction + in-app read view | 4 | **3** | ~1–2 wk | `local-first`, `Electron` |
| **B3** | PPTX slide text extraction | 3 | **3** | ~1 wk | `local-first` |
| **B3-B** | PPTX AI enhancement — Claude API classifies unclassified content, ENHANCE WITH AI button, requires API key | 4 | **3** | ~3 d | `AI-optional` | 📋 Planned |
| **QZ-003** | Filtered drill modes — by chapter, weak cards only, recent cards, exam cram cross-chapter | 4 | **3** | ~2–3 d | `content`, `local-first` |
| **QZ-004** | Session history + drill streak — days drilled, cards per session, visible in context panel | 3 | **3** | ~2–3 d | `content`, `local-first` |
| **INF-001** | Migrate localStorage → better-sqlite3 via Electron IPC bridge | 5 | **3** | ~3–5 d | `infra` `local-first` |
| **QZ-006** | Deck export — CSV and Anki-compatible .apkg export | 3 | **4** | ~1 wk | `local-first`, `Electron` |
| **B3-A** | PPTX local extraction + classification (officeparser AST, 4-type classifier, bold term detection, chapter + course import, review block) | 5 | **3** | ~1 wk | `local-first` `Electron` | 🔄 In progress |
| **NT-003** | Export chapter notes as plain text / markdown — copy to clipboard, one button | 3 | **1** | ~0.5 d | `content` | ✓ Done |
| **NT-002** | Notes autosave + floating bubble toolbar + inline glossary highlighting (Option A — on save) | 4 | **2** | ~2 d | `content` | ✓ Done |
| **NT-004** | AI-assisted notes — summarize, expand, simplify selected text via Claude API | 4 | **3** | ~1 wk | `AI-optional` `content` |
| **NT-005** | Glossary highlight upgrade — Option B, real-time decoration via TipTap transaction API. Requires INF-001 (SQLite) complete first so glossary terms are pre-loaded into React state on chapter open via IPC. One-day upgrade from Option A once data layer is stable. | 3 | **3** | ~1 d | `content` `local-first` |
| **C2** | Glossary auto-highlight on imported text | 4 | **4** | ~2 wk | `content` |
| **QZ-005** | SM-2 spaced repetition — per-card difficulty, resurface logic, retire mastered cards | 5 | **4** | ~1–2 wk | `content`, `local-first` |
| **FR-001** | Formula practice — local generators + graders + UI | 5 | **4** | ~3–6 wk | `content`, `local-first`, `AI-optional` |
| **C1** | Blackboard export ZIP heuristics | 4 | **4** | ~2–4 wk | `Electron` |
| **D1** | OCR for scanned PDFs | 3 | **5** | ~3+ wk | `heavy` |
| **D2** | Blackboard REST / LTI | 3 | **5** | TBD | `institutional` |

_Time is rough engineering time for a solo/small pass, not a guarantee._

---

## Delivery status (rolling)

| Track | Status |
|-------|--------|
| **UI overhaul** (UI-001–004, shared chapter `Card` → React Bootstrap, Quizlet/flashcards, Final review chrome, glossary panel button, lazy-load spinner) | **Complete** |
| **Phase 1a — Notes editor** (NT-001 TipTap editor, NT-002 glossary highlighting, NT-003 export) | **Complete** |
| **Phase 1b-A — PPTX local pipeline** | 🔄 In progress |
| **NT-002 — inline glossary highlighting** | **Done** |
| **B2 — PDF** | **In progress** — Phase 1 shipped: main-process text via `pdf-parse` (`studyhub:extract-pdf-text`), preload `extractPdfText`, Materials **Read text** modal. Remaining: in-document search, large-file tuning, optional embedded PDF.js viewer, OCR path (ties **D1**). |

---

## How ratings are chosen

| Dimension | Scale | Meaning |
|-----------|-------|--------|
| **Impact** | 1–5 | Study value / product differentiation |
| **Difficulty** | 1–5 | Engineering + content risk (1 trivial … 5 research-heavy) |
| **Est. time** | d / wk | Calendar effort order-of-magnitude |

**Reason** for each scored item lives in expanded sections below (or in linked roadmap work).

---

## NT-005 — Real-time glossary highlighting upgrade (expanded)

| Field | Value |
|-------|-------|
| Impact | 3 |
| Difficulty | 3 |
| Est. time | ~1 day |
| Prerequisite | INF-001 (SQLite migration) must be complete |
| Tags | content, local-first |

Upgrades NT-002 from save-triggered to real-time.
Uses TipTap's addProseMirrorPlugins() to register a decoration plugin that runs on every editor transaction.
The plugin reads glossaryTerms from a ref (not state, to avoid stale closures) and applies DecorationSet marks synchronously without moving the cursor.

Cannot be built before INF-001 because the IPC-based SQLite data loading pattern must be established first — async glossary fetching on every transaction is not viable, terms must be pre-loaded into memory when the chapter opens. Once INF-001 establishes that pattern, this upgrade is a contained one-day implementation.

---

## FR-001 — Formula practice (expanded)

| Field | Value |
|-------|--------|
| **Impact** | **5** |
| **Difficulty** | **4** (local-first default) |
| **Est. time** | **3–6 weeks** for a solid first release (several formula families + UI + persistence) |
| **Tags** | `content`, `local-first`, `AI-optional` |

**Reason for difficulty**  
Many independent quantitative families (EOQ, EPQ, smoothing, SPC, CPM, …), each needs valid random inputs, correct answers, grading tolerance, and optional hints — mostly **hand-authored templates**, not one generic solver.

**Reason for impact**  
Moves the app from **reference** to **active practice** for exam-heavy quantitative courses.

**AI**  
Optional “extra variant” only; core loop stays local. *(See roadmap for full strategy.)*

---

## QZ-002 — End-of-session summary (expanded)

| Field | Value |
|-------|--------|
| **Impact** | 4 |
| **Difficulty** | 2 |
| **Est. time** | ~1–2 days |
| **Tags** | UI, content |

Triggered when user reaches the last card in a deck pass and clicks KNOW IT or AGAIN on the final card. Full-screen overlay on `--sh-base`. Shows: total cards drilled, known count in green, again count in amber, list of flagged card fronts, session duration in monospace, and two CTAs — "REVIEW WEAK CARDS" (starts filtered deck of again-flagged cards) and "DONE" (returns to normal drill view with deck reset to front face). No persistence required — session state only.

---

## QZ-005 — SM-2 spaced repetition (expanded)

| Field | Value |
|-------|--------|
| **Impact** | 5 |
| **Difficulty** | 4 |
| **Est. time** | ~1–2 weeks |
| **Tags** | content, local-first |

**Reason for difficulty:** requires per-card metadata persisted to SQLite (ease factor, interval, next review date, repetition count), a correct SM-2 interval calculation on every KNOW IT / AGAIN response, and a deck-loading change that filters and sorts cards by due date rather than serving the full deck. The algorithm itself is ~50 lines of JS but the persistence schema change and migration from the current JSON storage touches multiple layers. Depends on QZ-002 (session summary) being shipped first so the feedback loop is established before the algorithm changes what gets surfaced.

---

## INF-001 — localStorage → better-sqlite3 migration (expanded)

| Field | Value |
|-------|-------|
| Impact | 5 |
| Difficulty | 3 |
| Est. time | ~3–5 days |
| Tags | infra, local-first |

Must be completed before Phase 2 begins. localStorage has a 5–10MB size cap and is synchronous — both become real problems once PPTX import generates large notes content and SM-2 requires per-card date queries.

**Migration path:**

- Install better-sqlite3 in the main process.
- Create a db.js module in main with get, set, query, and run methods.
- Expose via preload contextBridge as window.studyHub.db.
- Migrate existing localStorage keys to SQLite tables on first launch after update — lossless, with fallback read from localStorage if SQLite record not found.
- Remove localStorage reads one key at a time after confirming each migration path works.
- Components call window.studyHub.db instead of localStorage — minimal surface area change in React.

**Schema (initial):**

- courses table — id, name, subtitle, created_at
- chapters table — id, course_id, title, order_index
- content table — chapter_id, type, body, created_at
- flashcards table — id, course_id, front, back
- mastery table — card_id, ease, interval, reps, next_review, last_reviewed
- settings table — key, value

This migration is a prerequisite gate for INF-001. Nothing in Phase 2 (SM-2, Blackboard import) ships until INF-001 is complete and verified.

---

## UI build queue (complete)

| ID | Status |
|----|--------|
| UI-001 | **Done** |
| UI-002 | **Done** |
| UI-003 | **Done** |
| UI-004 | **Done** |

---

*New ideas you list get an ID row in the sorted table with implementer-assigned Impact, Difficulty, and time, then expanded detail if needed.*
