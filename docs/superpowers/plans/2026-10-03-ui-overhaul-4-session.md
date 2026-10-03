# UI Overhaul 4 — Nova Session Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development to execute this plan task by task.

**Goal:** Quizzes and flashcard drills run in one full-window **session** view: top strip (course · topic, shield meter, n/N, `Esc`, progress line), the question or card center-left, Nova full size on the right. A Halo Reach style shield meter absorbs misses, a results screen closes every session, and completed sessions add tally marks toward rounds.

**Architecture:** Pure logic lives in `src/session/` (shield reducer, medals, results copy, rounds) and `src/study/sm2.js` (rating previews), all unit-tested. `SessionShell` is a presentational frame portaled into `.sh-frame-main`; while mounted it publishes `session` to `ShellContext`, which collapses the rail and switches Nova to a larger session lane. The quiz (`QuizPanel`, still owned by `CompanionLayer`) and the flashcard drill (`FlashcardDeck`, owned by the course apps) each render inside `SessionShell` and share `ShieldMeter` and `SessionResults`. Inline course decks become a card list with a **Start session** button.

**Tech Stack:** React 18, Vite, vitest, Playwright (verification).

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` §1.5, §2.5 (Session), §3, §3.1, §6, §7. Mockups: `.superpowers/ui-review/bs-v5-16-full.png` (quiz), `bs-v5-16-hit.png`, `bs-v5-16-down.png` (shield states), `bs-v5-20-front.png`, `bs-v5-20-back.png` (flashcards), `bs-v5-20-results.png` (results). Source HTML for the shield animation: `.superpowers/brainstorm/476-1790888796/content/session-v19.html` and `cards-v20.html` (copy their CSS technique, re-expressed in `--sh-*` tokens).

**Decisions made with the user for this step:**
1. **One session view for both.** "Quiz me" (radial menu, `/quiz`, bar button) and course decks open the session. The inline course deck (user courses and OM 300 "Flashcards & drill") becomes a browse/edit **card list** with **Start session**; the Plan 3 deck mode chips above it choose which cards the session gets.
2. **Four ratings** Again / Hard / Good / Easy, keys `1`–`4`, SM-2 grades **1 / 3 / 4 / 5**, each button showing its next interval from `sm2()`. `K` stays a shortcut for Good, `A` for Again.
3. **Quiz modes stay** (Quick, Streak, Weak spots, Clock). Streak mode's 3 lives are replaced by the health bar: **every mode ends when health reaches 0**; Quick/Weak also end when out of cards, Clock when time runs out.

**Decisions made by the planner (flagged to the user):**
4. Results title is `ROUND N COMPLETE` only when this session's mark closes a round (5th mark); otherwise `SESSION COMPLETE`. The tally beside it always shows the marks in the current round, the new one glowing.
5. Only completed sessions add tally marks in this plan (Today items adding marks lands with the Plan 5 screen shells). Rounds are stored in the SQLite settings table (key `session.rounds`), like companion state.
6. A **Skip** in the quiz moves on without grading: no SM-2 write, no shield change, not counted as answered.
7. **Rating modifiers** (chosen by the user during Task 4): classic SM-2 gives Hard/Good/Easy the same next interval, so `sm2()` applies Hard ×0.8 (min 1 day), Good ×1, Easy ×1.3 to passing intervals before the exam cap. Applies to quiz grades too (Task 5).

## Global Constraints

- Tokens only (`--sh-*`, `color-mix()` over tokens). Radius 0. Michroma always weight 400, uppercase, `letter-spacing: 0.06em`.
- `--sh-accent` is the only interactive accent. `--sh-accent-2` (magenta) only for: exam tags, the progress/mastery gradient end, card corner marks, the example rule on a card back, `Q n / N` label. Health chunks use `--sh-danger`; Hard rating edge `--sh-warn`.
- Labels/codes/numbers in `--sh-font-mono`, 11px minimum. Card front term 28–30px/600 `--sh-font-body`; question prompt 22–24px/600.
- Motion via `html[data-motion="reduced"]` selectors or `useReducedMotion()` from `src/shell/motion.js`; never `@media (prefers-reduced-motion)`. Durations (spec §1.5): hover 150ms, panels 160ms, shield snap 120ms, trail drain 650ms after a 450ms delay, recharge 1.5s. Reduced motion: no ripple, sweep, shake or flash; values change instantly.
- Glow only on the single most important element on screen (session: the shield bar; results: the new tally mark).
- Shield rules (spec §3.1): shields absorb misses; 3 correct in a row recharge to full; health drops only while shields are down; each lost health chunk re-queues that card at the end of the session. Never touches grades or SM-2 scheduling beyond the normal per-answer write.
- Keyboard: every handler checks `paletteOpen()` (`src/lib/hotkeys.js`) and ignores typing targets (`isTypingTarget`). Flashcards keep the 200ms flip debounce via ref and ignore keys while a rating is in flight. `Esc` ends the session (results if anything was answered, else close).
- No `console.*`. Do not edit OM 300 content (`src/study/sections/*`, `src/study/final/*` content, `src/glossary/courseData.js`).
- Data writes keep their existing code paths: user decks `db.mastery.update` via `FlashcardDeck`'s current calls, OM 300 `persistFlashcardDeck`, quiz `onQuizAnswer`/`onQuizFinish` in `useNovaQuiz.js`. No schema change. localStorage only for UI prefs.
- Keep `data-sprite-avoid` on the session panel and results so Nova's safe zones avoid them.
- Every task ends with `npm run test` and `npm run build` passing.
- Commit format: `Phase 2.25 — Short description` + bullets, UTF-8 without BOM, `git commit -F <file>`. Stage only files you changed.
- Visual checks: throwaway Playwright scripts under `.superpowers/ui-review/task4-N/` (not committed), launched with the GPU flags: `sys.path.insert(0, ".superpowers/ui-review"); from tour import GPU_ARGS` then `p.chromium.launch(headless=True, args=GPU_ARGS)`. Run with `python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 90 -- python <script>` and `$env:PYTHONIOENCODING="utf-8"`. The browser build has no `window.studyHub`: user courses don't persist, so use the OM 300 deck (seeded in localStorage) for flashcard checks and create a manual course in-page when a user course is needed.

---

### Task 1: Session logic (shield, medals, results copy, rounds, rating previews)

**Files:**
- Create: `src/session/shield.js`, `src/session/shield.test.js`, `src/session/results.js`, `src/session/results.test.js`, `src/session/rounds.js`, `src/session/rounds.test.js`
- Modify: `src/study/sm2.js`, `src/study/sm2.test.js`

**Interfaces (produced, used by Tasks 2–5):**

```js
// src/session/shield.js
export const SHIELD_MAX = 100, SHIELD_HIT = 35, HEALTH_MAX = 10, RECHARGE_STREAK = 3;
/** @typedef {{ shield:number, health:number, sinceHit:number, wentDown:boolean, downCount:number, lostChunks:number, last:null|"hit"|"down"|"health"|"recharge" }} ShieldState */
export function initShield() /* -> ShieldState */;
export function applyAnswer(state, correct) /* -> ShieldState; last === "health" means re-queue the card */;
export function shieldStatus(state) /* -> "STABLE" | "HIT · RECHARGE IN n" | "SHIELDS DOWN" */;
export function isDepleted(state) /* -> boolean (health === 0) */;
export const MEDAL_MIN = 5;
export function earnedMedals({ answered, correct, best, wentDown }) /* -> [{ id, label, detail, badge? }] */;

