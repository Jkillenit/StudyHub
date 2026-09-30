# Study Hub — Product Brief for the Project Manager

Handoff document for the agent guiding development from here. It summarizes what exists,
where the project stands, what is left, and how work is expected to be run.
Deeper references: [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) (vision, architecture, guardrails),
[`ROADMAP.md`](./ROADMAP.md) (phases), [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md) (rated IDs),
[`companion-spec.md`](./companion-spec.md) (Nova), and the workspace rules in `.cursorrules`.

*Status as of 2026-09-29. Branch `main`, head `9b046d5`, 18 commits ahead of `origin/main` (not pushed).*

---

## 1. The product in one paragraph

Study Hub is a Windows desktop app (Electron + React) that becomes the place a college
student goes every day instead of Blackboard. It mirrors the student's own Blackboard
courses (content, announcements, assignments, due dates, grades) into a local SQLite
database and wraps them in study tools: notes, glossary, flashcards with SM-2 spaced
repetition, practice tests, a study-guide generator, exam-time estimates and a grade
calculator. Nova, a 3D hologram companion, lives on top of the app to tour, help, quiz,
and motivate. A later opt-in cloud layer ("Commons") will add shared student-made study
materials, anonymous past grade distributions and short professor reviews. First target
school: The University of Alabama.

**It is not** a Blackboard replacement for submissions, official quizzes or official grades.
Those stay in Blackboard; Study Hub reads them and deep-links back.

## 2. Non-negotiables the PM must enforce

| Area | Rule |
|------|------|
| Architecture | Local-first. Personal data only in local SQLite; works offline, no account, no API key. Commons is opt-in and receives only what a student explicitly publishes. |
| Data safety | Writes are upserts keyed by `uuid`, never delete-and-reinsert (it destroyed mastery and grades before Phase 0). Multi-table writes in transactions. Schema changes only via numbered migrations in `electron/database.cjs`. |
| Process boundary | Renderer never touches Node; everything via `window.studyHub` (preload). Renderer DB access only through `src/db/courseStore.js`. |
| Security | Anthropic key only in main process, encrypted with `safeStorage`. File IPC only for allowlisted paths (native dialogs, imports, BB temp dir). Blackboard bridge only on `*.blackboard.com`. Escape any text injected into Blackboard pages. |
| Blackboard | Read-only, the logged-in student's own data, human pace, no stored credentials. |
| AI | Claude Haiku `claude-haiku-4-5-20251001` only. Local pipeline first; AI enhances, never replaces; graceful fallback on no key, API failure or bad JSON. |
| Integrity (Commons) | Student-authored content only; block professor files, exams, quizzes, answer keys; everything reportable. Grade distributions anonymous, shown only at ≥5 reports. Professor reviews: structured ratings + ≤280 chars, one per student per course-term. |
| UI | Only CSS file is `src/studyhub-bootstrap.css`; `--sh-*` tokens only, no hardcoded colors. Tab active state is a 2px green bottom border. |
| Protected | Do not modify OM 300 built-in content (`src/study/sections`, `src/glossary/courseData.js`). Keep officeparser/pdf-parse out of the renderer bundle. |
| Definition of done (every change) | `npm run build` passes; officeparser absent from `dist`; no `console.log`/`console.error` in `src`; OM 300 still works. |
| Commits | `Phase X.Y — Short description` plus bullet body. |

## 3. How the owner wants work run

- **Phase by phase, in testable jumps.** Finish a slice, build, verify, commit, then stop and
  report before starting the next one. Do not batch several phases silently.
- **Show, don't claim.** UI and animation work is verified visually (screenshots or lab
  captures) and shown to the owner. Say plainly what was not tested live.
- **Ask when a real product decision is open** (multiple-choice questions work well); decide
  implementation details yourself.
- The owner cares most about Nova right now: "the most important part of the build so far."

## 4. What is built

### Core app (Phases 0–2, done)

