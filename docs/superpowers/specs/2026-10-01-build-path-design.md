# Build path to completion — design

**Date:** 2026-10-01
**Goal:** finish the whole backlog (product roadmap + Nova track + tech debt) in the most
efficient order. No external deadline; order is chosen for least rework, not calendar.

## Sequencing rules

1. **Foundations first.** `CompanionLayer.jsx` (~2,800 lines) is touched by 2.3, C.6d, C.7, C.8,
   C.10, Nova Core 7 and 8. Split it (TD-11) before any of those land.
2. **Batch by surface.** Items that edit the same files ship in the same step, so each area is
   opened, tested and committed once. Tech-debt items ride along with the feature that touches
   their files instead of getting a separate sweep.
3. **One packaged-build cycle.** Everything that needs a packaged build to verify (C.8, TD-12,
   REL-001, REL-004) is one step.
4. **Interleave.** Product and Nova work alternate inside nearly every stage.
5. **Nothing blocks alpha that works without a key.** Enhanced mode and FR-001 run during alpha.

## Decisions

- **C.9 merges into Nova Core 8** (enhanced mode). Same feature: Haiku plays Nova through the
  Stage API with data tools and structured output, scripted fallback on failure.
- **Parked stays parked:** D1 OCR, D2 institutional REST, ink sketches, NT-004/005, QZ-006,
  SYL-008..013.
- **Later stays gated on alpha usage:** WEB-001, COM-001..003, GRD-INS-001, PROF-001.

## Build path

### Stage A — Foundations

| Step | Work | Notes |
|------|------|-------|
| A1 | Nova Core 6 command bar + TD-04 + TD-06 | Parser and wiring exist uncommitted. Finish unknown-input reply ("did you mean"), commit. TD-04 palette index and TD-06 shared hotkey guard touch the same hotkey/palette code. |
| A2 | TD-11 split `CompanionLayer` + TD-10 | Hooks per concern: idle, drag, tours, quiz, nudges. Ref-based drag position, clear all timeouts, dispose WebGL on toggle. Behavior must not change. |
| A3 | Grade/data sweep: TD-01, TD-02, TD-03, TD-07, TD-08 | **✓ Shipped (Phase 2.29).** Plan: `docs/superpowers/plans/2026-10-01-a3-grade-data-sweep.md`; code map: `.superpowers/sdd/a3-map.md`. Decisions recorded in the plan's Global Constraints. |

**Queue (2026-10-01):** UI overhaul (own spec in `docs/superpowers/specs/`) → A3 → Stage B.
A3's Task 7 (tone classes, print rules) must be re-checked against the overhaul's CSS before it runs.

### Stage B — Close Phase 2

| Step | Work | Notes |
|------|------|-------|
| B1 | 2.3 Nova runs the exam session (EXAM-003) + C.7 context staging + TD-05 + TD-09 | Uses the ported study-session scene. Bubble follows her head; she stands on tour targets and leans on panel sides (standing on the quiz panel was dropped). `FlashcardDeck` fixes while that file is open. **B1a ✓ Shipped (Phase 2.30):** EXAM-003 + TD-09 (TD-05 was already gone). Spec `docs/superpowers/specs/2026-10-04-b1a-exam-session-design.md`, plan `docs/superpowers/plans/2026-10-04-b1a-exam-session.md`. **B1b ✓ Shipped (Phase 2.31):** C.7 staging. Spec `docs/superpowers/specs/2026-10-08-b1b-context-staging-design.md`, plan `docs/superpowers/plans/2026-10-08-b1b-context-staging.md`. **B2 next.** |
| B2 | Exam-scoped practice tests + CAL-002 | Reuses PT-001 and `exam_modules`. |
| B3 | C.6d rampant + Nova Core 7 evolving desk | Both are event-driven visuals on the existing mood and memory systems. |
| B4 | CAL-003 syllabus dates into calendar | Local parse first, Haiku optional. |

Phase 2 exit: exam prep on Today launches a Nova session with exam-scoped cards.

### Stage C — Alpha hardening

| Step | Work | Notes |
|------|------|-------|
| C1 | Packaged-build batch: C.8 + TD-12 + REL-001 + REL-004 | Portrait/3D switch, context-loss recovery, packaged check; meshopt-compress `nova.vrm`, binary clips (smaller auto-update payload); GitHub Releases updater; signing if a certificate is available. |
| C2 | REL-002 backup / export / restore | |
| C3 | REL-003 onboarding + C.10 | Onboarding is a tour; reuse the tour system. Assessment-mode auto-hide, blackboard-sync and calendar tours. |

### Stage D — Alpha

| Step | Work | Notes |
|------|------|-------|
| D1 | Alpha with 20–30 UA students | Measure daily Today opens and sessions started. |
| D2 | Nova Core 8 enhanced mode (incl. C.9) | Runs alongside alpha. Key via existing safeStorage flow. Never states a number it didn't get from a tool. |
| D3 | FR-001 formula generators | Largest item (3–6 wk), independent, local-first. |

### Stage E — Later (gated)

Web study-guide finder, Commons, grade insights, professor reviews, per the brief.

## How each step is built

Every step gets its own implementation plan (superpowers `writing-plans`) before code, then
ships as one commit in the `Phase X.Y — ...` format with `ROADMAP.md` and `PRODUCT_BACKLOG.md`
updated.

**Design skills (project-local, `.agents/skills/`):**

- **`frontend-design`** — read before any step that adds or reshapes UI: A1 command bar,
  B1 session screen, B2, B3 desk, C1 settings switch, C2, C3 onboarding. Use its two-pass
  process (plan, review against the brief, build, critique with screenshots) and its writing
  guidance for copy, errors and empty states. **House rules win over the skill:** the
  `.cursorrules` design system (hard-edged HUD, `--sh-*` tokens, aqua only interactive accent,
  Michroma display, Geist Mono for numbers and labels, the UI overhaul spec
  `2026-10-01-ui-overhaul-design.md` and its mockups) is the
  brief, and the skill itself says the brief's words win. Apply the skill where the brief is
  silent: hierarchy, restraint (glow on one element), copy, motion answering user actions.
- **`webapp-testing`** — visual and behavioral check for every UI step against the Vite dev
  server (`scripts/with_server.py`, run `--help` first). Screenshot before/after; mandatory for
  A2 (CompanionLayer split must not change behavior) and B1.

**Every step must also:** pass `npm run build` and `npx vitest run`, keep officeparser out of the
renderer bundle, add no console logging, and leave OM 300 working. Pure logic gets a vitest.