// src/session/results.js
export function masteryDeltas(before, after, topicOf) /* -> [{ topic, before, after, delta }] */;
export function resultSummary({ wentDown, downCount, comeBack }) /* -> string */;
export function formatDuration(ms) /* -> "7:42" | "1:02:03" */;

// src/session/rounds.js
export const MARKS_PER_ROUND = 5;
export function roundInfo(marks) /* -> { round, inRound } */;
export function addMark(marks) /* -> { marks, round, inRound, closedRound: number|null } */;
export async function loadRounds() /* -> { marks, round, inRound } */;
export async function recordMark() /* -> { marks, round, inRound, closedRound } */;

// src/study/sm2.js additions
export const RATINGS; // [{ id, label, grade, key }] Again 1 "1", Hard 3 "2", Good 4 "3", Easy 5 "4"
export function intervalLabel(days, beforeExam = false) /* -> "1 day" | "6 days" | "4 days · before exam" */;
export function previewIntervals(card, { examDate = null, now = new Date() } = {}) /* -> [{ ...rating, days, beforeExam, label }] */;
```

- [ ] **Step 1: Write the failing tests.**

`src/session/shield.test.js`:

```js
import { describe, expect, it } from "vitest";
import { HEALTH_MAX, SHIELD_MAX, applyAnswer, earnedMedals, initShield, isDepleted, shieldStatus } from "./shield.js";

const run = (answers, s = initShield()) => answers.reduce((acc, ok) => applyAnswer(acc, ok), s);

describe("shield", () => {
  it("starts full and stable", () => {
    const s = initShield();
    expect(s).toMatchObject({ shield: SHIELD_MAX, health: HEALTH_MAX, wentDown: false, last: null });
    expect(shieldStatus(s)).toBe("STABLE");
  });

  it("absorbs misses until the shield is down", () => {
    expect(run([false]).shield).toBe(65);
    expect(run([false]).last).toBe("hit");
    expect(shieldStatus(run([false]))).toBe("HIT · RECHARGE IN 3");
    expect(run([false, false]).shield).toBe(30);
    const down = run([false, false, false]);
    expect(down).toMatchObject({ shield: 0, health: HEALTH_MAX, wentDown: true, downCount: 1, last: "down" });
    expect(shieldStatus(down)).toBe("SHIELDS DOWN");
  });

  it("drops health only while shields are down and flags a re-queue", () => {
    const s = run([false, false, false, false]);
    expect(s).toMatchObject({ shield: 0, health: HEALTH_MAX - 1, lostChunks: 1, last: "health" });
  });

  it("recharges to full after three correct in a row", () => {
    const hit = run([false, true, true]);
    expect(hit.shield).toBe(65);
    expect(shieldStatus(hit)).toBe("HIT · RECHARGE IN 1");
    const full = applyAnswer(hit, true);
    expect(full).toMatchObject({ shield: SHIELD_MAX, last: "recharge" });
    expect(shieldStatus(full)).toBe("STABLE");
  });

  it("a miss resets the recharge count", () => {
    expect(run([false, true, true, false, true, true]).shield).toBe(30);
  });

  it("correct answers at full shield change nothing visible", () => {
    expect(run([true, true, true, true])).toMatchObject({ shield: SHIELD_MAX, last: null });
  });

  it("is depleted at zero health and never goes below", () => {
    const s = run(Array(3 + HEALTH_MAX + 2).fill(false));
    expect(s.health).toBe(0);
    expect(isDepleted(s)).toBe(true);
    expect(s.downCount).toBe(1);
  });

  it("counts each time the shields go down", () => {
    expect(run([false, false, false, true, true, true, false, false, false]).downCount).toBe(2);
  });
});

