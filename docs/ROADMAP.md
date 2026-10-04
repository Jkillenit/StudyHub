# Study Hub — Roadmap

**Connect Blackboard once. Every day Study Hub tells you what matters and gets you ready for it.**
The Blackboard mirror is the engine; Today is the product.

- Vision, architecture, data model, guardrails: [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)
- Rated feature IDs: [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md)
- **Build order** (interleaved product + Nova + tech debt, 2026-10):
  [`superpowers/specs/2026-10-01-build-path-design.md`](./superpowers/specs/2026-10-01-build-path-design.md).
  A: command bar → CompanionLayer split → grade/data sweep. B: 2.3 + C.7 → exam practice tests →
  C.6d + desk → CAL-003. C: packaged-build batch (C.8, TD-12, REL-001/004) → backup → onboarding +
  C.10. D: alpha, with enhanced mode (C.9 merged into Nova Core 8) and FR-001 alongside.

---

## Principles

- **Local-first**: personal data stays in local SQLite; works offline and without an account.
- **Today decides, the student acts**: every ranked item carries a one-line reason and one action.
- **AI enhances, never replaces**: every feature works without an API key. Haiku may rephrase,
  never compute numbers.
- **Integrity by design**: Blackboard access is read-only for the student's own data. Commons
  guardrails in the brief still apply when it ships.
- **Stable data before features**: no phase ships on top of a data layer that loses work.

---

## Shipped

### Phase 0 — Stabilize and redesign the data layer ✓

| Work | Detail |
|------|--------|
| Granular upserts | Flashcards, content, grade components, modules upsert by `uuid`; no more delete-and-reinsert (it cascaded and wiped SM-2 mastery and grade entries). |
| Migrations | Numbered migrations on `schema_version`; courses gain `bb_course_id`, `subtitle`, `term`, `course_code`, `instructor`, `meta_json`. |
| Bug fixes | NOTES tab lazy-import crash, notes saved as HTML, editor no longer rebuilds per save, arrow keys ignored in contentEditable, BB PPTX temp path, BB import merges instead of replacing, BB course lookup by id, OM 300 KNOW IT/AGAIN, what-if render loop. |
| Security | API key main-process only via `safeStorage`; Haiku enhancement over IPC; BB bridge only on `*.blackboard.com`; material paths only from native dialogs. |
| Structure | Import/course logic split out of `StudyHubApp`/`UserCourseApp` into `src/features/`; app-level error boundary; debug logging removed. |

### Mirror v1 ✓ *(CAL-002/003 carried)*

- Course sweep from the embedded window: content tree, announcements, assignments with due
  dates, the student's own gradebook — via Blackboard REST as the logged-in user.
- Local tables `announcements`, `assignments`, `bb_items`; incremental sync.
- Today dashboard v1: due soon, new announcements, cards due, grade changes.
- Calendar: month/week of assignments across courses (BB + syllabus + manual).
- Blackboard grades flow into the grade calculator.

### Study suite v1 ✓ *(FR-001 formula generators carried)*

- SM-2 filtered drill modes (due, weak, module), deck editor, session history + streak.
- Practice tests generated locally from definitions/glossary, optional Haiku variants.
- Study guide generator per exam scope (modules + weak cards).
- Exam time estimate from mastery data and calendar exam dates.

### UI overhaul ✓ *(Phases 2.22–2.28, spec: [`2026-10-01-ui-overhaul-design.md`](./superpowers/specs/2026-10-01-ui-overhaul-design.md))*

One hard-edged HUD design on true black (aqua accent, magenta secondary, Michroma / Geist /
Geist Mono, radius 0, drifting-line ambient background), shipped in rollout steps 1–7:

| Step | Detail |
|------|--------|
| 1 Foundation | Token values, bundled fonts, hard edges, ambient canvas. |
| 2 Shell | 56px icon rail (hover overlay, pin / Ctrl B), Pure home (NOVA wordmark, greeting, top 3 cards), Plan layout for every other screen, docked cut-corner message box (Nova command bar), Nova lane with rest / shrunk / tucked states. |
| 3 Course workspace | Course items in the rail; centered column with breadcrumb, tabs, mastery line, `...` menu and slide-over drawer, for user courses and OM 300. |
| 4 Session | Full-window Nova session for quizzes and flashcards: shield meter, rating previews from SM-2, ROUND N COMPLETE results with medals, rounds tally. |
| 5 Screens | Decks, Grades hub, Calendar week + month, Settings tabs (General · Nova · Make it yours · Blackboard · Backup · AI key), Backup tab, full-window First-run setup. |
| 6 Flavor packs | Nova (default) and Zombies: tokens, backdrop with fog and embers, zombie Nova, Zombies voice, power-ups on results and round close, round tally in rail and Home. |
| 7 Docs | `.cursorrules` and docs synced to the new design. |

