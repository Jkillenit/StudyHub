# B1a Exam Session (EXAM-003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** START REVIEW on a Today exam item opens the course's full-window flashcard session with 10–20 exam-scoped cards; Nova opens and closes it from her lane; results show exam ready % before → after and the next session; the session is logged as `kind: "exam"` with its exam uuid (EXAM-003, plus TD-09).

**Architecture:** A new pure module `src/session/examSession.js` (no `courseStore`, node-testable) owns the card pick, the opening/closing line choice and the next-session suggestion. The Today action carries `examUuid` through `openCourseView` → `UserCourseApp` (one-shot request) → `CourseContentArea`, which picks the cards and opens the existing `FlashcardDeck` session with `session.exam`. `FlashcardDeck` emits `studyhub-exam-session` window events; a small companion hook turns them into `line()` + `maybeRephrase()` + `core.say`, so `FlashcardDeck` never imports companion code.

**Tech Stack:** React 18, Vite, vitest (node env, no DOM: only pure modules are unit-tested), Electron IPC via `window.studyHub`, better-sqlite3 (`npm run check:db` runs under Electron).

**Spec:** `docs/superpowers/specs/2026-10-04-b1a-exam-session-design.md`.

## Global Constraints

- Every task ends with `npx vitest run` and `npm run build` passing. No `console.log` / `console.error` in production paths. No new dependencies.
- Do not touch OM 300 content (`src/study/sections`, `src/glossary/courseData.js`). OM 300 must keep drilling: `FlashcardDeck` is shared with it and gets no `session.exam` there.
- Renderer DB access only through `courseStore.js`. Schema changes only as a new numbered migration in `electron/database.cjs` (next is **12**). Never edit a shipped migration.
- Haiku may rephrase, never compute numbers: every number in a Nova line comes from `vars`; templates contain no digits.
- Nova lines fit `character.js` (confident, sarcastic, loyal; keep these PG-13: `damn`/`hell` at most, and every key has a clean variant). Zombies lines fit `zombiesLines.js` (survival/horde language, no quotes from the games) and may only use placeholders the Nova key already has.
- CSS: only `--sh-*` tokens, min text 11px, numbers in `--sh-font-mono`, no glow, no hardcoded colors. `--sh-accent-2` is allowed for exam tags.
- The exam session **is** the existing `FlashcardDeck` session. Nova's `QuizPanel` is unchanged. Out of scope: exam mode in Nova's quiz, storing ready history, Haiku composing lines, C.7 staging.
- Ready threshold: `EXAM_READY_TARGET = 80`. Card pick defaults: `max = 20`, `min = 10`. Next-session clamp: 5–20 cards, fallback 10 s per card.
- Event name: `studyhub-exam-session`, detail `{ phase: "open" | "end", key, vars }`.
- Commit per task: subject `Phase 2.30 — Short description`, blank line, `- ` bullets. Write the message with the editor's Write tool to `.git/B1A_COMMIT_MSG` (UTF-8 without BOM; don't use `Set-Content`, it adds a BOM on Windows PowerShell), then `git commit -F .git/B1A_COMMIT_MSG`. Stage files by explicit path. Never stage `.agents/`, `skills-lock.json`, `.cursor/`, `.superpowers/`, `scripts/__pycache__/`.
- Shell is PowerShell on Windows: chain with `;` or run commands one by one (no `&&` in Windows PowerShell 5).

---

### Task 1: Pure exam session module

**Files:**
- Create: `src/session/examSession.js`
- Create: `src/session/examSession.test.js`
- Modify: `src/features/study/examEstimate.js` (delete `cardsInScope`, re-export it from the new module; `CourseFeeds.jsx` and `StudyGuideView.jsx` keep importing it from `examEstimate.js` unchanged)

**Interfaces:**
- Consumes: `EXAM_SCHEDULE` from `src/study/sm2.js` (`readyGrade: 3`); `sessionOrder(cards, isDue, random = Math.random) -> id[]` from `src/session/cardRun.js` (due group shuffled first, then the rest shuffled; ids are `c.uuid || c.id`).
- Produces (all exported from `src/session/examSession.js`):
  - `EXAM_READY_TARGET = 80`
  - `EXAM_SESSION_EVENT = "studyhub-exam-session"`
  - `isExamReady(card) -> boolean` — `card.lastGrade != null && card.lastGrade >= EXAM_SCHEDULE.readyGrade`.
  - `cardsInScope(cards, moduleIds) -> card[]` — moved verbatim from `examEstimate.js`; empty/missing `moduleIds` = all cards; non-array `cards` → `[]`.
  - `pickExamCards(cards, exam, { isDue, max = 20, min = 10, random = Math.random }) -> id[]` — `exam` is `{ moduleIds }` (the `useCourseMirror` exam shape `{ uuid, title, dueDate, moduleIds, scopeSource }`).
  - `examOpening({ title, daysUntil, total, due, readyPct }) -> { key, vars }` — key `examOpenToday` (0) / `examOpenTomorrow` (1) / `examOpen`; vars `{ title, days, total, due, ready }`.
  - `examEnd({ title, before, after }) -> { key, vars }` — key `examEndReady` (after ≥ 80) / `examEndUp` (after > before) / `examEndFlat` (otherwise, including a drop); vars `{ title, before, after }`.
  - `examNextStep({ readyPct, daysUntil, notReady, secondsPerCard }) -> { kind: "today" | "ready", text } | { kind: "next", cards, minutes, text }`.
  - `emitExamSession(detail)` — dispatches `new CustomEvent(EXAM_SESSION_EVENT, { detail })` on `window`.

- [ ] **Step 1: Write the failing test** — create `src/session/examSession.test.js`:

