# UI Overhaul 5 — Screen Shells Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development. Task 1 runs first; Tasks 2–7 run in parallel (disjoint files); Task 8 last.

**Goal:** Every rail destination has a real screen in the Plan layout: Decks, Grades hub, Calendar (week + month), Settings with tabs (incl. Backup), and a full-window First-run setup. Completing a Today item adds a round mark.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` §2.1, §2.3, §4 (Decks, Grades hub, Calendar, First-run setup, Settings, Backup), §6 (Rounds). Shells may show real data where it exists; anything without a backing feature is inert (labelled, disabled), never fake.

**Decisions made with the user:**
1. **First-run replaces the bubble flow.** New users (companion not `onboarded`) get the setup screen; it reuses the existing name memory, Blackboard connect and `first-run` tour. Nova's bubble greet must not also run.
2. **Review all due = most urgent course.** Each Decks course row has its own Review button; the header "Review all due" opens the course with the most due cards (ties: soonest exam). No cross-course session.
3. **Backups stay daily × 7** in the app data folder (`electron/maintenance.cjs`). The Backup tab shows status, Back up now, Open folder, Restore. Spec §4 is updated to say so.

**Decisions made by the planner:**
4. Settings becomes a hub view (`hubView === "settings"`), replacing the `SettingsPanel` popover. Rail "Settings" opens tab General; "Make it yours" opens tab Make it yours. Make it yours is an inert shell (pack picker cards, disabled, "Coming with the Zombies pack") until rollout step 6.
5. Calendar has no Nova study blocks yet (no data source); the legend omits them.
6. A Today mark is recorded when an assignment goes from not completed to completed through `courseStore.setAssignmentCompleted`. `ponytail:` unchecking and re-checking adds another mark; track marked uuids if anyone farms it.
7. Grades trend sparkline is derived from graded items (`graded_at` order, running current grade). Fewer than 2 graded items → no sparkline.

## Global Constraints

- Follow `.cursorrules`. Tokens only (`--sh-*`, `color-mix()` over tokens). Radius 0. Aqua `--sh-accent` is the only interactive accent; magenta `--sh-accent-2` only for exam markers (calendar exam edge, exam countdown chip) and the mastery gradient end. At-risk = `--sh-warn`.
- Michroma (`--sh-font-display`) weight 400, uppercase, `letter-spacing: .06em`, only for screen titles and setup headlines. Numbers, dates, codes, labels in `--sh-font-mono` (11px min).
- Motion via `html[data-motion="reduced"]`; never `@media (prefers-reduced-motion)`.
- Tabs: active = `border-bottom: 2px solid var(--sh-accent)` only.
- Renderer data access through `src/db/courseStore.js` (add thin wrappers there if needed) or existing `window.studyHub` bridges already used by the feature; no raw new IPC from components. Every screen must render in the browser build where `window.studyHub` is undefined (empty states, OM 300 data from localStorage).
- No schema change. No `console.*`. Don't edit OM 300 content.
- **CSS:** `src/studyhub-bootstrap.css` is the only CSS file. Task 1 adds one anchor comment per screen at the end of the file; each task writes its CSS only directly below its own anchor.
- **Parallel rules (Tasks 2–7):** edit only the files listed in your task plus your CSS section. Do NOT commit (the coordinator commits). Run `npm run test` and `npx vite build --outDir .superpowers/build-task5-N` (N = task number; never the default `dist`, other tasks build concurrently). Playwright checks: dev server on port `5180 + N` (`--server "npx vite --port 518N --strictPort" --port 518N`), GPU flags as in Plan 4 (`from tour import GPU_ARGS`), scripts under `.superpowers/ui-review/task5-N/`.
- Final report: files changed, screenshot paths with a one-line verdict, anything not verified.

---

### Task 1: Routing, rail and placeholders (runs alone, commits)

**Files:** `src/app/StudyHubApp.jsx`, `src/hub/HubScreen.jsx`, `src/shell/AppRail.jsx`, `src/shell/CommandPalette.jsx` (only if it opens settings), `src/studyhub-bootstrap.css`; create placeholders `src/features/decks/DecksScreen.jsx`, `src/features/grades/GradesScreen.jsx`, `src/features/settings/SettingsScreen.jsx`, `src/features/setup/SetupScreen.jsx`.

- `hubView` accepts `decks`, `grades`, `settings`. `goHub(view, opts)`; `opts.tab` sets a `settingsTab` state passed to `SettingsScreen` as `tab` (+ `onTab`). HubScreen renders the three in `.sh-plan` (default width) with dock prompts: Decks "Ask Nova what to review…", Grades "Ask Nova what you need on the next exam…", Settings "Ask Nova anything…".
- Rail: Decks and Grades enabled, active states like Today/Calendar; Settings → `goHub("settings", { tab: "general" })`; Make it yours → `goHub("settings", { tab: "theme" })`. `studyhub-open-settings` event and any palette "settings" command route the same way. Remove the `SettingsPanel` render and `settingsOpen` state from StudyHubApp (leave `SettingsPanel.jsx` file for Task 5 to delete after moving its contents).
- Setup gate: `setup` state initialised from the companion store's `onboarded` flag (find it in `src/companion/companionStore.js`; first run = not onboarded). While `setup` is true render `<SetupScreen onDone={() => setSetup(false)} />` full-window inside the frame **without** the rail, title bar breadcrumb empty, and pass `place="setup"` to CompanionLayer (`novaPlace = setup ? "setup" : …`). Task 7 implements what Nova does in `setup`; until then CompanionLayer must not crash on it (treat like `tuck` if it has a switch). A dev escape: `window.dispatchEvent(new Event("studyhub-open-setup"))` sets `setup` true (Task 8's tour uses it).
- Placeholders export the component with the props below and render a titled empty `.sh-panel`:
  - `DecksScreen({ userCourses, onOpenCourse })` — `onOpenCourse(id, { tab: "drill" })` must open that course on its flashcard deck (find how StandingGauges/runTodayAction open a course tab and reuse it).
  - `GradesScreen({ userCourses, onOpenCourse })` — `onOpenCourse(id, { tab: "grades" })`.
  - `SettingsScreen({ tab, onTab })`, tabs: `general`, `nova`, `theme`, `blackboard`, `backup`, `ai`.
  - `SetupScreen({ onDone })`.
- CSS: append anchors `/* ── Decks screen ── */`, `/* ── Grades screen ── */`, `/* ── Calendar week ── */`, `/* ── Settings screen ── */`, `/* ── Setup screen ── */` at end of file.
- Verify: test + build; quick Playwright click through rail Decks/Grades/Settings/Make it yours. Commit `Phase 2.26 — Screen routes and rail`.

### Task 2: Decks screen

**Files:** `src/features/decks/DecksScreen.jsx`, create `src/features/decks/decksView.js` + `decksView.test.js`, Decks CSS section.

- Pure `buildDecksView({ courses, dueByCourse, exams, avgSecondsPerCard, today })` → `{ totalDue, minutes, urgentCourseId, groups: [{ courseId, name, examLabel|null, rows: [{ name, due, total, mastery (0–1), examDays|null }] }] }`. Groups sorted by soonest exam then most due. Minutes = due × avgSecondsPerCard (default 30s) rounded up. Tests cover sorting, ties, no exams, zero due.
- Data: user courses from `userCourses` (flashcards + SM-2 fields, `isCardDue`, `deckBreakdown`/`isMastered` for mastery), OM 300 from `loadFlashcardDeck()`; exams from `loadUpcomingExams` (`src/features/study/examEstimate.js`); avg seconds from `db.dashboard.get()` when available. One deck row per course for now (decks = course decks).
- UI: header "N cards due · ~M min" (mono numbers) + primary "Review all due" (→ `urgentCourseId`, disabled when 0 due); group header course name + exam countdown chip (magenta, "EXAM IN 5 D"); rows: name, due count, mastery bar (aqua→magenta), Review button. Empty state when no cards.

### Task 3: Grades hub

**Files:** `src/features/grades/GradesScreen.jsx`, create `src/features/grades/gradesView.js` + `gradesView.test.js`, Grades CSS section.

- Pure `buildGradesView(courses)` → rows `{ courseId, name, current|null, letter|null, atRisk, trend: number[], nextStep: string|null }` reusing `neededScores`/`courseStanding` (`src/features/today/priority.js`) and `letterFor`/`courseState` (`todayView.js`). `nextStep` e.g. "Need 84 on the midterm to reach B" from `neededScores().next`; "On track for B" when nothing needed; null when no target. Trend = running current grade after each graded item ordered by `graded_at`/due date. Numbers only from code. Tests: at risk, on track, no grades, trend ordering.
- Data: `courseStore.loadTodayData()` (courses with components/assignments); browser build → empty state.
- UI: one row per course: name, current grade mono (amber when `atRisk`) + letter, inline SVG sparkline (stroke `--sh-accent`, no fill, ≥2 points), next step text, "What if…" button → `onOpenCourse(id, { tab: "grades" })`.

### Task 4: Calendar week view

**Files:** `src/features/dashboard/CalendarView.jsx`, create `src/features/dashboard/calendarWeek.js` + `calendarWeek.test.js` if logic is non-trivial, Calendar CSS section (restyle existing `.sh-cal-*` rules in place where needed).

- Week/Month toggle (tabs style), default Week; selection persists in localStorage UI pref. Week grid: 7 columns Mon–Sun, prev/next week, each day lists its items; today column aqua top edge; due items aqua left edge, exams magenta left edge, completed dimmed (`--sh-text-3`, strikethrough). Month keeps the current grid restyled with the same edge colors. The selected-day detail + completion checkbox + "+ ADD" stay.
- Completion goes through `courseStore.setAssignmentCompleted(uuid, done)` (Task 6 adds the round mark there) instead of raw `db.assignments.setCompleted`; add the wrapper call only — do not edit courseStore (Task 6 owns it; the function already exists).
- No Nova study blocks (decision 5).

### Task 5: Settings tabs + Backup

**Files:** `src/features/settings/SettingsScreen.jsx` (+ small tab components in `src/features/settings/` if it gets long), delete `src/shell/SettingsPanel.jsx` after moving its contents, `electron/maintenance.cjs`, `electron/preload.cjs`, Settings CSS section (remove dead `.sh-settings` popover rules).

- Tabs General · Nova · Make it yours · Blackboard · Backup · AI key (`tab`/`onTab` props).
  - General: Reduce motion (`setMotionPref`), app version from `app.info()`.
  - Nova: Quiet mode, What Nova knows (`NovaMemoryView`), Nova settings (existing event) — same behavior as the old panel.
  - Make it yours: two pack cards (Nova active, Zombies disabled "Coming soon"), inert.
  - Blackboard: status + Open/Connect + Disconnect using the same bridges as `CoursesView` in `HubScreen.jsx` (don't edit HubScreen).
  - Backup: status line "Last backup Oct 3, 9:14 · 7 kept · daily", Back up now, Open folder, Restore (existing `app.backup.restore`). Add main handlers `app:backup:status` → `{ last: ISO|null, count, dir }` (read `userData/backups`), `app:backup:now` → runs the daily backup immediately (same naming, same keep-7 prune; same-day file is overwritten), `app:backup:openFolder` → `shell.openPath(dir)`; expose in preload under `app.backup`. Keep `app:backup:create` (save-as) as a secondary "Save a copy…" link. Browser build: tab shows "Backups run in the desktop app" with buttons disabled.
  - AI key: status + Set key (existing `studyhub-open-ai`).

### Task 6: Today items add round marks

**Files:** `src/db/courseStore.js`, `src/features/mirror/AssignmentsView.jsx`, `src/session/rounds.js` (+ test if changed).

- In `courseStore.setAssignmentCompleted(uuid, done)`: when `done` is true and the write succeeds, call `recordMark()` (dispatches `studyhub-rounds-changed`). Avoid circular imports; failures in `recordMark` never break the completion.
- `AssignmentsView` completion goes through `courseStore.setAssignmentCompleted` instead of raw IPC. Today's `OverdueStrip` already uses it.
- Test: a unit test with a mocked bridge proving one mark on complete, none on uncomplete, none when the write fails.

### Task 7: First-run setup screen

**Files:** `src/features/setup/SetupScreen.jsx` (+ step components in `src/features/setup/`), `src/companion/CompanionLayer.jsx`, `src/companion/hooks/useNovaMemoryVoice.jsx`, `src/companion/companionStore.js` (only if a setter is missing), `src/features/setup/` CSS section.

- Full window, no rail, Plan-style centered column (~560px). Step strip `01 NAME · 02 BLACKBOARD · 03 MAKE IT YOURS · 04 TOUR` (mono, active step aqua bottom border). Michroma headline per step. Privacy points on step 02: read only, stays on this computer, no account.
  - 01 Name: input → existing name memory (`remember("name")` path the bubble flow uses). Required to continue.
  - 02 Blackboard: Connect (same bridge as CoursesView) or Skip. Browser build: Skip only.
  - 03 Make it yours: Nova pack selected, Zombies disabled "Coming soon".
  - 04 Tour: Take the tour (`startTour("first-run")` via the existing event/API) or Skip. Either marks the companion `onboarded` and calls `onDone()`; the tour starts after the screen closes.
- Nova center stage: when `place === "setup"`, CompanionLayer shows Nova large beside the column (reuse session-lane sizing/placement code paths rather than new 3D logic) and suppresses the bubble greet / `appear(!onboarded)` onboarding chat. After `onDone`, normal home behavior; no second greeting.
- Existing users (`onboarded` true) never see it.

### Task 8: Palette, tours, spec sync, verification (after 2–7 are committed)

- Command palette entries: Go to Decks, Go to Grades, Open Settings, Back up now (desktop only).
- Tour steps in `.superpowers/ui-review/tour.py`: `screen-decks`, `screen-grades`, `screen-calendar-week`, `screen-calendar-month`, `screen-settings-<tab>` (all six), `screen-setup-01..04` (via `studyhub-open-setup`), `today-mark` (complete an item → tally increments). Full tour + Nova smoke pass.
- Grep tours/FAQ for `SettingsPanel`/`.sh-settings`/"coming soon" Decks/Grades targets and update.
- Spec §4 Backup row → daily × 7, Open folder; §4 Calendar → study blocks deferred; §6 → Today completions add marks; §4 First-run → replaces the bubble onboarding.
- Commit `Phase 2.26 — Screen tours and verification`.