| Area | What works |
|------|-----------|
| Phase 0: data layer | uuid upserts, migrations, transactions, WAL/FK; security hardening; god-components split into `src/features/`; error boundary. |
| Phase 1: Blackboard mirror | Embedded BB window; REST sweep as the logged-in student (content tree, announcements, assignments with due dates, own grades); courses auto-created; current-term filter; syllabus capture; grades feed the syllabus-weighted calculator. |
| Dashboard + calendar | Today view (due soon, announcements, cards due, grade changes); month/week calendar across courses. |
| Phase 2: study suite | SM-2 drill modes (due/weak/module), deck editor, session history and streaks, practice tests (MC + typed, optional Haiku variants), study-guide generator per exam scope, exam time estimate, course progress view. |
| Imports | PPTX/DOCX/XLSX/PDF parsing in main; local classifier to modules/definitions/cards; optional Haiku enhancement flagged `enhancedByAI`. |
| Built-in course | OM 300 with its own deck and glossary (protected content). |

### Nova, the companion (C.1–C.6c done)

- **Framework:** state machine (idle/wander/perch/sleep/menu/greet/nudge/tour/help/quiz/hidden),
  radial menu, spotlight tours, local FAQ help, flashcard quiz with 4 modes and SM-2 grading,
  XP/levels app-wide, due-card nudges, rampancy after neglect, synthesized SFX, color tints,
  typewriter comm-panel bubbles.
- **Voice:** sarcastic, loyal, flirty when you do well, harsh when you fail; PG-13 to R
  (profanity and innuendo, never explicit, never identity insults). Lines in `src/companion/character.js`, ≤140 chars.
- **3D body (C.5):** VRoid `.vrm` model rendered with three.js + three-vrm in a lazy chunk
  (~1.9 MB JS plus the 16 MB model), custom hologram shader, 13 Mixamo clips baked to
  `clips.json` by `scripts/bake-nova-clips.mjs`, procedural layers (arms behind back, head/eye
  look, expressions, lip flap). She walks on "platforms": the window bottom and top edges of
  `[data-perch]` cards, rides them while scrolling, falls when they disappear. Portrait
  sprites remain as the fallback if WebGL fails.
- **C.6a idle director:** yawn, look around, bored, stretch every 20–45 s (scaled by movement
  setting); time-of-day aware (late-night yawns and lines, morning hellos, earlier sleep at night).
- **C.6b:** real grab: she dangles from the cursor, swings on a spring, kicks, and drops onto
  whatever is below; the drop spot becomes home. Edge sitting on cards: playful (legs
  swinging) or cold (cross-legged, turned away) depending on recent performance/rampancy;
  sleeps seated.
- **C.6c event gestures:** kiss (level-ups, great finishes, 5-streaks), wink (3-streaks),
  facepalm (failing), pointing at the real tour/help target, taunt when a nudge is ignored,
  wave after 10+ min away.

## 5. What is left

### Nova (finish before moving on, per current plan)

| ID | Scope | Notes |
|----|-------|-------|
| C.6d | Rampant: glitch collapse and re-form, jittery idles | Next up. |
| C.7 | Context staging: stand on top of the quiz panel, stand on tour targets, speech bubble follows her head, lean on panel sides | Bubble anchoring currently uses the element box, so it floats high when she sits. |
| C.8 | Settings and robustness: 3D/portrait toggle in settings, animation intensity, WebGL context-loss recovery, **packaged-build check** (model + clips load from the asar) | Owner wants the model kept at full quality (no texture downscaling). |
| C.9 | Claude brain when a key is set: Haiku help with `point_to`, fuzzy typed-answer grading, generated distractors, rate limit + canned fallback | Must degrade to today's local behavior. |
| C.10 | Assessment-mode auto-hide, more tours (Blackboard sync, calendar), polish | Auto-hide matters for integrity: Nova must not appear during real assessments. |

### Product phases