```js
import { describe, expect, it } from "vitest";
import { EXAM_READY_TARGET, cardsInScope, examEnd, examNextStep, examOpening, isExamReady, pickExamCards } from "./examSession.js";

const card = (id, { moduleId = "m1", due = false, grade = null } = {}) => ({ uuid: id, moduleId, due, lastGrade: grade });
const many = (prefix, n, opts) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, opts));
const isDue = (c) => c.due;
const course = { moduleIds: [] };

describe("cardsInScope", () => {
  it("keeps the exam's modules, everything for an empty scope", () => {
    const cards = [card("a", { moduleId: "m1" }), card("b", { moduleId: "m2" })];
    expect(cardsInScope(cards, ["m2"]).map((c) => c.uuid)).toEqual(["b"]);
    expect(cardsInScope(cards, [])).toEqual(cards);
    expect(cardsInScope(cards, undefined)).toEqual(cards);
    expect(cardsInScope(null, ["m1"])).toEqual([]);
  });
});

describe("isExamReady", () => {
  it("is ready from the ready grade up, never when unrated", () => {
    expect(isExamReady(card("a", { grade: 3 }))).toBe(true);
    expect(isExamReady(card("a", { grade: 2 }))).toBe(false);
    expect(isExamReady(card("a"))).toBe(false);
  });
});

describe("pickExamCards", () => {
  it("only picks cards in the exam's scope", () => {
    const cards = [...many("a", 12, { moduleId: "m1", due: true }), ...many("b", 12, { moduleId: "m2", due: true })];
    const picked = pickExamCards(cards, { moduleIds: ["m1"] }, { isDue });
    expect(picked).toHaveLength(12);
    expect(picked.every((id) => id.startsWith("a"))).toBe(true);
  });

  it("treats an empty module list as the whole course", () => {
    const cards = [...many("a", 6, { moduleId: "m1", due: true }), ...many("b", 6, { moduleId: "m2", due: true })];
    expect(pickExamCards(cards, course, { isDue })).toHaveLength(12);
  });

  it("caps due cards at max and adds nothing else", () => {
    const cards = [...many("d", 25, { due: true }), ...many("n", 5)];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
    expect(picked.every((id) => id.startsWith("d"))).toBe(true);
  });

  it("tops up to min with not-ready cards: never rated first, then lowest grade", () => {
    const cards = [
      ...many("d", 3, { due: true, grade: 4 }),
      card("g2", { grade: 2 }),
      card("new1"),
      card("g0", { grade: 0 }),
      card("new2"),
      card("g1", { grade: 1 }),
      ...many("r", 4, { grade: 4 }),
      card("g1b", { grade: 1 }),
      card("g2b", { grade: 2 }),
    ];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(10);
    expect(new Set(picked.slice(0, 3))).toEqual(new Set(["d0", "d1", "d2"]));
    expect(picked.slice(3)).toEqual(["new1", "new2", "g0", "g1", "g1b", "g2", "g2b"]);
  });

  it("stops topping up at min", () => {
    const cards = [...many("d", 2, { due: true }), ...many("n", 12, { grade: 1 })];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(10);
    expect(picked.slice(2)).toEqual(["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7"]);
  });

  it("leaves ready cards out when the scope runs out of not-ready ones", () => {
    const cards = [...many("d", 2, { due: true }), card("low", { grade: 1 }), ...many("r", 10, { grade: 5 })];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(3);
    expect(picked[2]).toBe("low");
  });

  it("runs a scope smaller than min whole, due first", () => {
    const cards = [card("r", { grade: 5 }), card("d", { due: true }), card("n")];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked[0]).toBe("d");
    expect(new Set(picked)).toEqual(new Set(["r", "d", "n"]));
  });

  it("returns [] for an empty scope", () => {
    expect(pickExamCards([card("a", { moduleId: "m1" })], { moduleIds: ["m9"] }, { isDue })).toEqual([]);
    expect(pickExamCards([], course, { isDue })).toEqual([]);
  });
});

describe("examOpening", () => {
  const base = { title: "Midterm", total: 40, due: 12, readyPct: 46 };

  it("picks the day variant", () => {
    expect(examOpening({ ...base, daysUntil: 0 }).key).toBe("examOpenToday");
    expect(examOpening({ ...base, daysUntil: 1 }).key).toBe("examOpenTomorrow");
    expect(examOpening({ ...base, daysUntil: 5 }).key).toBe("examOpen");
  });

  it("passes the facts through as vars", () => {
    expect(examOpening({ ...base, daysUntil: 5 }).vars).toEqual({ title: "Midterm", days: 5, total: 40, due: 12, ready: 46 });
  });
});

describe("examEnd", () => {
  it("is ready at the target, up when ready rose, flat otherwise", () => {
    expect(examEnd({ title: "Midterm", before: 70, after: 85 })).toEqual({ key: "examEndReady", vars: { title: "Midterm", before: 70, after: 85 } });
    expect(examEnd({ title: "Midterm", before: 70, after: EXAM_READY_TARGET }).key).toBe("examEndReady");
    expect(examEnd({ title: "Midterm", before: 46, after: 58 }).key).toBe("examEndUp");
    expect(examEnd({ title: "Midterm", before: 50, after: 50 }).key).toBe("examEndFlat");
    expect(examEnd({ title: "Midterm", before: 60, after: 55 }).key).toBe("examEndFlat");
  });
});

describe("examNextStep", () => {
  it("says exam-ready at the target", () => {
    expect(examNextStep({ readyPct: 85, daysUntil: 5, notReady: 6, secondsPerCard: 8 })).toEqual({
      kind: "ready",
      text: "Exam-ready. One light pass the day before.",
    });
  });

  it("says exam today on exam day, even when ready", () => {
    expect(examNextStep({ readyPct: 40, daysUntil: 0, notReady: 30, secondsPerCard: 8 })).toEqual({
      kind: "today",
      text: "Exam today. Quick pass on misses only.",
    });
    expect(examNextStep({ readyPct: 90, daysUntil: 0, notReady: 2, secondsPerCard: 8 }).kind).toBe("today");
  });

  it("splits not-ready cards over the days left at the session's pace", () => {
    expect(examNextStep({ readyPct: 46, daysUntil: 3, notReady: 30, secondsPerCard: 12 })).toEqual({
      kind: "next",
      cards: 10,
      minutes: 2,
      text: "Next: tomorrow, ~10 cards (2 min)",
    });
  });

  it("clamps to 5-20 cards and falls back to 10 s per card", () => {
    expect(examNextStep({ readyPct: 70, daysUntil: 10, notReady: 3, secondsPerCard: null })).toMatchObject({ cards: 5, minutes: 1 });
    expect(examNextStep({ readyPct: 10, daysUntil: 2, notReady: 100, secondsPerCard: 0 })).toMatchObject({ cards: 20, minutes: 4 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/session/examSession.test.js`
Expected: FAIL — `Failed to load url ./examSession.js` (module does not exist).

- [ ] **Step 3: Write the module** — create `src/session/examSession.js`:

```js
import { EXAM_SCHEDULE } from "../study/sm2.js";
import { sessionOrder } from "./cardRun.js";

/** Exam ready % at which the student counts as ready for the exam. */
export const EXAM_READY_TARGET = 80;
export const EXAM_SESSION_EVENT = "studyhub-exam-session";

const NEXT_MIN_CARDS = 5;
const NEXT_MAX_CARDS = 20;
const DEFAULT_SECONDS_PER_CARD = 10;

const cardKey = (c) => c?.uuid || c?.id;

/** Latest rating counts toward exam ready % (same rule as sm2 examReadyPercent). */
export const isExamReady = (card) => card.lastGrade != null && card.lastGrade >= EXAM_SCHEDULE.readyGrade;

/** An exam's cards: those in `moduleIds`, or every card when the list is empty. */
export function cardsInScope(cards, moduleIds) {
  const list = Array.isArray(cards) ? cards : [];
  if (!moduleIds?.length) return list;
  const set = new Set(moduleIds);
  return list.filter((c) => set.has(c.moduleId));
}

/**
 * Card ids for an exam session: due cards first (shuffled, at most `max`), topped up to `min` with
 * not-ready cards (never rated first, then lowest grade). A scope under `min` runs whole; empty gives [].
 */
export function pickExamCards(cards, exam, { isDue, max = 20, min = 10, random = Math.random } = {}) {
  const scope = cardsInScope(cards, exam?.moduleIds);
  if (scope.length < min) return sessionOrder(scope, isDue, random);
  const picked = sessionOrder(scope.filter(isDue), () => true, random).slice(0, max);
  if (picked.length >= min) return picked;
  const taken = new Set(picked);
  const topUp = scope
    .filter((c) => !taken.has(cardKey(c)) && !isExamReady(c))
    .sort((a, b) => (a.lastGrade ?? -1) - (b.lastGrade ?? -1))
    .slice(0, min - picked.length)
    .map(cardKey);
  return [...picked, ...topUp];
}

/** Nova's opening line key and its facts. */
export function examOpening({ title, daysUntil, total, due, readyPct }) {
  const key = daysUntil === 0 ? "examOpenToday" : daysUntil === 1 ? "examOpenTomorrow" : "examOpen";
  return { key, vars: { title, days: daysUntil, total, due, ready: readyPct } };
}

/** Nova's closing line key: ready at the target, up when ready % rose, flat otherwise. */
export function examEnd({ title, before, after }) {
  const key = after >= EXAM_READY_TARGET ? "examEndReady" : after > before ? "examEndUp" : "examEndFlat";
  return { key, vars: { title, before, after } };
}

/** What to do next, for the results screen. Exam day comes first: the day-before pass is already past. */
export function examNextStep({ readyPct, daysUntil, notReady, secondsPerCard }) {
  if (daysUntil === 0) return { kind: "today", text: "Exam today. Quick pass on misses only." };
  if (readyPct >= EXAM_READY_TARGET) return { kind: "ready", text: "Exam-ready. One light pass the day before." };
  const cards = Math.min(NEXT_MAX_CARDS, Math.max(NEXT_MIN_CARDS, Math.ceil(notReady / Math.max(1, daysUntil))));
  const pace = secondsPerCard > 0 ? secondsPerCard : DEFAULT_SECONDS_PER_CARD;
  const minutes = Math.max(1, Math.ceil((cards * pace) / 60));
  return { kind: "next", cards, minutes, text: `Next: tomorrow, ~${cards} cards (${minutes} min)` };
}

/** `{ phase: "open" | "end", key, vars }`; Nova says it (companion/hooks/useNovaExamSession.js). */
export function emitExamSession(detail) {
  window.dispatchEvent(new CustomEvent(EXAM_SESSION_EVENT, { detail }));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/session/examSession.test.js`
