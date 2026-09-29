# Product backlog — Study Hub

Rated by the implementer: **Impact** 1–5 (study value / differentiation), **Difficulty**
1–5 (engineering + risk), rough **est. time** for a solo pass. Grouped by roadmap phase
(see [`ROADMAP.md`](./ROADMAP.md)); vision and guardrails in [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md).

Tags: `local-first` (no API/cloud), `AI-optional`, `AI-required`, `cloud` (Commons),
`Electron`, `infra`, `UI`.

---

## Done

| ID | Feature |
|----|---------|
| UI-001..004 | Bootstrap-aligned UI overhaul |
| NT-001..003 | TipTap notes, glossary highlighting on save, export |
| B3-A | PPTX local extraction + 4-type classifier |
| B3-B | PPTX Haiku enhancement with graceful fallback |
| B2 (v1) | PDF text extraction (pdf-parse) + read view |
| QZ-002 | Session summary screen |
| QZ-005 (v1) | SM-2 scheduling in the drill, persisted to `mastery` |
| SYL-001..003 | Syllabus → grade weights, grade calculator (hypothetical, what-if, drop) |
| C2-A/B | Blackboard embedded window, single-file import, create course from BB |
| INF-001 | localStorage → SQLite for user courses |
| INF-002 | Granular uuid upserts, numbered migrations, course metadata columns (Phase 0) |
| BUG-001 | Audit fixes: notes crash, BB PPTX path, BB merge/duplication, OM 300 mastery, what-if loop, arrow keys (Phase 0) |
| SEC-001 | safeStorage API key via IPC, BB bridge origin guard, file path allowlist incl. drag-and-drop (Phase 0) |
| ARCH-001 | `src/features/` split, error boundary, debug logs removed (Phase 0) |
| QZ-005 (v2) | Deck modes (all/due/weak/module), in-deck add/edit/delete (Phase 0) |

## Phase 1 — Blackboard Mirror

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| BB-MIRROR | Course sweep: content tree, announcements, assignments, own grades via BB REST | 5 | 4 | 1–2 wk | `Electron` |
| DASH-001 | Today dashboard: due soon, announcements, cards due, grade changes | 5 | 2 | 2 d | `local-first` `UI` |
| CAL-001 | Semester calendar (month view), all courses, manual entry, mark complete | 5 | 3 | 3 d | `local-first` |
| CAL-002 | Upcoming-assignments widget in course context panel | 4 | 1 | 0.5 d | `local-first` |
| CAL-003 | Syllabus date extraction into calendar | 4 | 2 | 2 d | `local-first` `AI-optional` |
| CAL-004 | BB grades → grade calculator mapping | 5 | 3 | 2 d | `Electron` |

## Phase 2 — Study suite

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| QZ-003 | Filtered drill modes: due, weak, module | 4 | 2 | 1 d | `local-first` |
| QZ-001 | Inline deck editor | 3 | 2 | 1 d | `UI` |
| QZ-004 | Session history + streak | 3 | 2 | 1 d | `local-first` |
| PT-001 | Practice tests from definitions/glossary (MC + typed), optional Haiku variants | 5 | 3 | 3 d | `local-first` `AI-optional` |
| SG-001 | Study guide generator per exam scope | 4 | 2 | 2 d | `local-first` |
| EST-002 | Exam study time estimate from mastery + exam date | 5 | 3 | 2 d | `local-first` |
| FR-001 | Formula practice generators (EOQ, SPC, …) | 5 | 4 | 3–6 wk | `local-first` |

## Phase 3 — Web study guides

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| WEB-001 | Find study materials panel; Claude web search in main process; save link / import as cards | 4 | 3 | 1 wk | `AI-optional` |

## Phase 4 — Commons

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| COM-001 | Supabase project, `.edu` auth, RLS, canonical course catalog | 5 | 4 | 1 wk | `cloud` |
| COM-002 | Publish / browse / clone decks and study guides with provenance | 5 | 3 | 1 wk | `cloud` |
| COM-003 | Voting, reporting, moderation queue, content filters | 4 | 3 | 1 wk | `cloud` |

## Phase 5–6 — Insights and reviews

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| GRD-INS-001 | Anonymous grade distributions per course/instructor/term (≥5 reports) | 5 | 3 | 1 wk | `cloud` |
| PROF-001 | Professor mini-reviews: structured ratings + ≤280 chars, 1 per student per course-term | 4 | 3 | 1 wk | `cloud` |

## Phase 7 — Release

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| REL-001 | Auto-update via GitHub Releases | 4 | 2 | 1 d | `Electron` |
| REL-002 | DB backup / export / restore | 5 | 2 | 1 d | `local-first` |
| REL-003 | First-run onboarding (connect BB → optional Commons) | 4 | 2 | 2 d | `UI` |
| REL-004 | Windows code signing | 3 | 2 | TBD | `Electron` |

## Parked

| ID | Feature | Impact | Diff | Tags |
|----|---------|--------|------|------|
| D1 | OCR for scanned PDFs | 3 | 5 | `heavy` |
| D2 | Blackboard institutional REST / LTI | 3 | 5 | `institutional` |
| NT-004 | AI notes: summarize / expand selection | 4 | 3 | `AI-optional` |
| NT-005 | Real-time glossary decorations in TipTap | 3 | 3 | `local-first` |
| QZ-006 | Anki/CSV deck export | 3 | 4 | `local-first` |
| SYL-008..013 | GPA tracker, extra credit, curve sim, grade export, sparkline | 3–4 | 1–3 | `local-first` |

---

## Expanded: EST-002 — Exam study time estimate

For each module in the exam scope:
- `due` = cards with `next_review <= examDate`
- `learning` = cards with `repetitions < 3`
- `timePerReview` = avg session seconds / cards (default 2.5 min)
- `timePerLearning` = `timePerReview × 3.2`

`total = due × timePerReview + learning × timePerLearning`, split evenly across days until
the exam, capped at 2 h/day.

## Expanded: PT-001 — Practice tests

Local generator: for each definition, a multiple-choice question with 3 distractors drawn
from other definitions in the same course (prefer same module), plus typed-answer
questions graded by normalized string match. Score and missed items feed back into the
drill as "weak" cards. Haiku, when configured, can rewrite stems into scenario questions.

## Expanded: GRD-INS-001 — Grade insights

Buckets keyed by `canonical_course + instructor + term`. Reports store only the letter /
percentage band and a random submission id; the account link is a one-way hash used solely
to enforce one report per bucket. Aggregates are served from a view that returns nothing
under 5 reports.
