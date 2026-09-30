# Study Hub — Project Brief

The single source of truth for what Study Hub is, how it is built, and where it is going.
Read this first. `ROADMAP.md` holds the phased plan; `PRODUCT_BACKLOG.md` holds rated feature IDs.

---

## 1. Vision

**Connect Blackboard once. Every day Study Hub tells you what matters and gets you ready for it.**

Study Hub reads a student's Blackboard courses (files, announcements, assignments, due
dates, their own grades) and turns them into a ranked daily plan on **Today**: what is due,
which exam is coming, which course is slipping below target, and the score needed to hold
it. Each item has one action: open it in Blackboard, start an exam review session, or open
the grade calculator. The built-in study tools do the getting-ready part (see §5 Study).

The Blackboard mirror is the engine; Today is the product. A community layer ("Commons")
for shared study materials, grade distributions, and professor reviews is deferred until
alpha usage justifies it.

What it is **not**: a replacement for Blackboard itself. Submissions, official quizzes and
official grades stay in Blackboard. Study Hub reads them and becomes the place students go
every day; it deep-links back to Blackboard when an action must happen there.

Target first school: The University of Alabama (`ualearn.blackboard.com`, `@crimson.ua.edu`).

---

## 2. Architecture

```
Blackboard (UA) ──embedded window + REST as logged-in user──▶ Electron main
                                                              │
                                              better-sqlite3 (local, WAL, FK on)
                                                              │
                                                     React renderer (Vite)
                                                     │                 │
                                     opt-in publish/query        web search/import
                                                     ▼                 ▼
                                             Commons (Supabase)   Study guides on web
                                                              
Electron main ──▶ Anthropic Claude Haiku (optional, key in safeStorage)
```

### Local-first plus optional cloud

| Layer | Holds | Needs account? | Works offline? |
|-------|-------|----------------|----------------|
| **Local** (SQLite) | Courses, modules, notes, content, flashcards, SM-2 mastery, own grades, Blackboard mirror | No | Yes |
| **Commons** (Supabase) | Shared decks/guides, anonymous grade distributions, professor reviews | Verified `.edu` | No (queued publish) |

Personal data never leaves the machine unless the student explicitly publishes an item.

### Tech stack

- **Runtime**: Electron 34 (main) + React 18 (renderer), Vite 6
- **DB**: better-sqlite3 via IPC (`db:*` handlers); schema migrations via `schema_version`
- **Parsing**: officeparser v6 (PPTX/DOCX/XLSX), pdf-parse (PDF) — main process only
- **Editor**: TipTap 3
- **Styling**: Bootstrap reset + custom `--sh-*` tokens in `src/studyhub-bootstrap.css`
- **AI**: Claude Haiku (`claude-haiku-4-5-20251001`) via main-process IPC, optional
- **Cloud (Later, gated on alpha)**: Supabase (Postgres + auth + RLS + edge functions)

### Process boundaries

- Renderer never `require()`s Node modules; everything goes through `window.studyHub`
  (see `electron/preload.cjs`).
- The API key lives only in the main process, encrypted with Electron `safeStorage`.
- The Blackboard window (`electron/blackboardWindow.cjs`) uses its own preload
  (`bbPreload.cjs`); its bridge is only honored for `*.blackboard.com` origins.
- File open/read IPC is restricted to an allowlist populated only by native dialogs,
  imports, and the Blackboard temp directory.

---

## 3. Code map

```
electron/
  main.cjs              Window, file/AI IPC, registers db + Blackboard handlers
  preload.cjs           window.studyHub / window.electronAPI bridge
  database.cjs          SQLite init, schema, migrations
  dbHandlers.cjs        All db:* IPC handlers (granular upserts)
  blackboardWindow.cjs  Embedded Blackboard window, injection, downloads, REST sync
  bbPreload.cjs         Bridge for the Blackboard window
  aiConfig.cjs          API key storage (safeStorage)
  anthropicClient.cjs   Claude calls (flashcards, enhancement, web study search)

src/
  app/StudyHubApp.jsx           Root: course list, routing, import orchestration
  features/                     Feature modules split out of the god-components
  features/today/               Priority engine (pure) + Today screen
  hub/                          User course view (sidebar, content area, grades)
  study/                        OM 300 built-in course + flashcard deck + sm2.js
  companion/                    Nova: 3D companion, quiz panel, tours, XP
  pptx/, ai/, syllabus/         Import pipelines
  db/courseStore.js             Renderer data-access layer (only way to touch the DB)
  commons/                      Commons client (Later)
  shell/                        Command palette, tiling chrome
supabase/                       Commons schema + RLS + edge functions (Later)
```