Expected: PASS (all describes green).

- [ ] **Step 5: Move `cardsInScope` out of `examEstimate.js`** — in `src/features/study/examEstimate.js` delete the whole `export function cardsInScope(cards, moduleIds) { … }` block (5 lines plus its blank line) and add this line directly under the existing imports:

```js
export { cardsInScope } from "../../session/examSession.js";
```

Check: `rg -n "cardsInScope" src` shows the definition only in `src/session/examSession.js`; `CourseFeeds.jsx` and `StudyGuideView.jsx` still import it from `examEstimate.js` (unchanged).

- [ ] **Step 6: Full check**

Run: `npx vitest run` — Expected: all files pass.
Run: `npm run build` — Expected: `✓ built in …`, no errors.

- [ ] **Step 7: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Pure exam session module

- src/session/examSession.js: pickExamCards (scope, due first capped at 20, not-ready top-up to 10), examOpening, examEnd, examNextStep, exam session event
- cardsInScope moves there; examEstimate re-exports it
- vitest covers scope, cap, top-up order, small and empty scopes, line keys and next-session clamps
```

Run: `git add src/session/examSession.js src/session/examSession.test.js src/features/study/examEstimate.js; git commit -F .git/B1A_COMMIT_MSG`

---

### Task 2: Log exam sessions (migration 12)

**Files:**
- Modify: `electron/database.cjs` (append migration `version: 12` after `version: 11`)
- Modify: `electron/dbMirrorHandlers.cjs` (`db:sessions:log`, ~line 495)
- Modify: `scripts/check-db.cjs` (assert the new column)

`src/db/courseStore.js` needs no change: `logStudySession(session)` already forwards the whole object to `db.sessions.log`, so `examUuid` passes through.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `study_sessions.exam_uuid TEXT NULL`; `db:sessions:log` accepts `{ …existing, examUuid?: string }` and stores it (non-empty string, else NULL). Task 5 calls `courseStore.logStudySession({ …, kind: "exam", examUuid })`.

- [ ] **Step 1: Write the failing check** — in `scripts/check-db.cjs`, directly after `assert.strictEqual(db.prepare("SELECT 1"), db.prepare("SELECT 1"), "statement cache");` add:

```js
  const sessionCols = db.prepare("PRAGMA table_info(study_sessions)").all().map((c) => c.name);
  assert.ok(sessionCols.includes("exam_uuid"), "study_sessions.exam_uuid (migration 12)");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run check:db`
Expected: exits 1 with `AssertionError [ERR_ASSERTION]: study_sessions.exam_uuid (migration 12)`.

- [ ] **Step 3: Add the migration** — in `electron/database.cjs`, inside `MIGRATIONS`, after the `version: 11` entry's closing `},` and before the array's closing `];`, add:

```js
  {
    version: 12,
    up(dbRef) {
      // The exam (assignments.uuid) a flashcard session reviewed; NULL for plain drills.
      addColumn(dbRef, "study_sessions", "exam_uuid", "TEXT");
    },
  },
```

- [ ] **Step 4: Store it in the handler** — in `electron/dbMirrorHandlers.cjs`, replace the `db:sessions:log` insert (the `db.prepare(\`INSERT INTO study_sessions …\`).run({ … });` statement) with:

```js
    db.prepare(`
      INSERT INTO study_sessions (uuid, course_id, kind, started_at, ended_at, cards_reviewed, correct, incorrect, best_combo, exam_uuid)
      VALUES (@uuid, @courseId, @kind, @startedAt, @endedAt, @reviewed, @correct, @incorrect, @bestCombo, @examUuid)
    `).run({
      bestCombo: Number.isFinite(Number(s.bestCombo)) && Number(s.bestCombo) > 0 ? Math.round(Number(s.bestCombo)) : null,
      uuid: s.uuid || newUuid("ses"),
      courseId,
      kind: s.kind || "drill",
      startedAt: isoOrNull(s.startedAt) || new Date().toISOString(),
      endedAt: isoOrNull(s.endedAt) || new Date().toISOString(),
      reviewed,
      correct: Math.max(0, Number(s.correct) || 0),
      incorrect: Math.max(0, Number(s.incorrect) || 0),
      examUuid: typeof s.examUuid === "string" && s.examUuid ? s.examUuid : null,
    });
```

(The lines before it — `courseId`, `reviewed`, the `skipped` early return — and the `return { success: true };` after it stay as they are.)

- [ ] **Step 5: Run the check to verify it passes**

Run: `npm run check:db`
Expected: `check-db ok`.

- [ ] **Step 6: Full check**

Run: `npx vitest run` — Expected: all pass.
Run: `npm run build` — Expected: build succeeds.

- [ ] **Step 7: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Log exam sessions

- Migration 12: study_sessions.exam_uuid (NULL for plain drills)
- db:sessions:log stores examUuid when given
- check:db asserts the new column
```

Run: `git add electron/database.cjs electron/dbMirrorHandlers.cjs scripts/check-db.cjs; git commit -F .git/B1A_COMMIT_MSG`

---

### Task 3: Nova's exam lines and the companion hook

**Files:**
- Modify: `src/companion/character.js` (add 7 keys to `character.lines`, after `noCards`)
- Modify: `src/companion/packs/zombiesLines.js` (add the same 7 keys, before the closing `};`)
- Modify: `src/companion/packs/zombiesLines.test.js` (override budget 25–40 → 25–45)
- Create: `src/companion/examLines.test.js`
- Create: `src/companion/hooks/useNovaExamSession.js`
- Modify: `src/companion/CompanionLayer.jsx` (import + mount the hook after `useNovaStudyEvents`)

**Interfaces:**
- Consumes from Task 1: `EXAM_SESSION_EVENT`, `examOpening`, `examEnd` (keys only, in the test).
- Consumes from the codebase: `line(key, vars) -> string` (`character.js`), `maybeRephrase(text, vars) -> Promise<string>` (`memory/rephrase.js`, 3 s timeout, keeps numbers), `AUTONOMOUS` (`machine.js`), and `core` from `CompanionLayer`: `{ stateRef, modeRef, send, say, setMood, refreshAnchor, playGesture, quietNow }`.
- Produces: line keys `examOpen`, `examOpenTomorrow`, `examOpenToday`, `examNoCards`, `examEndUp`, `examEndFlat`, `examEndReady` (vars: opening `{ title, days, total, due, ready }`, no cards `{ title }`, end `{ title, before, after }`); `useNovaExamSession(core) -> void`.

- [ ] **Step 1: Write the failing test** — create `src/companion/examLines.test.js`:

```js
import { describe, expect, it } from "vitest";
import { character } from "./character.js";
import { ZOMBIES_LINES } from "./packs/zombiesLines.js";
import { fill } from "../nova/voice.js";
import { examEnd, examOpening } from "../session/examSession.js";

