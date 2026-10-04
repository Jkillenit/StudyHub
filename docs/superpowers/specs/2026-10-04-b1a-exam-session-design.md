# B1a — Nova runs the exam session (EXAM-003) — design

**Date:** 2026-10-04 · **Build path step:** B1 (split: B1a = 2.3 + TD-09, B1b = C.7 context staging)
**Roadmap exit:** exam prep on Today launches a Nova session with exam-scoped cards.

## Decisions (user-approved 2026-10-04)

- The exam session **is the existing full-window flashcard session** (`FlashcardDeck` in
  `SessionShell`), auto-started with exam-scoped cards. Nova narrates from her session lane.
  Nova's quiz (`QuizPanel`) is unchanged.
- TD-05 is already gone (overhaul removed `FlashcardDeckContext`; drafts live in `DeckList`'s
  `CardEditor`). Close it in the backlog. TD-09 shrinks to one O(n²) filter.
- B1b (C.7: head-anchored bubble, standing on the session panel and tour targets, held lean)
  gets its own spec.

## 1. Launch

- `priority.js`: the EXAM_PREP action becomes `{ type: "review", courseUuid, examUuid, label: "START REVIEW" }`.
- `runAction.js`: a review action with `examUuid` calls
  `openCourseView(onOpenCourse, courseUuid, { item: "qz-deck", examUuid })`.
- `UserCourseApp`'s `qz-deck` handler keeps the `examUuid` and passes it to `CourseContentArea`
  as a one-shot request (cleared once consumed, so re-renders don't restart the session).
- `CourseContentArea` starts the session from the request instead of showing the deck list.
- Dropping Nova on an exam row needs no change (it clicks the row's button).

## 2. Card pick — `src/session/examSession.js` (pure, tested)

`pickExamCards(cards, exam, { isDue, max = 20, min = 10 }) -> cardIds[]`

1. Scope: `cardsInScope(cards, exam.moduleIds)` (empty `moduleIds` = whole course).
2. Due cards first (`isDue(card)`, already exam-aware via `examFor`), shuffled as `sessionOrder` does, up to `max`.
3. Fewer than `min` due → top up with not-ready cards (latest grade < `EXAM_SCHEDULE.readyGrade`,
   never-rated first, then lowest grade), until `min` or the scope runs out.
4. Scope smaller than `min` → all of it.
5. Empty scope → `[]`. The caller then opens the deck list and Nova says `examNoCards`.

`cardsInScope` moves from `examEstimate.js` to `examSession.js` (or is imported from it) so the
pure module has no `courseStore` import (node tests can't load `courseStore`).

## 3. Opening line

`examOpening({ title, daysUntil, total, due, readyPct }) -> { key, vars }`, keys in
`character.lines` with a Zombies override in `packs/zombiesLines.js`:

- `examOpen`: "{title} in {days} days. {total} cards, {due} due. You're {ready}% ready."
- `examOpenToday` (days = 0) and `examOpenTomorrow` (days = 1) variants.

Spoken via `line(key, vars)` then `maybeRephrase(text, vars)` (existing `memory/rephrase.js`,
3 s timeout, rejects changed numbers). Delivered through a window event
(`studyhub-exam-session` with `{ phase: "open" | "end", ... }`) that a small companion hook turns into
`core.say`, so `FlashcardDeck` never imports companion internals.

## 4. End summary

In `SessionResults`' existing `extra` slot (no shared layout change):

- `READY 46% → 58%`: `examReadyPercent` over the exam's scoped cards, before vs after.
- Next session, `examNextStep({ readyPct, daysUntil, dueAfter, perDayMinutes, secondsPerCard })`:
  - ready ≥ 80 (`EXAM_READY_TARGET`) → "Exam-ready. One light pass the day before."
  - exam today → "Exam today. Quick pass on misses only."
  - else → "Next: tomorrow, ~{n} cards ({m} min)" with n = ceil(not-ready / days left), min 5,
    max 20, and m from the session's average seconds per card (fallback 10 s).
- Nova says `examEndUp` (ready went up), `examEndFlat` (no change) or `examEndReady` (≥ 80).

## 5. Logging

- Migration: `study_sessions.exam_uuid TEXT NULL`.
- `db:sessions:log` accepts `examUuid`; `FlashcardDeck` logs `kind: "exam"` + `examUuid` for exam sessions,
  `kind: "drill"` otherwise. Ready % change is not stored (YAGNI).
- "Another round" in an exam session re-picks with `pickExamCards`, keeping it an exam session.

## 6. TD-09

`FlashcardDeck`'s results filter `cards.filter((c) => run.order.includes(cardKey(c)))` becomes a
`useMemo` over a `Set`. Backlog: delete TD-05 and TD-09 rows.

## Out of scope

Exam mode in Nova's quiz, storing ready history, Haiku composing lines, C.7 staging.

## Testing

- vitest: `pickExamCards` (scope, due-first cap, top-up order, small scope, empty),
  `examOpening` (day variants, vars), `examNextStep` (ready, today, normal, clamps).
- `npm run check:db` covers the migration; `electron` parity unaffected.
- Browser: OM 300 drill still rates and finishes (user-course exam path needs the Electron bridge;
  verified by code reading + the pure tests). Nova smoke passes.