---

## 4. Data model (local SQLite)

Core: `courses`, `modules`, `notes`, `content_items`, `flashcards`, `mastery`,
`card_reviews`, `glossary_terms`, `grade_components`, `grade_entries`, `settings`.

Blackboard mirror: `assignments`, `announcements`, `bb_items`.

Study: `study_sessions`, `web_resources`.

Rules:
- Every entity has a stable `uuid`; writes are **upserts keyed by uuid**, never
  delete-and-reinsert (that destroyed SM-2 progress and grade entries before Phase 0).
- Multi-table writes run in a transaction. Foreign keys on. WAL on.
- New columns arrive via numbered migrations in `database.cjs`.

---

## 5. Feature status

### Study

- **Flashcards + SM-2**: drill modes (due, weak, module), deck editor, session history.
  Exam-aware: cards in an upcoming exam's scope have intervals capped before the exam date.
- **Practice tests**: generated locally from definitions and glossary; optional Haiku variants.
- **Study guides and exam estimate**: per exam scope, from modules and weak cards.
- **Grade calculator**: syllabus weights + Blackboard scores, what-if, needed score for target.
- **Nova (3D companion)**: VRoid model with a hologram shader (portrait fallback), tours and
  help, flashcard quiz with SM-2 grading, XP and streaks. Nova runs exam review sessions:
  the opening line comes from a local template built from DB facts; Haiku may rephrase it
  but never computes numbers. Spec: `docs/companion-spec.md`.

| Area | Status |
|------|--------|
| Electron shell, command palette, OM 300 course | Done |
| PPTX local import + Haiku enhancement | Done |
| Notes (TipTap), glossary, export | Done |
| Flashcards + SM-2 + session summary | Done (Phase 0 fixed persistence) |
| Grade calculator + syllabus weights | Done |
| Blackboard embedded window, single-file import | Done |
| Blackboard mirror, calendar, Today dashboard v1 | Done |
| Practice tests, study guide generator, exam estimate | Done |
| Nova companion C.1–C.6c | Done |
| Priority engine, ranked Today, needed score | Done (Phase 1) |
| Exam-aware SM-2, exam ready %, Nova review sessions | Phase 2 |
| Onboarding, backup/export, auto-update, alpha (20–30 users) | Phase 3 |
| Web guides, Commons, grade insights, professor reviews | Later (gated on alpha) |

---

## 6. Guardrails (non-negotiable)

- **Academic integrity**: Commons accepts only *student-authored* study content (decks,
  guides, notes). Raw professor files, exams, quizzes, and answer keys are blocked by
  default. Every shared item can be reported; moderation is required before scale.
- **Copyright**: Professor slides stay local. Web study guides are stored as link +
  summary/extracted cards, never re-hosted.
- **FERPA / privacy**: Grade data in Commons is self-reported, anonymous, and shown only
  when a bucket has **at least 5** reports. No identity is ever joined to grade data.
- **Professor reviews**: Structured ratings (clarity, workload, exam difficulty, fairness)
  + ≤280 char text; profanity/PII filters; one review per verified student per course-term.
- **Blackboard ToS**: Read-only, as the logged-in student, at human pace. No stored
  credentials (session cookie only). Never access other users' data.
- **AI**: Haiku only for enhancement. Local pipeline always runs first; AI enhances, never
  replaces. Every feature must degrade gracefully with no key.

---

## 7. Decisions log

| Date | Decision |
|------|----------|
| 2026-09 | Pivot: from local study app to student-side Blackboard replacement + Commons |
| 2026-09 | Architecture: local-first SQLite + optional Supabase Commons |
| 2026-09 | Data layer: granular uuid upserts replace full-course delete/reinsert sync |
| 2026-09 | API key moves to main process only, encrypted with safeStorage |
| 2026-09 | Commons auth restricted to verified `.edu` domains (configurable) |
| 2026-09 | Grade distributions require ≥5 reports per bucket |
| 2026-09 | Today becomes the core product: a ranked daily plan built from the mirror. Commons, grade insights, and professor reviews deferred until alpha usage justifies them |

## 8. Open questions

- Is public UA grade-distribution data available (public records)? Prefer it over self-reports.
- Web search provider for the web guide finder: Claude web-search tool vs Brave Search API.
- Code-signing certificate for Windows release (Phase 3 alpha).
- Moderation staffing model for Commons (report queue + auto-filters to start).