Known follow-ups:
- Electron-only paths are unverified in the browser tours: Backup buttons, the Blackboard tab,
  Decks / Grades / Calendar with real data, onboarded persistence after First-run setup.
- The desktop overlay Nova ignores flavor packs.
- Rampant Nova has weak contrast in the Zombies pack.
- Zombies embers are not yet held at 60fps.
- The token test only checks `:root`, not `html[data-pack="zombies"]`.
- Printed course pages keep the screen's light text colors on a white page (faint headings).

### A3 grade/data sweep ✓ *(Phase 2.29, TD-01/02/03/07/08)*

- One grade-math module: the Grades tab rescales weights like Today, so "What do I need?",
  what-if, zero-on-X and row contributions agree with the priority engine.
- One local date module (`src/lib/dates.js`) behind every `YYYY-MM-DD` key and day count;
  Electron parity tested.
- Every renderer DB call goes through `courseStore` (except `session/rounds.js`, which
  `courseStore` imports).
- One mirror load per course (badges, exams, `examFor`); Grades tab edits refetch less.
- Grade tones, grade scale, confidence dots and print rules come from CSS classes.

---

## Phase 1 — Mirror + Today ✓

- ✓ **1.1 Priority engine** (TODAY-001): pure module `src/features/today/priority.js`, fed by
  `courseStore`. Item types ASSIGNMENT (due ≤ 14 days or overdue), EXAM_PREP (exam ≤ 14 days),
  GRADE_RISK (current < target). Score = urgency × weight × risk; constants in one config
  object; unit tests (vitest). Per-course `target_grade` (default 80) via migration.
  Quizzes get their own assignment kind so they don't count as exams.
- ✓ **1.2 Ranked Today** (TODAY-002): top 5 items with course, title, date, one-line reason and
  one action (Blackboard deep link / review session / grade calculator). Empty states for
  not synced and nothing due. Today stays the default landing view; existing views remain in
  the sidebar and command palette.
- ✓ **1.3 Needed score** (TODAY-003): grade calculator computes the score needed on the next
  major item and on the final to hold the target; badge on Today; feeds risk.

Shipped notes: exam review action opens the course deck (Nova-run sessions are 2.3). An item's
share of the grade is its component weight split by points, else by item count (with a
per-category minimum); unmatched items use a per-kind default and show no weight or needed score.

**Exit criteria**: a fresh sync lands on a sensible ranked list; changing a target reorders it.

## Phase 2 — Exam prep

- ✓ **2.1 Exam-aware SM-2** (EXAM-001): optional cap in `sm2.js` so cards linked to an upcoming
  exam get intervals ≤ days until exam − 1; every card reviewed at least once in the final
  48 h; normal SM-2 after the exam. Exam ready % = share of the exam's cards with latest
  rating ≥ 3.
  Shipped notes: a card's exam is the nearest upcoming exam whose study-guide scope covers its
  module (empty scope = whole course) until 2.2 adds `exam_modules`. The final window is the two
  calendar days before the exam plus exam day. The capped interval is what gets stored, so growth
  after the exam restarts from it. The drill, DUE filter, study guide and Today exam reason are
  exam-aware; Nova's quiz reviews are not yet (2.3).
- ✓ **2.2 Exam ↔ module linking** (EXAM-002): `exam_modules` join table (existing study-guide
  scopes migrated in); parse from syllabus where possible, module picker fallback.
  Shipped notes: an exam's scope is the student's pick (`exam_modules`, with
  `assignments.scope_source = 'manual'`; no rows = whole course), else syllabus coverage, else the
  whole course. Syllabus rules ("Exam 1: Chapters 1-4", "Final: cumulative") are stored on the course
  and matched to module titles at read time, so later imports are picked up. The study guide's COVERS
  row is the picker; it shows where the scope came from and can reset a pick to the syllabus.
- **2.3 Nova runs the session** (EXAM-003): opening line from a local template built from DB
  facts (Haiku may rephrase); 10–20 exam cards, due first; logged to `study_sessions`; end
  summary with cards done, exam ready % change, suggested next session.
- Practice tests scoped to an exam (reuses PT-001).

**Exit criteria**: exam prep on Today launches a Nova session with exam-scoped cards.

## Phase 3 — Alpha