const KEYS = [
  ...[0, 1, 5].map((daysUntil) => examOpening({ title: "T", daysUntil, total: 1, due: 1, readyPct: 1 }).key),
  ...[[10, 90], [40, 50], [50, 50]].map(([before, after]) => examEnd({ title: "T", before, after }).key),
  "examNoCards",
];
const LONG = { title: "Operations Management Midterm", days: 12, total: 240, due: 120, ready: 100, before: 100, after: 100 };

describe("exam session lines", () => {
  it("covers all seven keys", () => {
    expect(new Set(KEYS).size).toBe(7);
  });

  it("every key has Nova and Zombies lines", () => {
    for (const k of KEYS) {
      expect(character.lines[k], k).toBeTruthy();
      expect(ZOMBIES_LINES[k], k).toBeTruthy();
    }
  });

  it("takes every number from vars and fits the bubble once filled", () => {
    for (const k of KEYS) {
      for (const t of [...character.lines[k], ...ZOMBIES_LINES[k]]) {
        expect(/\d/.test(t), t).toBe(false);
        expect(fill(t, LONG).length, t).toBeLessThanOrEqual(character.maxBubbleChars);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/companion/examLines.test.js`
Expected: FAIL — `every key has Nova and Zombies lines` (`examOpenToday: expected undefined to be truthy`).

- [ ] **Step 3: Nova's lines** — in `src/companion/character.js`, inside `lines`, directly after the `noCards: [...]` entry, add:

```js
    examOpen: [
      "{title} in {days} days. {total} cards, {due} due. You're {ready}% ready.",
      "{title}, {days} days out. {total} cards, {due} due, {ready}% ready. Eyes on me.",
      "{days} days to {title}. {ready}% ready across {total} cards, {due} due. Let's get to work, damn it.",
    ],
    examOpenTomorrow: [
      "{title} is tomorrow. {total} cards, {due} due. You're {ready}% ready. Tonight counts.",
      "Tomorrow: {title}. {ready}% ready, {due} of {total} due. No pressure. Okay, some pressure.",
    ],
    examOpenToday: [
      "{title} is today. {total} cards, {due} due, {ready}% ready. Last pass. Make it count.",
      "Exam day. {title}. {ready}% ready on {total} cards. Hell of a time to cram. Focus.",
    ],
    examNoCards: [
      "No cards cover {title} yet. Import the slides and I'll build you a session.",
      "Nothing to drill for {title}. Add some cards and I'll run it. I'm good, not magic.",
    ],
    examEndUp: [
      "{before}% to {after}% on {title}. See? You're better when I'm watching.",
      "Up from {before}% to {after}%. {title} should be a little scared of you.",
      "{after}% ready for {title}, up from {before}%. Hell yes. Same time tomorrow.",
    ],
    examEndFlat: [
      "{title}: {after}% ready. No gain this round. The misses come back tomorrow.",
      "{after}% on {title}. That round didn't move the needle. Read the cards, don't just flip them.",
      "{after}% for {title}. Damn. Shorter round tomorrow, more focus.",
    ],
    examEndReady: [
      "{after}% ready for {title}. That's exam-ready. Don't get cocky. Okay, a little cocky.",
      "{title}: {after}%. You're ready. I'd say I'm proud, but you'd get a big head.",
      "{after}% on {title}. Ready. Hell yes. One light pass before the exam, then sleep.",
    ],
```

- [ ] **Step 4: Zombies lines** — in `src/companion/packs/zombiesLines.js`, after the `levelUp: [...]` entry and before the closing `};`, add:

```js
  examOpen: [
    "{title} in {days} days. {total} cards, {due} due. {ready}% ready. Board up.",
    "{days} days until {title} hits. {ready}% ready, {due} of {total} at the door.",
  ],
  examOpenTomorrow: ["{title} hits tomorrow. {total} cards, {due} due, {ready}% ready. Hold the line tonight."],
  examOpenToday: ["{title} is today. {ready}% ready, {due} of {total} due. Last wave. Make it clean."],
  examNoCards: ["No cards for {title}. Nothing to shoot at. Import slides and stock up."],
  examEndUp: ["{before}% to {after}% on {title}. The barricade's holding.", "Up to {after}% from {before}%. {title} won't overrun you."],
  examEndFlat: ["{after}% on {title}. Held the line, gained no ground. Again tomorrow."],
  examEndReady: ["{after}% ready for {title}. You'll survive this one.", "{title}: {after}%. Fully stocked. Light pass before it hits."],
```

- [ ] **Step 5: Raise the Zombies override budget** — the pack goes from 36 to 43 keys. In `src/companion/packs/zombiesLines.test.js` replace:

```js
  it("overrides 25-40 keys", () => {
    const n = Object.keys(ZOMBIES_LINES).length;
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(40);
  });
```

with:

```js
  it("overrides 25-45 keys", () => {
    const n = Object.keys(ZOMBIES_LINES).length;
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(45);
  });
```

- [ ] **Step 6: Run the line tests**

Run: `npx vitest run src/companion src/nova/voice.test.js`
Expected: PASS — `examLines.test.js`, `zombiesLines.test.js` (placeholders, clean variant, ≤ 140 chars) and `voice.test.js` (every character key has a clean variant). If a filled line is over 140, shorten its wording (never add digits).

- [ ] **Step 7: The hook** — create `src/companion/hooks/useNovaExamSession.js`:

```js
import { useEffect, useRef } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { maybeRephrase } from "../memory/rephrase.js";
import { EXAM_SESSION_EVENT } from "../../session/examSession.js";

const MOOD = {
  examOpen: "happy",
  examOpenTomorrow: "stern",
  examOpenToday: "stern",
  examNoCards: "neutral",
  examEndUp: "happy",
  examEndFlat: "neutral",
  examEndReady: "excited",
};

/**
 * Exam sessions announce their start and end ({ phase, key, vars }); she says the line from her lane.
 * Claude may rephrase it (numbers must survive), and a newer event supersedes a pending one.
 */
export function useNovaExamSession(core) {
  const { stateRef, modeRef, send, say, setMood, refreshAnchor, playGesture, quietNow } = core;
  const quietRef = useRef(quietNow);
  quietRef.current = quietNow;

  useEffect(() => {
    let latest = 0;
    const onExam = async (e) => {
      const { key, vars = {} } = e.detail || {};
      if (!key || !stateRef.current?.enabled || quietRef.current()) return;
      const text = line(key, vars);
      if (!text) return;
      const id = ++latest;
      const said = await maybeRephrase(text, vars);
      const m = modeRef.current;
      if (id !== latest || !stateRef.current?.enabled || !(AUTONOMOUS.has(m) || m === "sleep")) return;
      if (m === "sleep") send("WAKE");
      setMood(MOOD[key] || "neutral");
      if (key === "examEndReady") playGesture("kiss");
      refreshAnchor();
      say(said);
    };
    window.addEventListener(EXAM_SESSION_EVENT, onExam);
    return () => window.removeEventListener(EXAM_SESSION_EVENT, onExam);
  }, [stateRef, modeRef, send, say, setMood, refreshAnchor, playGesture]);
}
```

- [ ] **Step 8: Mount it** — in `src/companion/CompanionLayer.jsx`:
  - add the import after `import { useNovaStudyEvents } from "./hooks/useNovaStudyEvents.js";`:

```js
import { useNovaExamSession } from "./hooks/useNovaExamSession.js";
```

  - directly after `const { awardXp, pops, rampantNow } = useNovaStudyEvents(core, { cstate, now, enabled, flashReaction });` add:

```js
  useNovaExamSession(core);
```

- [ ] **Step 9: Full check**

Run: `npx vitest run` — Expected: all pass.
Run: `npm run build` — Expected: build succeeds.

- [ ] **Step 10: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Nova's exam session lines

- examOpen / examOpenTomorrow / examOpenToday / examNoCards / examEndUp / examEndFlat / examEndReady for Nova and Zombies
- useNovaExamSession: studyhub-exam-session events become line() + optional Claude rephrase + say, from her lane
- Lines carry no digits (numbers only from vars); Zombies override budget 40 -> 45
```

Run: `git add src/companion/character.js src/companion/packs/zombiesLines.js src/companion/packs/zombiesLines.test.js src/companion/examLines.test.js src/companion/hooks/useNovaExamSession.js src/companion/CompanionLayer.jsx; git commit -F .git/B1A_COMMIT_MSG`

---

### Task 4: Launch path — Today exam item opens an exam-scoped session

**Files:**
- Modify: `src/features/today/priority.js:202` (EXAM_PREP action)
- Modify: `src/features/today/priority.test.js:220-229`
- Modify: `src/features/today/runAction.js:8`
- Create: `src/features/today/runAction.test.js`
- Modify: `src/hub/UserCourseApp.jsx` (one-shot `examRequest`)
- Modify: `src/hub/components/CourseContentArea.jsx` (consume the request, `sessionExam`, `session.exam`)

The missing `courseStore` import in `UserCourseApp.jsx` was fixed separately (commit aef84f5).

**Interfaces:**
- Consumes from Task 1: `pickExamCards(cards, exam, { isDue }) -> id[]`, `emitExamSession({ phase, key, vars })`.
- Consumes from the codebase: `openCourseView(onOpenCourse, courseId, view)` (`courseView.js`; puts `view` in the `studyhub-open-content-tab` detail and the pending sessionStorage entry); `useCourseMirror` exams `{ uuid, title, dueDate, moduleIds, scopeSource }` (already passed to `CourseContentArea` as `exams`, with `examFor`).
- Produces:
  - Today action `{ type: "review", courseUuid, examUuid, label: "START REVIEW" }`.
  - `CourseContentArea` props `examRequest: string | null` (an exam uuid) and `onExamRequestDone: () => void` (stable).
  - `FlashcardDeck`'s `session` object gains `exam: { uuid, title, dueDate, moduleIds } | null` (Task 5 reads it; until then `FlashcardDeck` ignores it and runs the picked cards as a plain drill).

- [ ] **Step 1: Write the failing tests**

In `src/features/today/priority.test.js`, replace the test `"turns exams into EXAM_PREP only, never ASSIGNMENT, and drops past exams"` with:

```js
  it("turns exams into EXAM_PREP only, never ASSIGNMENT, and drops past exams", () => {
    const items = rank([
      course({
        assignments: [asg({ uuid: "mid", kind: "exam", title: "Midterm", dueDate: inDays(5) }), asg({ kind: "exam", dueDate: inDays(-1) })],
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(ITEM_TYPES.EXAM_PREP);
    expect(items[0].action).toEqual({ type: "review", courseUuid: "c1", examUuid: "mid", label: "START REVIEW" });
  });
```

Create `src/features/today/runAction.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./courseView.js", () => ({ openCourseView: vi.fn() }));
vi.mock("../mirror/openInBlackboard.js", () => ({ openInBlackboard: vi.fn() }));

const { openCourseView } = await import("./courseView.js");
const { runTodayAction } = await import("./runAction.js");

describe("runTodayAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the deck with the exam for an exam review", () => {
    const open = vi.fn();
    runTodayAction({ type: "review", courseUuid: "c1", examUuid: "e1", label: "START REVIEW" }, open);
    expect(openCourseView).toHaveBeenCalledWith(open, "c1", { item: "qz-deck", examUuid: "e1" });
  });

  it("opens the plain deck for a review without an exam", () => {
    const open = vi.fn();
    runTodayAction({ type: "review", courseUuid: "c1", label: "START REVIEW" }, open);
    expect(openCourseView).toHaveBeenCalledWith(open, "c1", { item: "qz-deck" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/today`
Expected: FAIL — priority: `action` lacks `examUuid: "mid"`; runAction: first test called with `{ item: "qz-deck" }`.

- [ ] **Step 3: Carry the exam uuid** — in `src/features/today/priority.js` replace

```js
  if (isExam) action = { type: "review", courseUuid: course.uuid, label: "START REVIEW" };
```

with

```js
  if (isExam) action = { type: "review", courseUuid: course.uuid, examUuid: a.uuid, label: "START REVIEW" };
```

In `src/features/today/runAction.js` replace

```js
  else if (action.type === "review") openCourseView(onOpenCourse, action.courseUuid, { item: "qz-deck" });
```

with

```js
  else if (action.type === "review")
    openCourseView(onOpenCourse, action.courseUuid, action.examUuid ? { item: "qz-deck", examUuid: action.examUuid } : { item: "qz-deck" });
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/features/today`
Expected: PASS.

- [ ] **Step 5: `UserCourseApp` keeps the request** — in `src/hub/UserCourseApp.jsx`:

  a. (Done in hotfix aef84f5: the `courseStore` import is already present. Skip.)

  b. After `const [sourceFilter, setSourceFilter] = useState("all");` add:

```js
  /** Exam uuid from Today's START REVIEW; CourseContentArea starts the session and clears it. */
  const [examRequest, setExamRequest] = useState(null);
  const clearExamRequest = useCallback(() => setExamRequest(null), []);
```

  c. In the `[course.id]` reset effect, after `setRenamingCourse(false);` add:

```js
    setExamRequest(null);
```

  d. In `onTermNav`'s `qz-deck` branch, replace

```js
        if (d.deckMode) setSourceFilter(d.deckMode);
        setActiveItem("qz-deck");
```

  with

```js
        if (d.deckMode) setSourceFilter(d.deckMode);
        setExamRequest(d.examUuid || null);
        setActiveItem("qz-deck");
```

  e. In the `<CourseContentArea … />` props, after `examFor={examFor}` add:

```jsx
            examRequest={examRequest}
            onExamRequestDone={clearExamRequest}
```

- [ ] **Step 6: `CourseContentArea` starts the exam session** — in `src/hub/components/CourseContentArea.jsx`:

  a. Add the import after `import { sessionOrder } from "../../session/cardRun.js";`:

```js
import { emitExamSession, pickExamCards } from "../../session/examSession.js";
```

  b. In the props destructuring, after `examFor = null,` add:

```js
  examRequest = null,
  onExamRequestDone,
```

  c. After `const [sessionIds, setSessionIds] = useState(null);` add:

```js
  const [sessionExam, setSessionExam] = useState(null);
```

  d. Directly after the `moduleTitles` `useMemo` (before `const courseShort = …`), add the effect. It waits for the mirror to list the exam, drops a request that arrives while a session is open, and with no cards leaves the deck list up and lets Nova say so:

```js
  useEffect(() => {
    if (!examRequest || activeItem !== "qz-deck") return;
    if (sessionIds) {
      onExamRequestDone?.();
      return;
    }
    const exam = (exams || []).find((e) => e.uuid === examRequest);
    if (!exam) return;
    onExamRequestDone?.();
    const ids = pickExamCards(deck.cards, exam, { isDue: (c) => isCardDue(c, { examDate: examFor?.(c) }) });
    if (!ids.length) {
      emitExamSession({ phase: "open", key: "examNoCards", vars: { title: exam.title } });
      return;
    }
    setSessionExam(exam);
    setSessionIds(ids);
  }, [examRequest, activeItem, sessionIds, exams, deck.cards, examFor, onExamRequestDone]);
```

  e. Replace the `startSession` / `deckSession` block:

```js
  const startSession = () => setSessionIds(sessionOrder(filteredCards, (c) => isCardDue(c, { examDate: examFor?.(c) })));
  const deckSession = sessionIds
    ? {
        cardIds: sessionIds,
        crumb: `${courseShort} · ${sourceFilter === "module" && currentModule ? currentModule.title || currentModule.label : "Flashcards"}`,
        onExit: () => setSessionIds(null),
        onToday: () => {
          setSessionIds(null);
          onGoHub?.("today");
        },
        topicOf: (c) => moduleTitles.get(c.moduleId) || courseShort,
      }
    : null;
```

  with:

```js
  const startSession = () => {
    setSessionExam(null);
    setSessionIds(sessionOrder(filteredCards, (c) => isCardDue(c, { examDate: examFor?.(c) })));
  };
  const closeSession = () => {
    setSessionIds(null);
    setSessionExam(null);
  };
  const deckCrumb = sourceFilter === "module" && currentModule ? currentModule.title || currentModule.label : "Flashcards";
  const deckSession = sessionIds
    ? {
        cardIds: sessionIds,
        crumb: `${courseShort} · ${sessionExam ? sessionExam.title : deckCrumb}`,
        exam: sessionExam,
        onExit: closeSession,
        onToday: () => {
          closeSession();
          onGoHub?.("today");
        },
        topicOf: (c) => moduleTitles.get(c.moduleId) || courseShort,
      }
    : null;
```

- [ ] **Step 7: Full check**

Run: `npx vitest run` — Expected: all pass.
Run: `npm run build` — Expected: build succeeds.
Code-read check (the user-course path needs the Electron bridge): Today START REVIEW → `runTodayAction` → `openCourseView(…, { item: "qz-deck", examUuid })` → `onTermNav` sets `examRequest` + `activeItem = "qz-deck"` → effect finds the exam in `exams`, clears the request, calls `pickExamCards`, opens `FlashcardDeck` with `session.exam`. Re-renders don't restart it (request is null after the first run). A non-exam `qz-deck` open (`DecksScreen`, Nova's weak-drill, rail) sets `examRequest` to null.

- [ ] **Step 8: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Today exam review opens an exam session

- EXAM_PREP action carries examUuid; runTodayAction passes it to the course deck
- UserCourseApp keeps it as a one-shot request; CourseContentArea picks the exam's cards and opens the session (exam title in the crumb)
- No cards in scope: deck list stays, Nova says examNoCards
```

Run: `git add src/features/today/priority.js src/features/today/priority.test.js src/features/today/runAction.js src/features/today/runAction.test.js src/hub/UserCourseApp.jsx src/hub/components/CourseContentArea.jsx; git commit -F .git/B1A_COMMIT_MSG`

---

### Task 5: FlashcardDeck exam mode, results summary, TD-09

**Files:**
- Modify: `src/study/flashcards/FlashcardDeck.jsx`
- Modify: `src/studyhub-bootstrap.css` (two rules after `.sh-results-extra`, ~line 10123)

**Interfaces:**
- Consumes from Task 1: `cardsInScope`, `isExamReady`, `pickExamCards`, `examOpening`, `examEnd`, `examNextStep`, `emitExamSession`.
- Consumes from Task 2: `courseStore.logStudySession({ …, kind: "exam", examUuid })`.
- Consumes from Task 4: `session.exam` (`{ uuid, title, dueDate, moduleIds }` or null/undefined; OM 300 never sets it).
- Consumes from the codebase: `examReadyPercent(cards)`, `daysUntilExam(date)`, `isCardDue(card, { examDate })` (`sm2.js`); `SessionResults` `extra` prop (rendered in `.sh-results-extra` under the summary).
- Produces: event `studyhub-exam-session` `{ phase: "open", key, vars }` once per mounted exam session and `{ phase: "end", key, vars }` at each results screen; CSS classes `.sh-results-exam`, `.sh-results-exam-ready`.

The pure logic is covered by Task 1's tests; this task is wiring, verified by build, code reading and the OM 300 browser check in Task 6.

- [ ] **Step 1: Imports and doc comment** — in `src/study/flashcards/FlashcardDeck.jsx`:

Replace

```js
import { RATINGS, daysUntilExam, examForCard, isCardDue, localDateString, previewIntervals, sm2 } from "../sm2.js";
```

with

```js
import { RATINGS, daysUntilExam, examForCard, examReadyPercent, isCardDue, localDateString, previewIntervals, sm2 } from "../sm2.js";
```

and after `import { masteryDeltas } from "../../session/results.js";` add:

```js
import { cardsInScope, emitExamSession, examEnd, examNextStep, examOpening, isExamReady, pickExamCards } from "../../session/examSession.js";
```

After `const NO_EXAM = () => null;` add:

```js
const readyIn = (cards, exam) => examReadyPercent(cardsInScope(cards, exam.moduleIds));
```

In the component's JSDoc, after the line ` * `onExit` closes it, `onToday` goes home, `topicOf(card)` groups the results' mastery change.` add:

```js
 * `session.exam` ({ uuid, title, dueDate, moduleIds }) makes it an exam session: Nova opens and closes
 * it, results show exam ready % before → after and the next session, and it logs as kind "exam".
```

- [ ] **Step 2: Exam state and ready-before** — replace

```js
  const { cards, cardsRef, isUserDeck, commit } = useDeckCards({ cards: externalCards, onSaveCards });
  const [run, setRun] = useState(() => startCardRun(session.cardIds));
```

with

```js
  const { cards, cardsRef, isUserDeck, commit } = useDeckCards({ cards: externalCards, onSaveCards });
  const targetExam = session.exam || null;
  const [run, setRun] = useState(() => startCardRun(session.cardIds));
  const [examResult, setExamResult] = useState(null);
```

and replace

```js
  const beforeRef = useRef(null);
  if (!beforeRef.current) {
    const ids = new Set(session.cardIds);
    beforeRef.current = cards.filter((c) => ids.has(cardKey(c)));
  }

  const cardsById = useMemo(() => new Map(cards.map((c) => [cardKey(c), c])), [cards]);
```

with

```js
  const beforeRef = useRef(null);
  if (!beforeRef.current) {
    const ids = new Set(session.cardIds);
    beforeRef.current = cards.filter((c) => ids.has(cardKey(c)));
  }
  const readyBeforeRef = useRef(null);
  if (targetExam && readyBeforeRef.current == null) readyBeforeRef.current = readyIn(cards, targetExam);
  const openedRef = useRef(false);

  const cardsById = useMemo(() => new Map(cards.map((c) => [cardKey(c), c])), [cards]);
  const runCards = useMemo(() => {
    const ids = new Set(run.order);
    return cards.filter((c) => ids.has(cardKey(c)));
  }, [cards, run.order]);
```

- [ ] **Step 3: Log the kind and exam** — replace the `logSession` callback with:

```js
  const logSession = useCallback(
    (r) => {
      if (loggedRef.current || !r?.rated) return;
      loggedRef.current = true;
      void courseStore.logStudySession({
        courseUuid: isUserDeck ? courseId : null,
        kind: targetExam ? "exam" : "drill",
        examUuid: targetExam?.uuid ?? null,
        startedAt: new Date(r.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        reviewed: r.rated,
        correct: r.correct,
        incorrect: r.rated - r.correct,
        bestCombo: r.best,
      });
    },
    [courseId, isUserDeck, targetExam]
  );
```

(`targetExam` is `CourseContentArea` state and stays the same object for the whole session, so the unmount-logging effect below doesn't re-run mid-session.)

- [ ] **Step 4: Opening line** — directly after `useEffect(() => () => logSession(runRef.current), [logSession]);` add:

```js
  useEffect(() => {
    if (!targetExam || openedRef.current) return;
    openedRef.current = true;
    const scope = cardsInScope(cardsRef.current, targetExam.moduleIds);
    emitExamSession({
      phase: "open",
      ...examOpening({
        title: targetExam.title,
        daysUntil: daysUntilExam(targetExam.dueDate),
        total: scope.length,
        due: scope.filter((c) => isCardDue(c, { examDate: examFor(c) })).length,
        readyPct: readyBeforeRef.current ?? 0,
      }),
    });
  }, [targetExam, cardsRef, examFor]);
```

- [ ] **Step 5: End summary on finish** — replace the `finish` callback with:

```js
  const finish = useCallback(
    (r) => {
      logSession(r);
      if (targetExam) {
        const scope = cardsInScope(cardsRef.current, targetExam.moduleIds);
        const before = readyBeforeRef.current ?? 0;
        const after = examReadyPercent(scope);
        const next = examNextStep({
          readyPct: after,
          daysUntil: daysUntilExam(targetExam.dueDate),
          notReady: scope.filter((c) => !isExamReady(c)).length,
          secondsPerCard: r.rated ? (Date.now() - r.startedAt) / 1000 / r.rated : null,
        });
        setExamResult({ before, after, next });
        emitExamSession({ phase: "end", ...examEnd({ title: targetExam.title, before, after }) });
      }
      setEndedAt(Date.now());
      setScreen("end");
    },
    [logSession, targetExam, cardsRef]
  );
```

(`rate` calls `commit` before `finish`, and `commit` updates `cardsRef.current` synchronously, so `after` includes the last rating.)

- [ ] **Step 6: Restart resets the exam baseline** — replace the `restart` callback with:

```js
  const restart = useCallback(
    (ids) => {
      if (!ids.length) return;
      const set = new Set(ids);
      beforeRef.current = cardsRef.current.filter((c) => set.has(cardKey(c)));
      if (targetExam) readyBeforeRef.current = readyIn(cardsRef.current, targetExam);
      sessionIdRef.current = newSessionId();
      loggedRef.current = false;
      const next = startCardRun(ids);
      runRef.current = next;
      setRun(next);
      setFlipped(false);
      setEndedAt(null);
      setExamResult(null);
      setScreen("play");
    },
    [cardsRef, targetExam]
  );
```

- [ ] **Step 7: Another round re-picks exam cards** — replace

```js
  const anotherRound = () => {
    const filtered = filterDeck(cardsRef.current, sourceFilter, moduleId, { examFor });
    const ids = sessionOrder(filtered, (c) => isCardDue(c, { examDate: examFor(c) }));
    restart(ids.length ? ids : sessionOrder(beforeRef.current, () => true));
  };
```

with

```js
  const anotherRound = () => {
    const isDue = (c) => isCardDue(c, { examDate: examFor(c) });
    const ids = targetExam
      ? pickExamCards(cardsRef.current, targetExam, { isDue })
      : sessionOrder(filterDeck(cardsRef.current, sourceFilter, moduleId, { examFor }), isDue);
    restart(ids.length ? ids : sessionOrder(beforeRef.current, () => true));
  };
```

- [ ] **Step 8: Results — TD-09 and the extra slot** — in the `<SessionResults … />` props replace

```jsx
          deltas={session.topicOf ? masteryDeltas(beforeRef.current, cards.filter((c) => run.order.includes(cardKey(c))), session.topicOf) : []}
```

with

```jsx
          deltas={session.topicOf ? masteryDeltas(beforeRef.current, runCards, session.topicOf) : []}
          extra={
            examResult ? (
              <div className="sh-results-exam">
                <span className="sh-results-exam-ready">
                  READY {examResult.before}% → {examResult.after}%
                </span>
                <span>{examResult.next.text}</span>
              </div>
            ) : null
          }
```

- [ ] **Step 9: CSS** — in `src/studyhub-bootstrap.css`, directly after

```css
.sh-results-extra {
  margin-top: 6px;
}
```

add:

```css
/* Exam session: ready % change and the next session, under the results summary */
.sh-results-exam {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--sh-font-mono);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--sh-text-2);
}

.sh-results-exam-ready {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--sh-accent-2);
}
```

- [ ] **Step 10: Full check**

Run: `npx vitest run` — Expected: all pass.
Run: `npm run build` — Expected: build succeeds.
Run: `rg -n "run.order.includes" src` — Expected: no matches.
Code-read check for OM 300: `BuiltinCourseApp` renders `<FlashcardDeck sourceFilter={deckMode} session={deckSession} />` with no `exam` in `deckSession`, so `targetExam` is null: no events, `kind: "drill"`, `examUuid: null`, no `extra`, `anotherRound` takes the old branch.

- [ ] **Step 11: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Exam mode in the flashcard session

- session.exam: Nova's opening line on start, closing line at results, logged as kind exam with examUuid
- Results show READY before -> after and the next session (exam today / exam-ready / tomorrow ~n cards)
- Another round re-picks exam cards and stays an exam session
- TD-09: results mastery filter uses a memoized Set instead of run.order.includes
```

Run: `git add src/study/flashcards/FlashcardDeck.jsx src/studyhub-bootstrap.css; git commit -F .git/B1A_COMMIT_MSG`

---

### Task 6: Docs and verification

**Files:**
- Modify: `docs/ROADMAP.md` (2.3 entry, ~line 131)
- Modify: `docs/PRODUCT_BACKLOG.md` (EXAM-003 to Done; delete TD-05 and TD-09 rows)
- Create (not committed): `.superpowers/b1a/om300-drill.py`

**Interfaces:**
- Consumes: everything above.
- Produces: shipped docs; verification evidence for the report.

- [ ] **Step 1: ROADMAP** — in `docs/ROADMAP.md` replace

```markdown
- **2.3 Nova runs the session** (EXAM-003): opening line from a local template built from DB
  facts (Haiku may rephrase); 10–20 exam cards, due first; logged to `study_sessions`; end
  summary with cards done, exam ready % change, suggested next session.
```

with

```markdown
- ✓ **2.3 Nova runs the session** (EXAM-003): opening line from a local template built from DB
  facts (Haiku may rephrase); 10–20 exam cards, due first; logged to `study_sessions`; end
  summary with cards done, exam ready % change, suggested next session.
  Shipped notes: START REVIEW on a Today exam opens the course's full-window flashcard session with
  the exam's cards: due first (shuffled, at most 20), topped up to 10 with not-ready cards (never
  rated first, then lowest grade); a smaller scope runs whole, an empty one leaves the deck list up
  and Nova says so. Nova speaks the opening and closing lines from her lane via the
  `studyhub-exam-session` event (Zombies has its own lines). Results show READY before → after and the
  next session; on exam day "Exam today" wins over "Exam-ready". Another round re-picks exam cards.
  Sessions log `kind = 'exam'` with `study_sessions.exam_uuid` (migration 12); ready history isn't
  stored. Nova's quiz has no exam mode yet; head-anchored staging is C.7 (B1b).
```

- [ ] **Step 2: Backlog** — in `docs/PRODUCT_BACKLOG.md`:
  - In the `## Done` table, after the `| UI-005 | … |` row, add:

```markdown
| EXAM-003 | Nova runs the exam session: Today exam opens 10–20 exam-scoped cards, template opening/closing lines (Haiku may rephrase), ready % change + next session on results, logged with `exam_uuid` (Phase 2.30) |
```

  - In `## Phase 2 — Exam prep`, delete the row starting `| EXAM-003 |`.
  - In the tech-debt table, delete the rows starting `| TD-05 |` and `| TD-09 |`.

Check: `rg -n "TD-05|TD-09" docs/PRODUCT_BACKLOG.md` returns nothing; `rg -n "EXAM-003" docs/PRODUCT_BACKLOG.md` returns only the Done row.

- [ ] **Step 3: Unit tests, build, DB check**

Run: `npx vitest run` — Expected: all test files pass (including `src/session/examSession.test.js`, `src/companion/examLines.test.js`, `src/features/today/runAction.test.js`).
Run: `npm run build` — Expected: build succeeds; `rg -n "officeparser" dist/assets` returns nothing.
Run: `npm run check:db` — Expected: `check-db ok`.
Run: `rg -n "console\.(log|error)" src/session/examSession.js src/companion/hooks/useNovaExamSession.js src/study/flashcards/FlashcardDeck.jsx src/hub/components/CourseContentArea.jsx` — Expected: no matches.

- [ ] **Step 4: OM 300 drill still rates and finishes (browser)** — create `.superpowers/b1a/om300-drill.py` (not committed):

```python
"""OM 300 drill: open the deck, rate one card, leave early, results show without an exam summary."""
import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:5173"
errors = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector(".sh-setup", state="visible", timeout=15000)
        page.locator(".sh-setup-done").click()
        page.wait_for_selector(".sh-rail", timeout=10000)
        view = json.dumps({"courseId": "builtin", "item": "qz-deck"})
        page.evaluate(f"sessionStorage.setItem('studyhub.pendingCourseView', {json.dumps(view)})")
        page.keyboard.press("Control+k")
        page.wait_for_selector(".sh-palette-input", state="visible", timeout=5000)
        page.locator(".sh-palette-input").fill("OM 300")
        page.locator(".sh-palette-row--courses", has_text="OM 300").first.click()
        page.get_by_role("button", name="Start session").click()
        page.wait_for_selector(".sh-flashcard", state="visible", timeout=10000)
        page.keyboard.press("Space")
        page.wait_for_selector(".sh-ratings", state="visible", timeout=5000)
        page.keyboard.press("3")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape")
        page.wait_for_selector(".sh-results", state="visible", timeout=5000)
        if page.locator(".sh-results-exam").count():
            print("FAIL: OM 300 results show an exam summary")
            sys.exit(1)
        browser.close()
    if errors:
        print("FAIL: page/console errors:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    print("om300 drill ok")


if __name__ == "__main__":
    main()
```

Run: `$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 90 -- python .superpowers/b1a/om300-drill.py`
Expected: `om300 drill ok`. If a selector has drifted (palette row, Start session button), fix the script, not the app, and say so in the report.

- [ ] **Step 5: Nova smoke**

Run: `$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 90 -- python scripts/nova-smoke.py`
Expected: `nova smoke ok`.

The user-course exam path needs the Electron bridge (no courses or exams in the plain browser); it is verified by Task 1's tests plus the code-read checks in Tasks 4 and 5. State that in the report.

- [ ] **Step 6: Commit** — write `.git/B1A_COMMIT_MSG`:

```text
Phase 2.30 — Docs: Nova runs the exam session

- ROADMAP: 2.3 shipped with notes
- Backlog: EXAM-003 done; TD-05 (already gone) and TD-09 rows removed
```

Run: `git add docs/ROADMAP.md docs/PRODUCT_BACKLOG.md; git commit -F .git/B1A_COMMIT_MSG`

---

## Self-review

**Spec coverage**
- §1 Launch: priority action with `examUuid` (Task 4 Step 3), `runAction` (Task 4 Step 3), `UserCourseApp` one-shot request (Task 4 Step 5), `CourseContentArea` starts from it (Task 4 Step 6). Nova drop on an exam row: unchanged (clicks the same button).
- §2 Card pick: `pickExamCards` with scope, due-first shuffled cap, not-ready top-up order, small scope, empty → deck list + `examNoCards` (Task 1, Task 4 Step 6d). `cardsInScope` moved, `examEstimate` re-exports (Task 1 Step 5).
- §3 Opening: `examOpening` + 3 day variants (Task 1), Nova + Zombies keys (Task 3), `line()` → `maybeRephrase()` → `core.say` via `studyhub-exam-session` (Task 3 hook, Task 5 Step 4).
- §4 End summary: READY before → after in `extra` (Task 5 Step 8), `examNextStep` (Task 1), `examEndUp/Flat/Ready` (Tasks 1, 3, 5).
- §5 Logging: migration 12, handler, `kind`/`examUuid` from `FlashcardDeck` (Tasks 2, 5); another round re-picks (Task 5 Step 7).
- §6 TD-09: memoized Set (Task 5 Step 8); backlog TD-05/TD-09 rows deleted (Task 6).
- Testing: vitest for pick/opening/next step (Task 1), check:db (Task 2), OM 300 browser drill + Nova smoke (Task 6).

**Placeholder scan:** none; every code step has full code.

**Type consistency:** `pickExamCards(cards, exam, { isDue })` (Tasks 1, 4, 5); `examOpening` vars `{ title, days, total, due, ready }` match the line placeholders (Task 3); `examEnd` vars `{ title, before, after }` match; `examNextStep({ readyPct, daysUntil, notReady, secondsPerCard })` (Tasks 1, 5); `session.exam` (Tasks 4, 5); `examRequest` / `onExamRequestDone` (Task 4); event detail `{ phase, key, vars }` (Tasks 1, 3, 4, 5).