| Phase | Scope | Backlog IDs |
|-------|-------|-------------|
| Carried | Upcoming-assignments widget; syllabus date extraction into calendar; formula practice generators (large) | CAL-002, CAL-003, FR-001 |
| 3 | Web study-guide finder: search from course code + key terms (Claude web-search in main, no-key fallback to a search link); save as link + summary or import as cards (never re-host) | WEB-001 |
| 4 | Commons: Supabase, `.edu` auth, RLS, canonical course catalog, publish/browse/clone/vote, reports + moderation, offline publish queue. **Nothing scaffolded yet** (`supabase/` and `src/commons/` do not exist). | COM-001..003 |
| 5 | Anonymous grade distributions, ≥5 reports per bucket | GRD-INS-001 |
| 6 | Professor mini-reviews | PROF-001 |
| 7 | Auto-update, DB backup/export/restore, onboarding (connect BB → optional Commons), Windows code signing, alpha to a small UA cohort | REL-001..004 |

Dependencies: 3 needs only 0–2. 5 and 6 need 4. 7 needs everything it ships.

## 6. Risks and open issues the PM should track

1. **Unpushed work.** 18 commits exist only on this machine. Push to `origin` (GitHub `Jkillenit/StudyHub`) soon.
2. **No test harness in the repo.** Checks so far: `npm run build`, a companion unit script kept
   outside the repo (`%TEMP%\lightrun-test.mjs`), and manual browser/lab verification. There is
   no ESLint config (ESLint 10 wants `eslint.config.*`). Recommend adding a small Vitest suite
   (machine, safeZones, idleDirector, SM-2, grade math) and a lint config before Commons.
3. **Packaged-build risk for Nova.** The 16 MB `.vrm` and `clips.json` load via Vite asset URLs;
   they have only been verified in dev/preview, not in a packaged Electron build (C.8).
4. **Asset licensing.** Confirm the VRoid model's license terms allow redistribution in the app,
   and keep Mixamo usage within Adobe's terms (animations embedded in a product are generally
   fine; raw FBX redistribution is not). The source FBX files live in `art/nova/anims/`.
5. **Tone vs. audience.** Nova's R-leaning voice is an owner decision. Before any school-facing
   alpha, consider a "clean voice" setting and confirm it fits the distribution channel.
6. **Blackboard fragility.** The mirror depends on UA's Blackboard REST behavior as a logged-in
   user; UI or API changes can break sync. Keep it read-only and human-paced (ToS).
7. **Commons is the biggest unknown:** moderation staffing, `.edu` verification, legal review of
   grade data (FERPA posture, ≥5 threshold) and professor reviews (defamation filters).
   Open questions are listed in `PROJECT_BRIEF.md` §8.
8. **Performance.** Nova renders at ~30 fps while visible and pauses when hidden; watch CPU/GPU on
   low-end laptops (C.8 animation-intensity setting is the release valve).

## 7. Suggested next sequence

1. Push `main`; add the test/lint baseline (small, one slice).
2. Finish Nova: C.6d → C.7 → C.8 (C.8 includes the packaged-build check, which de-risks release).
3. Close the carried quick wins: CAL-002, CAL-003.
4. Phase 3 (web study guides): self-contained, no cloud dependency.
5. Decide Commons open questions with the owner, then Phase 4 → 5 → 6.
6. C.9 and C.10 can slot in whenever an API key workflow is prioritized; C.10's assessment
   auto-hide should land before any alpha.
7. Phase 7 alpha.

## 8. Key locations

| Path | What |
|------|------|
| `electron/` | Main process: DB, IPC, Blackboard window and sync, AI client, key storage |
| `src/app/StudyHubApp.jsx` | Root app and routing |
| `src/features/`, `src/hub/`, `src/study/` | Feature modules, course view, study tools |
| `src/db/courseStore.js` | Renderer's only data access |
| `src/companion/` | Nova: `CompanionLayer.jsx` (behavior), `machine.js`, `safeZones.js` (platforms), `useCompanionMotion.js`, `idleDirector.js`, `character.js` (lines), `companionStore.js` (XP/rampancy) |
| `src/companion/nova3d/` | `NovaStage.js` (renderer, shader, procedural poses), `Nova3D.jsx`, `nova.vrm`, `clips.json` |
| `scripts/bake-nova-clips.mjs`, `art/nova/anims/` | Clip bake pipeline and source FBX |
| `.cursor/agents/studyhub-advisor.md` | Product/architecture advisor subagent |
