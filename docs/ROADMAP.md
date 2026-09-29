# Study Hub — Roadmap

Study Hub is the **student-side replacement for Blackboard**: it mirrors each course from
Blackboard, wraps it in built-in study tools, and adds an optional cloud Commons for
shared study materials, past grade distributions, and professor reviews.

- Vision, architecture, data model, guardrails: [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)
- Rated feature IDs: [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md)

---

## Principles

- **Local-first**: personal data stays in local SQLite; works offline and without an account.
- **Commons is opt-in**: only items a student explicitly publishes leave the machine.
- **AI enhances, never replaces**: every feature works without an API key.
- **Integrity by design**: student-authored content only in Commons; anonymous grade data
  with a ≥5 report threshold; Blackboard access is read-only for the student's own data.
- **Stable data before features**: no phase ships on top of a data layer that loses work.

---

## Phase 0 — Stabilize and redesign the data layer ✓ *(done)*

| Work | Detail |
|------|--------|
| Granular upserts | Flashcards, content, grade components, modules upsert by `uuid`; no more delete-and-reinsert (it cascaded and wiped SM-2 mastery and grade entries). |
| Migrations | Numbered migrations on `schema_version`; courses gain `bb_course_id`, `subtitle`, `term`, `course_code`, `instructor`, `meta_json`. |
| Bug fixes | NOTES tab lazy-import crash, notes saved as HTML, editor no longer rebuilds per save, arrow keys ignored in contentEditable, BB PPTX temp path, BB import merges instead of replacing, BB course lookup by id, OM 300 KNOW IT/AGAIN, what-if render loop. |
| Security | API key main-process only via `safeStorage`; Haiku enhancement over IPC; BB bridge only on `*.blackboard.com`; material paths only from native dialogs. |
| Structure | Import/course logic split out of `StudyHubApp`/`UserCourseApp` into `src/features/`; app-level error boundary; debug logging removed. |

**Exit criteria**: edit a course, restart, SM-2 progress and grade entries survive; `npm run build` passes.

## Phase 1 — Blackboard Mirror *(the "better Blackboard" core)* ✓ *(done; CAL-002/003 carried)*

- Course sweep from the embedded window: content tree, announcements, assignments with due
  dates, the student's own gradebook — via Blackboard REST as the logged-in user.
- Local tables `announcements`, `assignments`, `bb_items`; incremental sync.
- **Today dashboard** on the hub: due soon, new announcements, cards due, grade changes.
- **Calendar**: month/week of assignments across courses (BB + syllabus + manual).
- Blackboard grades flow into the grade calculator.

## Phase 2 — Unified study suite ✓ *(done; FR-001 formula generators carried)*

- SM-2 filtered drill modes (due, weak, module), deck editor, session history + streak.
- **Practice tests** generated locally from definitions/glossary (multiple choice + typed),
  optional Haiku variants.
- **Study guide generator** per exam scope (modules + weak cards).
- **Exam time estimate** from mastery data and calendar exam dates.

## Phase 3 — Web study-guide finder

- "Find study materials" panel per course/module; queries from course code + key terms.
- Search via Claude web-search tool (main process) with graceful no-key fallback to a
  prepared search link.
- Save a result as a link, or import its text through the existing classifier → cards.

## Phase 4 — Commons backend and accounts

- Supabase: auth restricted to verified `.edu` domains, row-level security.
- Canonical course catalog: `course_code + term + instructor`.
- Publish / browse / clone / vote on decks and study guides; report + moderation queue.
- Client in `src/commons/` with an offline publish queue; inert until configured.

## Phase 5 — Grade insights

- End-of-semester opt-in to share final/exam grades anonymously.
- Distributions per course/instructor/term, shown only at ≥5 reports.

## Phase 6 — Professor mini-reviews

- Structured ratings (clarity, workload, exam difficulty, fairness) + ≤280-char text,
  one per verified student per course-term, filtered and reportable.

## Phase 7 — Packaging and alpha

- Auto-update via GitHub Releases, code signing, DB backup/export/restore, first-run
  onboarding (connect Blackboard → optionally join Commons), alpha to a small UA cohort.

---

## Dependency graph

```
Phase 0 ─▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3
   │                     │
   └────────▶ Phase 4 ───┼─▶ Phase 5
                         └─▶ Phase 6
Phase 0..6 ─▶ Phase 7
```

---

## Later / parked

- OCR for scanned PDFs (D1)
- Blackboard institutional REST / LTI (D2)
- Ink / stylus sketches per chapter
- Cross-device sync of personal data (only after Commons is proven)

*Last updated: 2026-09 — pivot to student-side Blackboard replacement.*