describe("earnedMedals", () => {
  it("needs a minimum number of answers", () => {
    expect(earnedMedals({ answered: 4, correct: 4, best: 4, wentDown: false })).toEqual([]);
  });

  it("awards unbroken, perfect and streak", () => {
    const ids = earnedMedals({ answered: 6, correct: 6, best: 6, wentDown: false }).map((m) => m.id);
    expect(ids).toEqual(["unbroken", "perfect", "streak"]);
  });

  it("streak medal carries the count", () => {
    const m = earnedMedals({ answered: 10, correct: 8, best: 6, wentDown: true });
    expect(m).toEqual([{ id: "streak", label: "Streak", detail: "6 clean in a row", badge: "6×" }]);
  });
});
```

`src/session/results.test.js`:

```js
import { describe, expect, it } from "vitest";
import { formatDuration, masteryDeltas, resultSummary } from "./results.js";

const mastered = { repetitions: 3, easeFactor: 2.5 };
const fresh = { repetitions: 0, easeFactor: 2.5 };

describe("masteryDeltas", () => {
  it("compares mastery per topic, biggest gain first", () => {
    const before = [
      { id: 1, t: "A", ...fresh },
      { id: 2, t: "A", ...fresh },
      { id: 3, t: "B", ...fresh },
    ];
    const after = [
      { id: 1, t: "A", ...mastered },
      { id: 2, t: "A", ...fresh },
      { id: 3, t: "B", ...mastered },
    ];
    expect(masteryDeltas(before, after, (c) => c.t)).toEqual([
      { topic: "B", before: 0, after: 100, delta: 100 },
      { topic: "A", before: 0, after: 50, delta: 50 },
    ]);
  });

  it("skips cards without a topic", () => {
    expect(masteryDeltas([{ ...fresh }], [{ ...mastered }], () => "")).toEqual([]);
  });
});

describe("resultSummary", () => {
  it("held shields, cards back tomorrow", () => {
    expect(resultSummary({ wentDown: false, downCount: 0, comeBack: 2 })).toBe("Shields held the whole way. Two cards come back tomorrow.");
  });
  it("went down once, one card", () => {
    expect(resultSummary({ wentDown: true, downCount: 1, comeBack: 1 })).toBe("Shields went down once. One card comes back tomorrow.");
  });
  it("went down several times, nothing tomorrow", () => {
    expect(resultSummary({ wentDown: true, downCount: 3, comeBack: 0 })).toBe("Shields went down 3 times.");
  });
  it("uses digits above nine", () => {
    expect(resultSummary({ wentDown: false, downCount: 0, comeBack: 12 })).toBe("Shields held the whole way. 12 cards come back tomorrow.");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(462000)).toBe("7:42");
    expect(formatDuration(5000)).toBe("0:05");
    expect(formatDuration(3723000)).toBe("1:02:03");
    expect(formatDuration(-1)).toBe("0:00");
  });
});
```

`src/session/rounds.test.js`:

```js
import { describe, expect, it } from "vitest";
import { addMark, roundInfo } from "./rounds.js";