- First-run onboarding: connect Blackboard → first sync → land on Today (REL-003). The
  First-run setup screen shipped with the UI overhaul; the desktop path is unverified.
- DB backup / export / restore (REL-002). Daily backups (7 kept) and the Settings → Backup tab
  shipped with the UI overhaul; the desktop buttons are unverified.
- Auto-update via GitHub Releases (REL-001); code signing if a certificate is available (REL-004).
- Alpha with 20–30 UA students; measure daily Today opens and sessions started.

## Later — gated on alpha usage

Specs and guardrails in the brief are unchanged; each ships only if alpha usage justifies it.

- **Web study-guide finder**: per course/module search via Claude web-search tool (main
  process), no-key fallback to a prepared search link; save as link or import as cards.
- **Commons**: Supabase, verified `.edu` auth, RLS, canonical course catalog; publish /
  browse / clone / vote on student-authored decks and guides; report + moderation queue.
- **Grade insights**: opt-in anonymous distributions per course/instructor/term, ≥5 reports.
- **Professor mini-reviews**: structured ratings + ≤280 chars, one per student per course-term.

---

## Companion — Nova *(docs: [`companion-spec.md`](./companion-spec.md) → Nova docs, parallel track)*

- ✓ C.1 Sprite, settings, movement/state machine, radial menu, spotlight tours, local FAQ help.
- ✓ C.2 Flashcard quiz (4 modes, SM-2 grading, XP/levels), due-card nudges.
- ✓ C.3 Nova redesign: hologram portraits (runtime light-keyed), teleport moves, sarcastic/loyal
  voice (flirty on streaks, harsh when failing), rampancy after neglect, synthesized sound, tints.
- ✓ C.4 Hologram comm-panel bubbles (typewriter, tone tints), OM 300 built-in deck in the sim,
  app-wide XP table (sim, drill, practice tests, tours, daily bonus) with pops, splash cameo.
- ✓ C.5 3D body: VRoid model (three.js + three-vrm, lazy chunk) with a hologram shader, Mixamo
  clips baked by `scripts/bake-nova-clips.mjs`, arms-behind-back walk, turning, cursor tracking,
  blink/expressions/lip flap, platform walking (window bottom + `[data-perch]` card tops),
  riding scrolled cards, falling with landings, drag-to-teleport, portrait fallback.
- ✓ C.5.1 Voice pass (PG-13 to R: profanity and innuendo, never explicit), no foot ring,
  supersampled rendering at full texture quality.
- ✓ Nova Core 6 command bar; CompanionLayer split into hooks (TD-10/TD-11).
- ○ C.6 Personality. Missing moves (stretch, facepalm, point) are procedural, no new clips.
  - ✓ C.6a Idle director: yawn/look/bored/stretch every ~20-45s scaled by movement setting,
    cursor glances, face the user on click; time-of-day aware (late-night yawns and teasing).
  - ✓ C.6b Edge sitting (playful leg swing when doing well, crossed and cold when failing),
    sleeping seated on her platform, and a real grab: she dangles from the cursor, swings,
    kicks, and drops onto whatever is below when released.
  - ✓ C.6c Event gestures: kiss/wink on streaks and level-ups, facepalm when failing, pointing
    at tour/help targets, taunt when ignored, wave on return. Leaning on panel sides moves to C.7.
  - C.6d Rampant: glitch collapse and re-form, jittery idles.
- ○ C.7 Context staging: on top of the quiz panel, standing on tour targets, bubble follows her head,
  leaning on panel sides.
- ○ C.8 Settings and robustness: 3D / portrait switch, animation intensity, context-loss
  recovery, packaged-build check. Model stays full quality (no texture downscaling).
- ○ C.9 (merged into Nova Core 8 enhanced mode) Claude brain once an API key is set: Haiku help with `point_to`, fuzzy typed grading,
  generated distractors, rate limit + canned fallback.
- ○ C.10 Assessment-mode auto-hide, more tours (blackboard-sync, calendar), polish.

---

## Dependency graph

```
Shipped ─▶ Phase 1 (Today) ─▶ Phase 2 (Exam prep) ─▶ Phase 3 (Alpha) ─▶ Later (gated)
                                   ▲
Nova C.x ──────────────────────────┘  (session runner in 2.3)
```

---

## Parked

- OCR for scanned PDFs (D1)
- Blackboard institutional REST / LTI (D2)
- Ink / stylus sketches per chapter
- Cross-device sync of personal data (only after Commons is proven)

*Last updated: 2026-10 — UI overhaul shipped; build path to completion; Commons deferred.*
