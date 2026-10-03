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
| BB-MIRROR | Course sweep (content tree, announcements, assignments, own scores), sync creates the course, current-term filter, per-course views (Phase 1) |
| DASH-001 | Today dashboard: due soon, announcements, cards due, recent grades (Phase 1) |
| CAL-001 | Month calendar across courses, manual entry, mark complete (Phase 1) |
| CAL-004 | Syllabus weights (incl. Simple Syllabus) + BB scores → grade calculator, manual item mapping (Phase 1) |
| QZ-003 / QZ-001 | Drill modes and in-deck editor (shipped with QZ-005 v2, Phase 0) |
| QZ-004 | Progress view: streak, 14-day activity, accuracy, deck + per-module mastery, session history (Phase 2) |
| PT-001 | Practice tests: pick term / pick definition / typed, weak-first, missed retake, optional Haiku application questions (Phase 2) |
| SG-001 | Study guide per exam scope: focus list, terms, outline, formulas, notes; print + Markdown copy (Phase 2) |
| EST-002 | Exam time estimate (per-exam scope, own pace), Exam Prep strip on Today (Phase 2) |
| TODAY-001 | Priority engine (`src/features/today/priority.js`), per-course target grade, quiz kind, vitest (Phase 1.1) |
| TODAY-002 | Ranked Today: top 5 with reason + action, empty states, persisted target in calculator (Phase 1.2) |
| TODAY-003 | Needed score on next major item and final, NEED badge, pressure-based risk (Phase 1.3) |
| UI-005 | UI overhaul: rail shell, Pure home, Plan layout, course workspace, Nova session (shield meter, results, rounds), Decks screen, Grades hub, Calendar week/month, Settings tabs incl. Backup, First-run setup, Nova/Zombies flavor packs (Phases 2.22–2.28) |

## Phase 1 — Mirror + Today (carried)

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| CAL-002 | Upcoming-assignments widget in course context panel | 4 | 1 | 0.5 d | `local-first` |
| CAL-003 | Syllabus date extraction into calendar | 4 | 2 | 2 d | `local-first` `AI-optional` |

## Phase 2 — Exam prep

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| EXAM-001 | Exam-aware SM-2 cap, final-48h coverage, exam ready % | 5 | 3 | 2 d | `local-first` |
| EXAM-002 | `exam_modules` join table, syllabus parse, module picker fallback | 4 | 2 | 1.5 d | `local-first` |
| EXAM-003 | Nova runs the exam session: template opening line (Haiku may rephrase), 10–20 cards, end summary | 5 | 3 | 3 d | `local-first` `AI-optional` |
| FR-001 | Formula practice generators (EOQ, SPC, …) | 5 | 4 | 3–6 wk | `local-first` |

## Phase 3 — Alpha

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| REL-003 | First-run onboarding (connect BB → first sync → Today). Setup screen shipped in UI-005; verify the desktop path and onboarded persistence | 5 | 2 | 2 d | `UI` |
| REL-002 | DB backup / export / restore. Daily ×7 backups + Settings → Backup tab shipped in UI-005; verify the desktop buttons | 5 | 2 | 1 d | `local-first` |
| REL-001 | Auto-update via GitHub Releases | 4 | 2 | 1 d | `Electron` |
| REL-004 | Windows code signing | 3 | 2 | TBD | `Electron` |

## Later — gated on alpha usage

| ID | Feature | Impact | Diff | Est. | Tags |
|----|---------|--------|------|------|------|
| WEB-001 | Find study materials panel; Claude web search in main process; save link / import as cards | 4 | 3 | 1 wk | `AI-optional` |
| COM-001 | Supabase project, `.edu` auth, RLS, canonical course catalog | 5 | 4 | 1 wk | `cloud` |
| COM-002 | Publish / browse / clone decks and study guides with provenance | 5 | 3 | 1 wk | `cloud` |
| COM-003 | Voting, reporting, moderation queue, content filters | 4 | 3 | 1 wk | `cloud` |
| GRD-INS-001 | Anonymous grade distributions per course/instructor/term (≥5 reports) | 5 | 3 | 1 wk | `cloud` |
| PROF-001 | Professor mini-reviews: structured ratings + ≤280 chars, 1 per student per course-term | 4 | 3 | 1 wk | `cloud` |