describe("rounds", () => {
  it("starts in round one", () => {
    expect(roundInfo(0)).toEqual({ round: 1, inRound: 0 });
  });
  it("five marks make a round", () => {
    expect(roundInfo(4)).toEqual({ round: 1, inRound: 4 });
    expect(roundInfo(5)).toEqual({ round: 2, inRound: 0 });
    expect(roundInfo(12)).toEqual({ round: 3, inRound: 2 });
  });
  it("addMark reports the round it closed", () => {
    expect(addMark(3)).toEqual({ marks: 4, round: 1, inRound: 4, closedRound: null });
    expect(addMark(4)).toEqual({ marks: 5, round: 2, inRound: 0, closedRound: 1 });
    expect(addMark(14)).toEqual({ marks: 15, round: 4, inRound: 0, closedRound: 3 });
  });
});
```

Append to `src/study/sm2.test.js` (it already defines `NOW = new Date(2026, 9, 5, 9, 0)`; add `RATINGS, intervalLabel, previewIntervals` to its import from `./sm2.js`):

```js
describe("previewIntervals", () => {
  const card = { repetitions: 2, intervalDays: 6, easeFactor: 2.5 };

  it("maps the four ratings to SM-2 grades", () => {
    expect(RATINGS.map((r) => [r.label, r.grade, r.key])).toEqual([
      ["Again", 1, "1"],
      ["Hard", 3, "2"],
      ["Good", 4, "3"],
      ["Easy", 5, "4"],
    ]);
  });

  it("shows each rating's next interval", () => {
    expect(previewIntervals(card, { now: NOW }).map((p) => p.label)).toEqual(["1 day", "15 days", "15 days", "15 days"]);
  });

  it("marks intervals capped by an exam", () => {
    const p = previewIntervals(card, { examDate: "2026-10-10", now: NOW });
    expect(p.map((x) => x.label)).toEqual(["1 day", "4 days · before exam", "4 days · before exam", "4 days · before exam"]);
    expect(p[0].beforeExam).toBe(false);
  });

  it("labels singular and plural days", () => {
    expect(intervalLabel(1)).toBe("1 day");
    expect(intervalLabel(6)).toBe("6 days");
    expect(intervalLabel(3, true)).toBe("3 days · before exam");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/session src/study/sm2.test.js` → FAIL (modules missing).

- [ ] **Step 3: Implement.**

`src/session/shield.js`:

```js
export const SHIELD_MAX = 100;
export const SHIELD_HIT = 35;
export const HEALTH_MAX = 10;
export const RECHARGE_STREAK = 3;
export const MEDAL_MIN = 5;

export function initShield() {
  return { shield: SHIELD_MAX, health: HEALTH_MAX, sinceHit: RECHARGE_STREAK, wentDown: false, downCount: 0, lostChunks: 0, last: null };
}

/** Shields absorb misses; health drops only while they are down (last === "health" re-queues the card). */
export function applyAnswer(state, correct) {
  if (correct) {
    const sinceHit = state.sinceHit + 1;
    if (state.shield < SHIELD_MAX && sinceHit >= RECHARGE_STREAK) return { ...state, sinceHit, shield: SHIELD_MAX, last: "recharge" };
    return { ...state, sinceHit, last: null };
  }
  if (state.shield > 0) {
    const shield = Math.max(0, state.shield - SHIELD_HIT);
    if (shield === 0) return { ...state, shield, sinceHit: 0, wentDown: true, downCount: state.downCount + 1, last: "down" };
    return { ...state, shield, sinceHit: 0, last: "hit" };
  }
  if (state.health === 0) return { ...state, sinceHit: 0, last: null };
  return { ...state, sinceHit: 0, health: state.health - 1, lostChunks: state.lostChunks + 1, last: "health" };
}

export function shieldStatus(state) {
  if (state.shield === 0) return "SHIELDS DOWN";
  if (state.shield < SHIELD_MAX) return `HIT · RECHARGE IN ${RECHARGE_STREAK - state.sinceHit}`;
  return "STABLE";
}

export function isDepleted(state) {
  return state.health === 0;
}

export function earnedMedals({ answered, correct, best, wentDown }) {
  if (answered < MEDAL_MIN) return [];
  const out = [];
  if (!wentDown) out.push({ id: "unbroken", label: "Unbroken", detail: "Shields never went down" });
  if (correct === answered) out.push({ id: "perfect", label: "Perfect", detail: `${answered} for ${answered}` });
  if (best >= 5) out.push({ id: "streak", label: "Streak", detail: `${best} clean in a row`, badge: `${best}×` });
  return out;
}
```

`src/session/results.js`:

```js
import { masteryPercent } from "../study/sm2.js";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** Mastery (sm2 masteryPercent) per topic before and after the session, biggest gain first. */
export function masteryDeltas(before, after, topicOf) {
  const group = (cards) => {
    const m = new Map();
    for (const c of cards || []) {
      const t = topicOf(c);
      if (!t) continue;
      if (!m.has(t)) m.set(t, []);
      m.get(t).push(c);
    }
    return m;
  };
  const b = group(before);
  const a = group(after);
  return [...a.keys()]
    .map((topic) => {
      const was = masteryPercent(b.get(topic) || []);
      const now = masteryPercent(a.get(topic));
      return { topic, before: was, after: now, delta: now - was };
    })
    .sort((x, y) => y.delta - x.delta);
}

export function resultSummary({ wentDown, downCount, comeBack }) {
  const shields = !wentDown ? "Shields held the whole way." : downCount === 1 ? "Shields went down once." : `Shields went down ${downCount} times.`;
  if (!comeBack) return shields;
  const n = comeBack < WORDS.length ? WORDS[comeBack] : String(comeBack);
  return `${shields} ${n} ${comeBack === 1 ? "card comes" : "cards come"} back tomorrow.`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
```

`src/session/rounds.js`:

```js
export const MARKS_PER_ROUND = 5;
const KEY = "session.rounds";

export function roundInfo(marks) {
  return { round: Math.floor(marks / MARKS_PER_ROUND) + 1, inRound: marks % MARKS_PER_ROUND };
}

export function addMark(marks) {
  const next = marks + 1;
  const info = roundInfo(next);
  return { marks: next, ...info, closedRound: info.inRound === 0 ? info.round - 1 : null };
}

let memoryMarks = 0; // browser build without the Electron bridge

async function readMarks() {
  const settings = window.studyHub?.db?.settings;
  if (!settings?.get) return memoryMarks;
  try {
    return Math.max(0, Number(JSON.parse((await settings.get(KEY)) || "0")) || 0);
  } catch {
    return 0;
  }
}

export async function loadRounds() {
  const marks = await readMarks();
  return { marks, ...roundInfo(marks) };
}

export async function recordMark() {
  const result = addMark(await readMarks());
  memoryMarks = result.marks;
  try {
    await window.studyHub?.db?.settings?.set?.({ key: KEY, value: JSON.stringify(result.marks) });
  } catch {
    /* the mark still shows this session */
  }
  return result;
}
```

Add to `src/study/sm2.js` (after `sm2`):

```js
export const RATINGS = Object.freeze([
  { id: "again", label: "Again", grade: 1, key: "1" },
  { id: "hard", label: "Hard", grade: 3, key: "2" },
  { id: "good", label: "Good", grade: 4, key: "3" },
  { id: "easy", label: "Easy", grade: 5, key: "4" },
]);

export function intervalLabel(days, beforeExam = false) {
  return `${days} ${days === 1 ? "day" : "days"}${beforeExam ? " · before exam" : ""}`;
}

/** What each rating would schedule, for the rating buttons. Pure: calls sm2 without writing. */
export function previewIntervals(card, { examDate = null, now = new Date() } = {}) {
  return RATINGS.map((r) => {
    const days = sm2(card, r.grade, { examDate, now }).intervalDays;
    const beforeExam = !!examDate && days < sm2(card, r.grade, { now }).intervalDays;
    return { ...r, days, beforeExam, label: intervalLabel(days, beforeExam) };
  });
}
```

- [ ] **Step 4:** `npx vitest run src/session src/study/sm2.test.js` → PASS. Then `npm run test`, `npm run build`.
- [ ] **Step 5:** Commit `Phase 2.25 — Session logic: shield, medals, rounds, rating previews`.

---

### Task 2: Shield meter

**Files:**
- Create: `src/session/ShieldMeter.jsx`
- Modify: `src/studyhub-bootstrap.css`

**Interfaces:**
- Consumes: `ShieldState`, `shieldStatus`, `SHIELD_MAX`, `HEALTH_MAX` from Task 1.
- Produces: `ShieldMeter({ state, label = null })` — `state` is a `ShieldState`; `label` overrides the center readout (results use `"SHIELDS HELD"`). Root `div.sh-shield` with `role="meter"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow={state.shield}`, `aria-label="Shields"`.

**Markup and look** (match `bs-v5-16-full.png`, `bs-v5-16-hit.png`, `bs-v5-16-down.png`, `bs-v5-20-front.png`; copy technique from `session-v19.html`):
- Width 300px, centered in the top strip. Top: fine scale (ticks every 10%, tall ticks at 0/50/100), 1px `--sh-border-strong`.
- **Shield bar:** one continuous bar, 14px tall, hairline frame (1px `--sh-accent-line`) with angled ends (`clip-path: polygon(...)` on the frame, ~8px bevel). Fill `--sh-accent` with a soft glow (`--sh-glow-accent`), an animated energy ripple (repeating gradient moving horizontally, ~3s loop) and an occasional light sweep (a bright band crossing every ~6s). The fill **drains from both ends toward the center**: render the fill centered with `width: {shield}%` and `margin: 0 auto` (transition `width 120ms` = shield snap).
- **Trail:** a pale layer (`color-mix(in srgb, var(--sh-text) 35%, transparent)`) behind the fill keeps the previous width, then drains to the new width over 650ms after 450ms (`transition: width 650ms 450ms`). Implement by keeping `trailWidth` state that updates to the new value in an effect (CSS delay does the lingering).
- **Hit** (`state.last === "hit"` or `"down"`, triggered on each change of the `state` object identity): white flash on the bar (100ms), small horizontal shake of the meter (4px, 240ms), ripple speeds up for ~1s. Re-trigger by toggling a `data-hit` attribute with a key or `animationend` reset.
- **Recharge** (`state.last === "recharge"`): fill grows outward from the center over 1.5s with bright edges (`box-shadow` on the fill edges), then settles.
- **Health:** 10 skewed chunks (`transform: skewX(-20deg)`, 18×6px, 3px gap) centered beneath the bar; filled = `--sh-danger`; lost = transparent with 1px `--sh-danger` outline. When shields are down: the frame pulses slowly in `--sh-danger` (2s loop) and the last remaining chunk blinks (1s).
- **Readouts** below (mono 11px, `--sh-text-3`, values `--sh-text`): `SHIELD 100` left, status center (`shieldStatus(state)` or `label`), `HEALTH 10/10` right (the `10` in `--sh-danger`).
- Reduced motion (`html[data-motion="reduced"]`): no ripple, sweep, shake, flash, pulse or blink; widths change without transition.

- [ ] **Step 1:** Implement the component and CSS.
- [ ] **Step 2:** Temporarily mount the meter in `TitleBar` when the URL has `?shield=<answers>` (`0` = miss, `1` = correct; e.g. `?shield=011` replayed through `applyAnswer` with a 900ms gap so the hit and trail animate). Throwaway check `.superpowers/ui-review/task4-2/check.py`: screenshots (clip around the meter) for full, one hit (65, mid-trail and settled), shields down (`000`), down with health lost (`00000`, health 8), recharge (`0111`), and one with `html[data-motion="reduced"]`. Compare with the mockups. Remove the temporary mount before committing.
- [ ] **Step 3:** `npm run test`, `npm run build`. Commit `Phase 2.25 — Shield meter`.

---

### Task 3: Session shell and Nova's session placement

**Files:**
- Create: `src/session/SessionShell.jsx`
- Modify: `src/shell/ShellContext.jsx`, `src/shell/AppRail.jsx`, `src/shell/NovaLane.jsx`, `src/app/StudyHubApp.jsx`, `src/companion/CompanionLayer.jsx`, `src/companion/hooks/useNovaQuiz.js`, `src/companion/hooks/useNovaInput.js` (only the resize jump to `dockPoint()`), `src/studyhub-bootstrap.css`

**Interfaces:**
- Consumes: `ShieldMeter` (Task 2), `loadRounds` (Task 1).
- Produces:

```js
// ShellContext additions
session: { kind: "quiz" | "cards" } | null
setSession(next | null)

// SessionShell
SessionShell({ crumb, shield, counter, progress, onExit, children })
//  crumb: string            e.g. "MIS 430 · USE CASES" (rendered uppercase, mono 11px, --sh-text-3)
//  shield: ShieldState|null  null hides the meter (setup screen)
//  counter: string|null     e.g. "Q 3/10" | "CARD 14/25" (round prefix is added by the shell)
//  progress: number|null    0..1, null hides the line
//  onExit: () => void       Esc button + Escape key (the child panels own Escape; the shell only renders the button)
//  kind: "quiz" | "cards"   published to ShellContext.session
```

**SessionShell:**
- Portaled into `.sh-frame-main` (`createPortal`; fall back to `document.body` if absent). Root `section.sh-session[data-sprite-avoid]`, `position: absolute; inset: 0`, background transparent (the ambient layer shows through). While mounted: `setSession({ kind })` and `document.documentElement.dataset.session = ""`; clear both on unmount. CSS `html[data-session] .sh-frame-main > :not(.sh-session) { visibility: hidden; }` hides the page under it (check the real direct children of `.sh-frame-main` and adjust the selector so the NovaBar dock and page are hidden but `.sh-session` is not).
- Top strip (grid `1fr auto 1fr`, 64px): left crumb; center `ShieldMeter` (when `shield`); right `ROUND {round} · {counter}` (mono 11px; `round` from `loadRounds()` on mount) and an `Esc` key button (mono 11px, 1px `--sh-border-strong`) calling `onExit`. Under it a 1px track (`--sh-border`) with a 2px fill `linear-gradient(90deg, var(--sh-accent), var(--sh-accent-2))` at `progress * 100%` (transition 160ms).
- Body: the panel column `max-width: 500px`, positioned center-left: `margin-left: max(32px, calc(50% - 400px))` (so it sits left of center and clears Nova's session lane on the right). Children render here.
- **Rail:** `AppRail` treats `session != null` as not pinned and not hover-expandable (stays the 56px rail).
- **Nova:** `StudyHubApp` computes `novaPlace = session ? "session" : (onHub && hubView === "calendar" ? "tuck" : "lane")` and renders `<NovaLane session={!!session} />` when place is `lane` or `session`. `NovaLane` adds `sh-nova-lane--session`: `right: 32px; bottom: 24px; width: 300px; height: min(560px, calc(100vh - var(--sh-topbar-h) - 120px))`, visible from 1100px wide (hidden below, which tucks her into... nothing — in session she shrinks to her normal size beside the panel instead; see below).
- `CompanionLayer`: treat `place === "session"` like `"lane"` for `stageActive`/lane measurement, so she houses in the bigger lane and sizes up via the existing `homeGeometry` path (`HOME_SCALE` max 2.6 × 180px ≈ 468px, enough). In session place she must stay housed while in `quiz` mode: today `send()` calls `leaveHome()` for any mode not in `HOME_MODES`, and `startQuiz` flies her to `dockPoint()` — skip both when `place === "session"` (pass `place` into `useNovaQuiz` or read a ref). Leave the old dock behavior for `place !== "session"`. `useNovaInput.js:201` (jump to `dockPoint()` on resize during quiz) gets the same guard. Her speech bubble stays inside her lane (existing behavior).
- Narrow windows (< 1100px): lane hidden → she stays at normal size wherever she is; the panel column takes the width. Do not tuck her into the bar during a session (the bar is hidden).

- [ ] **Step 1:** Implement. To check it before Tasks 4–5 exist, temporarily mount `<SessionShell kind="cards" crumb="OM 300 · TEST" shield={initShield()} counter="CARD 1/10" progress={0.3} onExit={…}><div style={{height:300}} /></SessionShell>` from `BuiltinCourseApp` behind a `?session` URL flag, screenshot, then remove the temporary mount.
- [ ] **Step 2:** Throwaway check `.superpowers/ui-review/task4-3/check.py` at 1440×900 and 1100×720: rail collapsed, page hidden, strip + meter + progress line, Nova large in the right lane (compare with `bs-v5-16-full.png`), Esc button works. Then remove the flag. Nova smoke (`scripts/nova-smoke.py`) still passes.
- [ ] **Step 3:** `npm run test`, `npm run build`. Commit `Phase 2.25 — Session shell and Nova session lane`.

---

### Task 4: Session results and the quiz in a session

**Files:**
- Create: `src/session/SessionResults.jsx`
- Modify: `src/companion/QuizPanel.jsx`, `src/companion/CompanionLayer.jsx` (render site), `src/companion/hooks/useNovaQuiz.js` (only if the finish summary needs new fields), `src/companion/lightRun.js` (streak mode end rule), `src/studyhub-bootstrap.css` (restyle `.sc-quiz*`; delete selectors that become unused — grep each first)

**Interfaces:**
- Consumes: `SessionShell`, `ShieldMeter`, `applyAnswer`, `initShield`, `isDepleted`, `earnedMedals`, `masteryDeltas`, `resultSummary`, `formatDuration`, `recordMark`, `roundInfo`.
- Produces:

```js
SessionResults({
  crumb,          // "MIS 430 · USE CASES"
  shield,         // final ShieldState (meter label "SHIELDS HELD" when !wentDown, else status)
  stats,          // { answered, correct, best, startedAt, endedAt, wentDown, downCount }
  comeBack,       // number of cards whose next review is tomorrow
  deltas,         // masteryDeltas(...) rows (max 4 shown)
  missedCount,    // 0 hides "Review N missed"
  extra,          // optional node under the summary (quiz: points / XP line)
  onReviewMissed, onAnother, onToday,
})
```

**SessionResults** (match `bs-v5-20-results.png`), rendered inside `SessionShell` (the shell keeps the meter with the final state and `counter` at n/n):
- On mount calls `recordMark()` once (ref guard; StrictMode-safe) and shows: crumb (mono 12px `--sh-accent`); title in `--sh-font-display` 28–30px — `ROUND {closedRound} COMPLETE` when `closedRound` else `SESSION COMPLETE`; tally beside it: 5 slanted strokes (`/`), `inRound` (or 5 when a round just closed) filled in `--sh-text-2`, the newest one in `--sh-accent` with `--sh-glow-accent` (the one glow on screen), label `ROUND {round}` mono 11px.
- Summary line `resultSummary(...)` (14px `--sh-text-2`), then `extra`.
- Stats strip: 4 cells with 1px `--sh-border` dividers: accuracy `%` (value in `--sh-accent`), shield at end, best streak, time (`formatDuration(endedAt - startedAt)`); values mono 22px, labels mono 11px uppercase `--sh-text-3`.
- Medals: `earnedMedals(stats)` as tiles (hex badge drawn with `clip-path`, aqua for unbroken/perfect, magenta-edged for streak showing `badge`), label 13px/600, detail 12px `--sh-text-3`. Omit the row when empty.
- Mastery rows (≤4): topic, 3px bar (gradient aqua→magenta at `after%`), `+N%` mono `--sh-accent` (or `±0%` `--sh-text-3`).
- Buttons: primary `Review {missedCount} missed` (only when > 0), `Another round`, `Back to Today`. Enter = primary.

**QuizPanel in a session** (match `bs-v5-16-full.png`):
- `CompanionLayer` renders `<QuizPanel …>` exactly as now; `QuizPanel` renders itself inside `SessionShell kind="quiz"` (crumb: deck label · mode label, e.g. `ALL COURSES · QUICK`; on setup no shield/progress). The floating `.sc-quiz` panel styles go; the panel becomes `div.sh-session-panel` (`--sh-panel-solid`, 1px `--sh-border-strong`, padding 20px, corner marks: 10px aqua top-left and magenta bottom-right L-shapes).
- **Setup:** "Quiz me" heading (17px/600), deck select, the four modes as rows (name mono 12px, blurb 12.5px `--sh-text-3`, active row 2px left `--sh-accent`), `Start` primary (Enter). Streak mode blurb becomes "Keep going until your health runs out." Keep `highScores` best display.
- **Play (mc):** header row `MULTIPLE CHOICE` (mono 11px `--sh-text-3`) and `Q {n} / {N}` (mono 11px `--sh-accent-2`; clock: seconds left; streak: `Q {n}`); prompt 22px/600; option rows full width, 1px `--sh-border`, key badge (mono 11px boxed) + text 15px; **selecting does not answer**: `1`–`n` or click selects (row gets 1px `--sh-accent` + `--sh-accent-soft` bg); `Lock in` (primary, Enter) answers the selected row; `Hint` (H) removes two options (existing `hintFor`); `Skip` moves on ungraded (decision 6). Hint line right: `1-{n} to pick · Enter to lock` mono 11px `--sh-text-3`. After answering: correct row `--sh-accent` edge, wrong pick `--sh-danger` edge, feedback line, `Next` (Enter). Typed and flip question types get the same panel styling.
- **Shield:** state `shield` (init on run start) → `applyAnswer(shield, correct)` in `answer()` (partial counts as correct). On `last === "health"`, append the card to `queue` (quick/weak modes) so it returns at the end. End rules (decision 3): `isDepleted(shield)` ends any mode; quick/weak out of cards; clock out of time. Remove `lives`/`STREAK_LIVES` usage (and `STREAK_LIVES` from `lightRun.js` if unused).
- Progress: quick/weak `index / queue.length`; clock elapsed fraction; streak `null`.
- **End:** `SessionResults` with stats from the run; `extra` = `{score} POINTS · +{xp} XP · LV {level}` (+ `NEW BEST` / `LEVEL UP` / unlock text as today) from `onFinish`'s reward; `deltas` from the run's starting pool vs refreshed pool grouped by `card.courseLabel`; `comeBack` = answered cards whose `next_review` is tomorrow; `onReviewMissed` starts a quick run over the missed cards; `onAnother` = `startRun(run.mode, run.deckId)`; `onToday` = close the quiz and go to Today (`onGoHub("today")` is available in `CompanionLayer` — pass it through as a prop).
- Keys: setup Enter starts; play `1`–`n` select, Enter lock/next, H hint, S skip; Esc quits (results if anything answered). Keep `paletteOpen()` and the capture-phase listener.

- [ ] **Step 1:** Implement `SessionResults`, then the quiz.
- [ ] **Step 2:** Throwaway check `.superpowers/ui-review/task4-4/check.py`: start a quiz from the radial menu (see `tour.py` `s_quiz` for selectors), screenshot setup, a question, a selected option, a correct answer, a wrong answer (shield hit), shields down after three misses, health chunk lost, results. Compare with `bs-v5-16-*.png` and `bs-v5-20-results.png`. Run the Nova smoke (its quiz check may need its selectors updated: `.sc-quiz` → `.sh-session-panel`; update `scripts/nova-smoke.py` if so).
- [ ] **Step 3:** `npm run test`, `npm run build`. Commit `Phase 2.25 — Session results and quiz session`.

---

### Task 5: Flashcard session and the deck list

**Files:**
- Create: `src/study/flashcards/DeckList.jsx`
- Modify: `src/study/flashcards/FlashcardDeck.jsx`, `src/hub/components/CourseContentArea.jsx`, `src/study/BuiltinCourseApp.jsx` (and/or `src/study/contentRegistry.jsx`, wherever OM 300 mounts the deck), `src/studyhub-bootstrap.css` (delete `.sh-session-summary` and other selectors that become unused — grep first)

**Interfaces:**
- Consumes: `SessionShell`, `SessionResults`, `ShieldMeter` state helpers, `RATINGS`, `previewIntervals`, `masteryDeltas`, `resultSummary`.
- Produces:

```js
DeckList({ cards, onStart, onAdd, onEdit, onDelete, examFor })
// Inline browse/edit list: header "N cards · M due" + Start session (primary, disabled when no cards) + Add card;
// rows: front (14px/600), back (12.5px --sh-text-2, one line, ellipsis), due chip (mono 11px; "due" in --sh-accent,
// else "in N d"), exam tag when examFor(card) (mono 11px --sh-accent-2); row hover shows Edit / Delete.
// Shows 12 rows, then "Show all N".

FlashcardDeck({ ...existingProps, session: { cardIds, crumb, onExit } })
// Renders only as a session now: inside SessionShell kind="cards".
```

**Scheduling change (decision 7), do this first, TDD:** in `sm2()` (`src/study/sm2.js`), for passing grades (`grade >= 3`), after the repetition/interval step and before the exam cap: grade 3 → `intervalDays = Math.max(1, Math.round(intervalDays * 0.8))`; grade 5 → `intervalDays = Math.round(intervalDays * 1.3)`; grade 4 unchanged. Failing grades unchanged. Update the doc comment. In `src/study/sm2.test.js` the `previewIntervals` expectation becomes `["1 day", "12 days", "15 days", "20 days"]` (exam-capped case unchanged); add a test for the modifiers on a second review (`repetitions: 1` → Hard 5, Good 6, Easy 8 days). Fix any other existing test that encoded the old grade-3/grade-5 intervals and list each change in your report. Run `npx vitest run src/study src/session src/companion` (the quiz uses grades 3/4/5 via `sm2Grade`).

**Flow:** The course's deck view (user course `qz-deck`, OM 300 `flashcards`) renders the Plan 3 mode chips + `DeckList` over the chip-filtered cards. `Start session` → the course app sets `sessionCards` (ids of the filtered cards, due-first order as today) and renders `FlashcardDeck` with `session`; `onExit` clears it. Add/edit/delete reuse `FlashcardDeck`'s existing editor and handlers: move that editor UI into `DeckList` (or a small `CardEditor` it renders) so it works without a session; the course `...` menu "Edit card"/"Add card" items open it. Keep both storage modes (user `onSaveCards` + `db.mastery.update`; OM 300 `persistFlashcardDeck`) unchanged.

**FlashcardDeck in a session** (match `bs-v5-20-front.png` / `bs-v5-20-back.png`):
- Crumb `{course short} · {module label or "Flashcards"}`; counter `CARD {n}/{N}`; progress `n/N`; meter from `applyAnswer`.
- Card (`div.sh-session-panel.sh-flashcard`): corner marks (aqua top-left, magenta bottom-right); head row `FLASHCARD · DUE TODAY` (or `· NEW` / `· REVIEW`) mono 11px `--sh-text-3`, right `EXAM IN {d} DAYS` mono 11px `--sh-accent-2` when `examFor(card)` (use `daysUntilExam`). **Front:** term 28–30px/600 centered, hint `DEFINE IT, THEN FLIP` mono 11px; below the card `Flip` primary + `Space to flip` and, when there's an exam, a chip `■ {exam title} · {Mon D}` (amber square, mono 11px, 1px `--sh-border-strong`). **Back:** term 22px/600 left, 1px divider, definition 15px (`--sh-text`; first sentence bold if the card has `example`), example block with a 2px `--sh-accent-2` left rule and `--sh-panel` bg when `card.example` exists.
- **Ratings** (back only): 4 tiles in a row, each with a 2px top edge (Again `--sh-danger`, Hard `--sh-warn`, Good `--sh-accent`, Easy `--sh-accent-2`), label 14px/600, key number top-right mono 11px, interval `previewIntervals(card, { examDate })[i].label` mono 11px `--sh-text-3`. Keys `1`–`4`, `K` = Good, `A` = Again. `rate(grade)` keeps its current SM-2 + DB + `emitStudyEvent` path; Again (grade 1) counts as a miss for the shield, Hard/Good/Easy as correct.
- **Re-queue:** on `last === "health"` append the card id to the session order so it comes back at the end (N grows). Session ends when the order is exhausted or `isDepleted`.
- **Results:** `SessionResults` with `deltas` by module label (user) or chapter (OM 300 `card.chapter`/source, whichever field exists), `comeBack` from rated cards with `next_review` tomorrow, `onReviewMissed` = new session over Again-rated cards, `onAnother` = new session over the same filter, `onToday` = exit + go to Today (dispatch the existing hub navigation the course apps use, e.g. the `onGoHub`/`studyhub-go-hub` path — find it, don't invent one).
- Keyboard rules unchanged: palette check, `useCallback`, cleanup, 200ms flip debounce via ref, ignore keys while a rating is in flight. Esc → results if anything rated, else exit.
- Remove the old inline card chrome, Know/Again buttons, `SessionSummary` and their CSS.

- [ ] **Step 1:** Implement `DeckList` and the course wiring, then the session view.
- [ ] **Step 2:** Throwaway check `.superpowers/ui-review/task4-5/check.py` on OM 300 (rail `QZ`): deck list, Start session, front, back with 4 ratings and intervals, rate Again ×3 (shield down) and once more (card re-queued: N grows), finish → results, Review missed. Then a manual user course: deck list empty state, add a card, start a session. Compare with `bs-v5-20-*.png`.
- [ ] **Step 3:** `npm run test`, `npm run build`. Commit `Phase 2.25 — Flashcard session and deck list`.

---

### Task 6: Tours, verification, spec sync

**Files:**
- Modify: `.superpowers/ui-review/tour.py` (scratch, not committed), `src/companion/tours/*.json` and `src/companion/faq.js` (only if a target moved), `scripts/nova-smoke.py` (if not already updated), `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md`

- Tour: update `s_quiz` (session selectors), `s_builtin_drill` (deck list → Start session → front/back), add steps `session-quiz-question`, `session-quiz-hit`, `session-quiz-down`, `session-results`, `session-cards-front`, `session-cards-back`, `session-1100` (narrow), each with its `NEEDS` prerequisites. Run the full tour (`tour.py`, GPU flags already on) and the Nova smoke.
- Grep tours/FAQ for `.sc-quiz`, `sc-quiz`, `drill-card` targets and fix any that moved.
- Spec sync: §3 note that Skip is ungraded, ratings map to grades 1/3/4/5, all quiz modes end at zero health; §6 note that Today items adding tally marks is deferred to Plan 5; §2.5 Session line: "Nova steps into a larger session lane on the right (≥1100px)".
- Compare every session shot with its mockup; list mismatches; fix CSS-level ones in files this plan touched.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run test`, `npm run build`, Nova smoke, full tour.
- [ ] **Step 3:** Commit `Phase 2.25 — Session tours and verification`.