## Tech debt — efficiency sweep (deferred, Sep 2026)

Found in the Ponytail efficiency sweep. Phase 2.10 fixed Tiers 1–2 (SQL statement cache +
indexes + change-guarded upserts, note-only saves, stable course normalization, shared notes
editor hook, dead IPC removal, Blackboard page scripts moved to `electron/bbInject/`, main.cjs
dedupe, Nova polling paused while hidden) except Nova asset compression, now TD-12. DB upsert
behavior is covered by `npm run check:db`. Line refs are approximate. Est. cut = lines removable.

| ID | Issue | Fix | Est. cut | Risk / tradeoff |
|----|-------|-----|----------|-----------------|
| TD-02 | Local `YYYY-MM-DD` key ×5 (`sm2.localDateString`, `blocked.dayKey`, `CalendarView.dayKey`, `priority.localDayKey`, inline in `todayView`); `startOfLocalDay`/`startOfDay`, `dayIndex`/`dayNumber`, `dueLabel`/`dueText`, `formatDuration`/`formatMinutes` pairs | One date module in `features/dashboard/dateLabels.js` (or `lib/dates.js`), shared `Intl.DateTimeFormat` instances | ~30 | Low; covered by sm2/priority/todayView tests. Keep `electron/examCards.localDateString` parity with `sm2.js` |
| TD-03 | Duplicate fetches: `useCourseExams` runs in both `UserCourseApp` and `FlashcardDeck`, plus `useMirrorBadges` → 3× `assignments.getByCourse` per course open/sync. `hasGrades` state mirrors DB. ~40 raw `window.studyHub.db` calls bypass `courseStore` (rule violation) | Pass `examFor` down as a prop; one `useCourseMirror(uuid)` hook; `courseStore.grades.*` wrappers | ~20 + 4–6 fewer IPC calls | `FlashcardDeck` is also used by OM 300 with null course → no-op default |
| TD-05 | `FlashcardDeckContext` pushes draft `newFront/newBack` from deck to `BuiltinCourseApp` panel → 2 full renders per keystroke | Keep draft state in the panel form; deck exposes commands only | ~20 | Low |
| TD-06 | Hotkey guard shared via `lib/hotkeys.js` (done, Phase 2.18). Left: `BuiltinCourseApp` has 4 identical localStorage effects and an `execCommand` clipboard fallback | `usePersistedState`; drop the fallback (Electron has `navigator.clipboard`) | ~25 | Low |
| TD-07 | Inline styles fighting CSS: `DefinitionCard` tier borders vs `.sh-tier-*`, `GradeScaleDisplay` vs `.sh-grade-scale-row--current`, 8× `gradeColor` inline, runtime `<style>@media print` in two apps | Tone classes + print rules in `studyhub-bootstrap.css` | ~40 | Visual regressions; untangle `!important` |
| TD-08 | `GradesTab` loads the whole Today snapshot for `HoldTarget` and reloads all 5 queries after every structural edit; sub-entry average computed twice | Refetch only components + grade items; derive HoldTarget inputs | ~3 fewer IPC calls per edit | `neededScores` needs assignment shares |
| TD-09 | `FlashcardDeck` copies `externalCards` into state → 3 renders per rating; `completedCount` O(n²) | `useMemo` for user decks; Set lookup | ~8 | Depends on stable `externalCards` (fixed in 2.10) |
| TD-12 | `nova.vrm` 15.5 MB + `clips.json` 1.1 MB base64 loaded up front | meshopt-compress VRM (gltf-transform), ship clips as binary | ~12 MB payload | Needs asset pipeline + visual check |

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
