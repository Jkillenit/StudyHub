# A3 Grade/Data Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One grade-math module that every screen agrees with, one date module, every renderer DB call routed through `courseStore`, fewer duplicate fetches, and grade/tier colors driven by CSS classes instead of inline styles (backlog TD-01, TD-02, TD-03, TD-07, TD-08).

**Architecture:** Pure logic moves into tested modules (`src/features/grades/gradeMath.js`, new `src/lib/dates.js`); React components only call them. `courseStore.js` gains flat wrapper methods for every raw `window.studyHub.db` call. A new `useCourseMirror` hook loads a course's announcements, assignments and exam scopes once and derives badges and exams from that single load.

**Tech Stack:** React 18, Vite, vitest (node env, no DOM: only pure modules are unit-tested), Electron IPC via `window.studyHub`.

**Reference:** current-state map with file:line refs: `.superpowers/sdd/a3-map.md` (line numbers are a snapshot; search by name).

## Global Constraints

- Every change passes `npx vitest run` and `npm run build`. No `console.log` / `console.error` in production paths. No new dependencies.
- Do not touch OM 300 content (`src/study/sections`, `src/glossary/courseData.js`). OM 300 must keep working (FlashcardDeck is shared with it).
- Renderer uses `courseStore.js`, not raw IPC. `courseStore` stays a **flat object** (no namespaces): async, camelCase, verb-first, `courseUuid` first, optional chaining `db?.x?.y?.()`, fallbacks `|| []` / `|| null` / `|| { success: false }`, mutations keep dispatching the window events they dispatch today.
- CSS: only `--sh-*` tokens (color-mix over tokens OK), no hardcoded colors; min text 11px; motion via `html[data-motion="reduced"]` only.
- Electron files are CJS and cannot import renderer ESM: keep their date copies, guard parity with tests.
- Product decisions (user-approved 2026-10-01):
  1. Every grade number rescales weights to sum to 100% (same as Today's `courseStanding`).
  2. "If I score zero on X" = the current grade recomputed with X scored 0 (fixture 90@20%, 70@30%, open 50% → 42.0, not 21.0).
  3. `itemShare` rescales weights in both directions (`/ total`, not `/ Math.max(total, 1)`).
  4. All ~46 raw `window.studyHub.db` calls move behind `courseStore`.
- Keep `dueLabel` / `dueText` wording and `formatDuration` ("1h 5m", seconds) / `formatMinutes` ("1h 05m", minutes) as they are: different units, intentional.
- Commit per task: `Phase 2.20 — Short description` + bullet list, via `git commit -F <file>`. Never stage `.agents/`, `skills-lock.json`, `.cursor/`, `.superpowers/`.
- UI tasks (6, 7): follow `.agents/skills/frontend-design/SKILL.md` within `.cursorrules` (rules win), verify visually with `.agents/skills/webapp-testing` (Playwright via `scripts/with_server.py`; set `$env:PYTHONIOENCODING="utf-8"`).

---

### Task 1: gradeMath helpers + Today engine adoption (TD-01a)

**Files:**
- Modify: `src/features/grades/gradeMath.js`
- Modify: `src/features/grades/gradeMath.test.js`
- Modify: `src/features/today/priority.js` (remove private `totalWeight`/`normalized`, import them; `itemShare` divides by `total`)
- Modify: `src/features/today/priority.test.js` (the sparse itemShare case)
- Modify: `src/features/today/todayView.js` (import `letterFor` from gradeMath, keep re-export)

**Interfaces:**
- Produces (all exported from `gradeMath.js`):
  - `totalWeight(components) -> number` — Σ weight.
  - `normalized(components) -> components` — weights divided by total; unchanged when total ≤ 0.
  - `letterFor(grade, scale) -> string|null` — null for null grade; default scale `{A:90,B:80,C:70,D:60}` when scale missing/empty; "F" below all.
  - `gradeTone(pct) -> 'none'|'ok'|'warn'|'danger'` — null/undefined → none; ≥80 ok; ≥70 warn; else danger.
  - `neededTone(needed) -> 'ok'|'warn'|'danger'` — ≤85 ok; ≤95 warn; else danger.
  - `averageScore(entries) -> number|null` — mean of `Number(e.score || 0)` rounded to 1 decimal; null for empty.

- [ ] **Step 1: Write failing tests** — append to `src/features/grades/gradeMath.test.js` (update its import line to also import the new names):

```js
describe("weights that don't sum to 100%", () => {
  const partial = [
    { weight: 0.4, score: 70 },
    { weight: 0.4, score: null },
  ];

  it("totalWeight sums weights", () => {
    expect(totalWeight(partial)).toBeCloseTo(0.8);
    expect(totalWeight([])).toBe(0);
  });

  it("normalized rescales to 1 and leaves zero totals alone", () => {
    expect(normalized(partial).map((c) => c.weight)).toEqual([0.5, 0.5]);
    const zero = [{ weight: 0, score: null }];
    expect(normalized(zero)).toBe(zero);
  });

  it("neededAverage on normalized weights matches Today (40/40 → 90, 60/60 → 90)", () => {
    expect(neededAverage(normalized(partial), 80)).toBeCloseTo(90);
    const over = [{ weight: 0.6, score: 70 }, { weight: 0.6, score: null }];
    expect(neededAverage(normalized(over), 80)).toBeCloseTo(90);
  });
});

describe("letterFor", () => {
  it("uses the given scale, default when missing, F below all", () => {
    expect(letterFor(85, { A: 93, B: 83, C: 73 })).toBe("B");
    expect(letterFor(85, null)).toBe("B");
    expect(letterFor(85, {})).toBe("B");
    expect(letterFor(40, null)).toBe("F");
    expect(letterFor(null, null)).toBeNull();
  });
});

describe("tones", () => {
  it("gradeTone", () => {
    expect(gradeTone(null)).toBe("none");
    expect(gradeTone(92)).toBe("ok");
    expect(gradeTone(80)).toBe("ok");
    expect(gradeTone(75)).toBe("warn");
    expect(gradeTone(50)).toBe("danger");
  });

  it("neededTone", () => {
    expect(neededTone(60)).toBe("ok");
    expect(neededTone(85)).toBe("ok");
    expect(neededTone(90)).toBe("warn");
    expect(neededTone(99)).toBe("danger");
  });
});

describe("averageScore", () => {
  it("averages to one decimal, null when empty", () => {
    expect(averageScore([{ score: 90 }, { score: 85 }, { score: 80 }])).toBe(85);
    expect(averageScore([{ score: 90 }, { score: 85.15 }])).toBe(87.6);
    expect(averageScore([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/grades` — expect FAIL (names not exported).

- [ ] **Step 3: Implement** in `src/features/grades/gradeMath.js` (append; keep existing exports unchanged):

```js
export function totalWeight(components) {
  return (components || []).reduce((sum, c) => sum + weightOf(c), 0);
}

/** Weights scaled to sum to 1, so a syllabus that lists 90% (or 110%) still yields sane numbers. */
export function normalized(components) {
  const list = components || [];
  const total = totalWeight(list);
  return total > 0 ? list.map((c) => ({ ...c, weight: weightOf(c) / total })) : list;
}

const DEFAULT_SCALE = Object.freeze({ A: 90, B: 80, C: 70, D: 60 });

/** Letter for a percent on `scale` ({ letter: minPercent }), the default A–D scale when none is set. */
export function letterFor(grade, scale) {
  if (grade == null) return null;
  const s = scale && Object.keys(scale).length ? scale : DEFAULT_SCALE;
  const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
  for (const [letter, min] of sorted) if (grade >= min) return letter;
  return "F";
}

export function gradeTone(pct) {
  if (pct == null) return "none";
  if (pct >= 80) return "ok";
  if (pct >= 70) return "warn";
  return "danger";
}

export function neededTone(needed) {
  if (needed <= 85) return "ok";
  if (needed <= 95) return "warn";
  return "danger";
}

export function averageScore(entries) {
  if (!entries?.length) return null;
  const avg = entries.reduce((sum, e) => sum + Number(e.score || 0), 0) / entries.length;
  return Math.round(avg * 10) / 10;
}
```

- [ ] **Step 4: Today engine.** In `src/features/today/priority.js`: delete the private `totalWeight` and `normalized` functions and add them to the existing gradeMath import. In `itemShare` change
  `const w = Number(comp.weight) / Math.max(totalWeight(components), 1);` to `const w = Number(comp.weight) / totalWeight(components);`
  (`comp.weight > 0` is already checked, so total > 0).
  In `src/features/today/todayView.js`: delete the local `DEFAULT_SCALE` and `letterFor` and replace with `export { letterFor } from "../grades/gradeMath.js";` plus `import { letterFor } from "../grades/gradeMath.js";` if it is used in the file. Leave `src/companion/doodles.js` `letterFor` alone (different contract).

- [ ] **Step 5: Update the one test that encoded the old itemShare rule** — `priority.test.js` "assumes a minimum item count per category when points are unknown": the lone 0.3 component now normalizes to 1:

```js
    expect(itemShare(asg({ componentUuid: "hw" }), sparse).share).toBeCloseTo(1 / PRIORITY_CONFIG.minItemsPerComponent.homework);
```

  and add, inside `describe("itemShare")`:

```js
  it("rescales weights that sum to under 100%", () => {
    const under = course({ components: [
      { uuid: "a", name: "A", weight: 0.4, pointsTotal: 0, itemCount: 1 },
      { uuid: "b", name: "B", weight: 0.4, pointsTotal: 0, itemCount: 1 },
    ] });
    expect(itemShare(asg({ componentUuid: "b" }), under).share).toBeCloseTo(0.5);
  });
```

- [ ] **Step 6: Run** `npx vitest run` — all green (todayView.test.js `letterFor` cases pass unchanged via the re-export). `npm run build` succeeds.

- [ ] **Step 7: Commit** `Phase 2.20 — Shared grade math helpers` (bullets: totalWeight/normalized/letterFor/tones/averageScore in gradeMath; priority + todayView import them; itemShare rescales under-100% syllabi).

---

### Task 2: Grades tab uses shared grade math (TD-01b)

**Files:**
- Modify: `src/hub/components/GradesTab.jsx`
- Modify: `docs/PRODUCT_BACKLOG.md` (delete the `| TD-01 |` row)

**Interfaces:**
- Consumes from Task 1: `currentGrade, hasScore, neededAverage, normalized, totalWeight, letterFor, averageScore` from `../../features/grades/gradeMath.js`.
- Produces: `getCurrentLetter` export is removed (only GradesTab used it — verify with grep before deleting).

Leave `gradeColor`/`neededColor` and all inline color styles alone — Task 7 replaces them.

- [ ] **Step 1: Letters.** Delete `getCurrentLetter`. Replace its uses with `letterFor`, keeping the "no scale → no letter" behavior by guarding on the scale:
  - `GradeScaleDisplay`: `const currentLetter = letterFor(currentGrade, scale);` (it already returns early when `!scale`).
  - `HypotheticalEngine`: `const letter = (gradingScale && letterFor(target, gradingScale)) || \`${target}%\`;`
  - Header: `{letterFor(currentGrade, gradingScale)}` (already inside `currentGrade !== null && gradingScale`).

- [ ] **Step 2: What do I need?** In `HypotheticalEngine`: `const needed = neededAverage(normalized(components), target);`

- [ ] **Step 3: What-if.** Replace the `projectedGrade` reduce with (currentGrade over fully filled components divides by total weight, i.e. normalizes):

```js
  const projectedGrade = weightedGrade(
    components.map((c, i) => (hasScore(c) ? c : { ...c, score: simFor(keyOf(c, i)) }))
  );
```

- [ ] **Step 4: If I score zero.** Replace the body of `GradeDropCalculator` math with:

```js
  const current = weightedGrade(components);
  const impacts = components
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => hasScore(c))
    .map(({ c, i }) => {
      const gradeWithZero = weightedGrade(components.map((x) => (x === c ? { ...x, score: 0 } : x)));
      return { key: keyOf(c, i), name: c.name, gradeWithZero, impact: current - gradeWithZero };
    })
    .sort((a, b) => b.impact - a.impact);
```

  Delete the local `contribution` and `totalGrade`. Rendering stays the same (`gradeWithZero.toFixed(1)%`, `-{impact.toFixed(1)}`).

- [ ] **Step 5: Component row contribution.** Pass the total weight into each row: replace the parent's local `const totalWeight = components.reduce(...)` with `const weightSum = totalWeight(components);` (renamed so it doesn't shadow the import) and update its uses in the TOTAL row. Since the parent returns early for the empty state, compute `weightSum` where the old local was. Add prop `weightSum={weightSum}` to `<ComponentRow>`. In `ComponentRow` replace the two lines with:

```js
  const share = weightSum > 0 ? Number(component.weight || 0) / weightSum : 0;
  const contrib = hasScore(component) ? Number(component.score) * share : null;
  const dropImpact = contrib !== null ? contrib : share * 80;
```

- [ ] **Step 6: Sub-entry average.** In `applySubAverage`: `onScoreChange(index, String(averageScore(rows)));` (keep the early return on empty). In the AVERAGE display: `{averageScore(subEntries).toFixed(1)}`.

- [ ] **Step 7: Verify.** `npx vitest run`, `npm run build`. Grep: `rg "score\) \* Number|\* Number\(c.weight" src/hub/components/GradesTab.jsx` returns nothing. Manual numeric check by reasoning against Task 1 tests: 40/40 course with 70 scored, target 80 → WHAT DO I NEED? shows 90.0%.

- [ ] **Step 8: Backlog + commit.** Delete the `| TD-01 |` row from `docs/PRODUCT_BACKLOG.md`. Commit `Phase 2.20 — Grades tab agrees with Today` (bullets: What do I need? rescales weights; what-if/zero/contrib use shared math; zero-on-X shows the recomputed grade; one sub-entry average).

---

### Task 3: One date module (TD-02)

**Files:**
- Create: `src/lib/dates.js`, `src/lib/dates.test.js`
- Modify: `src/study/sm2.js` (re-export `localDateString`, use shared `dayNumber`)
- Modify: `src/features/today/blocked.js` (`dayKey` → shared), `src/features/today/priority.js` (`dayIndex` and `localDayKey` → shared), `src/features/today/todayView.js` (`startOfDay`, inline key → shared), `src/features/dashboard/CalendarView.jsx` (private `dayKey` → shared), `src/companion/memory/derive.js` (`localDay` → shared), `src/features/dashboard/dateLabels.js` (`startOfLocalDay` → shared; `daysFromToday(iso, now = new Date())`)
- Modify: `electron/examCards.test.js` (parity against `src/lib/dates.js`)
- Modify: `docs/PRODUCT_BACKLOG.md` (delete the `| TD-02 |` row)

**Interfaces:**
- Produces (`src/lib/dates.js`):
  - `localDayKey(value = new Date(), offset = 0) -> "YYYY-MM-DD"` — bare `YYYY-MM-DD` strings are local dates; other values go through `new Date(value)`; the date is set to local noon before adding `offset` days (DST-safe).
  - `startOfLocalDay(value) -> Date` — local midnight.
  - `dayNumber(value) -> number|null` — whole local-calendar day number (sm2's current implementation, verbatim).
  - `daysBetween(value, now) -> number|null` — `dayNumber(value) - dayNumber(now)`, null if either is null.
- Keep existing exported names working: `sm2.localDateString`, `blocked.dayKey`, `derive.localDay`, `priority.daysUntil`, `sm2.daysUntilExam` (re-export or thin alias; callers unchanged).

- [ ] **Step 1: Failing tests** `src/lib/dates.test.js`:

```js
import { describe, expect, it } from "vitest";
import { dayNumber, daysBetween, localDayKey, startOfLocalDay } from "./dates.js";

describe("localDayKey", () => {
  it("formats local dates and treats bare dates as local", () => {
    expect(localDayKey(new Date(2026, 9, 1, 23, 30))).toBe("2026-10-01");
    expect(localDayKey("2026-10-01")).toBe("2026-10-01");
    expect(localDayKey(new Date(2026, 9, 1).getTime())).toBe("2026-10-01");
  });

  it("offsets by calendar days across month ends and DST", () => {
    expect(localDayKey(new Date(2026, 9, 31, 8), 1)).toBe("2026-11-01");
    expect(localDayKey(new Date(2026, 2, 7, 0, 30), 1)).toBe("2026-03-08");
    expect(localDayKey(new Date(2026, 10, 1, 0, 30), 1)).toBe("2026-11-02");
    expect(localDayKey(new Date(2026, 0, 1), -1)).toBe("2025-12-31");
  });
});

describe("dayNumber / daysBetween", () => {
  it("counts calendar days, bare dates local, null-safe", () => {
    expect(daysBetween("2026-10-02", new Date(2026, 9, 1, 23, 59))).toBe(1);
    expect(daysBetween(new Date(2026, 9, 1, 0, 1), new Date(2026, 9, 1, 23, 59))).toBe(0);
    expect(daysBetween(new Date(2026, 2, 9), new Date(2026, 2, 7))).toBe(2);
    expect(dayNumber(null)).toBeNull();
    expect(dayNumber("")).toBeNull();
    expect(dayNumber("garbage")).toBeNull();
    expect(daysBetween(null, new Date())).toBeNull();
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight", () => {
    const d = startOfLocalDay(new Date(2026, 9, 1, 15, 45));
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([0, 0, 1]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/dates.test.js` — FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/dates.js`:

```js
/** Local-calendar date helpers. electron/examCards.cjs and dbMirrorHandlers.cjs keep CJS copies; parity is tested. */
const DAY_MS = 86400000;
const BARE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

function toLocalDate(value) {
  const bare = typeof value === "string" ? BARE.exec(value) : null;
  return bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(value);
}

export function localDayKey(value = new Date(), offset = 0) {
  const d = toLocalDate(value);
  d.setHours(12, 0, 0, 0);
  if (offset) d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dayNumber(value) {
  if (value == null || value === "") return null;
  const bare = BARE.exec(String(value));
  if (bare) return Date.UTC(+bare[1], +bare[2] - 1, +bare[3]) / DAY_MS;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

export function daysBetween(value, now) {
  const a = dayNumber(value);
  const b = dayNumber(now);
  return a == null || b == null ? null : a - b;
}
```

- [ ] **Step 4: Run** dates tests — PASS.

- [ ] **Step 5: Replace duplicates** (callers keep their imports; see map §2.1–2.3 for every site):
  - `sm2.js`: delete local `localDateString` and `dayNumber`; `export { localDayKey as localDateString } from "../lib/dates.js";` and import `dayNumber` for `daysUntilExam`. `localDateString()` with no arg still means today (default param).
  - `blocked.js`: `export { localDayKey as dayKey } from "../../lib/dates.js";` — before doing this grep its callers (`blocked.js`, `companion/doodles.js`, `companion/memory/useCompanionMemory.js`) and confirm none passes `null`/`undefined` (old: epoch / "NaN-NaN-NaN"; new: epoch / today). If one can, keep that caller's behavior explicit at the call site.
  - `derive.js`: `localDay` → re-export of `localDayKey` (same caller check).
  - `priority.js`: delete `dayIndex` and `localDayKey`; `daysUntil(date, now)` keeps its `!date`/NaN guard and returns `daysBetween(date, now)`; `blockedBefore` uses `localDayKey(now, i)` from dates.
  - `todayView.js`: delete `startOfDay`, import `startOfLocalDay`; replace the inline key in the week loop with `localDayKey(today0, i)`.
  - `CalendarView.jsx`: delete private `dayKey`; use `localDayKey`.
  - `dateLabels.js`: delete private `startOfLocalDay`, import it; signature `daysFromToday(iso, now = new Date())` (body uses `now`). `dueLabel` unchanged.

- [ ] **Step 6: Electron parity.** In `electron/examCards.test.js` add a case asserting `examCards.localDateString(d) === localDayKey(d)` and `examCards`'s `dayNumber`-based `daysUntilExam` equals `daysBetween` for a few dates (a mid-day Date, a bare `YYYY-MM-DD`, month end). Import with `import { localDayKey, daysBetween } from "../src/lib/dates.js";`. If `dbMirrorHandlers.cjs`'s `localDate` isn't exported, leave it (it uses `new Date()` + `setDate`, same output as `localDayKey(new Date(), offset)`; note this in the report).

- [ ] **Step 7: Verify.** `npx vitest run` (sm2, blocked, priority, todayView, derive, examCards tests unchanged and green), `npm run build`. `rg "getFullYear\(\)\}-" src` should only hit `src/lib/dates.js`.

- [ ] **Step 8: Backlog + commit.** Delete `| TD-02 |` row. Commit `Phase 2.20 — One local date module`.

---

### Task 4: courseStore wrappers — grades, Blackboard, assignments (TD-03 part 1)

**Files:**
- Modify: `src/db/courseStore.js`
- Modify: `src/hub/components/GradesTab.jsx`, `src/hub/UserCourseApp.jsx`, `src/app/StudyHubApp.jsx`, `src/features/import/syllabusImport.js`, `src/features/study/examEstimate.js`, `src/features/study/StudyGuideView.jsx`, `src/features/mirror/AssignmentsView.jsx`, `src/features/mirror/AssignmentForm.jsx`, `src/features/dashboard/CalendarView.jsx`

**Interfaces:**
- Produces (new flat `courseStore` methods; each forwards to the bridge call in parentheses):
  - `getGradeComponents(courseUuid)` (`db.grades.getComponents`) → `[]` fallback
  - `upsertGradeEntry({ courseUuid, componentId, score })` (`db.grades.upsertEntry`)
  - `getGradeSubEntries(componentId)` (`db.grades.getSubEntries`) → `[]`
  - `saveGradeSubEntry({ componentId, score, label })` (`db.grades.saveSubEntry`)
  - `deleteGradeSubEntry(id)` (`db.grades.deleteSubEntry`)
  - `saveGradingScale(courseUuid, scale)` (`db.grades.saveGradingScale({ courseUuid, scale })`)
  - `getBbGradeItems(courseUuid)` (`db.bb.getGradeItems`) → `[]`
  - `setBbItemComponent({ courseUuid, bbId, componentUuid })` (`db.bb.setItemComponent`)
  - `applyBbGrades(courseUuid)` (`db.bb.applyGrades`)
  - `getBbItems(courseUuid)` (`db.bb.getItems`) → `[]`
  - `getAssignments(courseUuid)` (`db.assignments.getByCourse`) → `[]`
  - `getAssignmentsInRange({ from, to })` (`db.assignments.getRange`) → `[]`
  - `saveAssignment(assignment)` (`db.assignments.save`)
  - `deleteAssignment(uuid)` (`db.assignments.delete`)
  - Existing, now used everywhere: `getGradingScale`, `setAssignmentCompleted(uuid, completed)`.
- Return values must match what callers read today (e.g. `setBbItemComponent` result `.items`, `saveAssignment` result shape) — pass the bridge result through unchanged except for the list fallbacks above.

- [ ] **Step 1:** Add the methods to the `courseStore` object, next to `getGradingScale`, matching its style (one-liners where the existing code uses one-liners).
- [ ] **Step 2:** Replace every raw call in the files listed (map §3.5 rows for grades, bb, assignments). `GradesTab`'s `getGradingScale` call switches to `courseStore.getGradingScale` (which swallows errors → null; the load's `.catch` still handles the others). `AssignmentsView` and `CalendarView` `setCompleted` switch to `courseStore.setAssignmentCompleted` — it dispatches `studyhub-mirror-changed` with `{ assignmentUuid }`; if CalendarView dispatches its own event afterwards, keep that dispatch so listeners filtering on `courseUuid` still fire.
- [ ] **Step 3: Verify.** `rg "studyHub\??\.db" <each file listed>` returns nothing. `npx vitest run`, `npm run build`, `npm run check:db`.
- [ ] **Step 4: Commit** `Phase 2.20 — courseStore wrappers for grades, Blackboard and assignments`.

---

### Task 5: courseStore wrappers — everything else (TD-03 part 2)

**Files:**
- Modify: `src/db/courseStore.js`
- Modify: `src/features/mirror/useMirrorBadges.js`, `src/features/mirror/AnnouncementsView.jsx`, `src/features/mirror/BbContentView.jsx` (if not done in Task 4), `src/features/dashboard/CourseFeeds.jsx`, `src/features/progress/ProgressView.jsx`, `src/features/study/StudyGuideView.jsx`, `src/features/blackboard/BlackboardSyncPanel.jsx`, `src/study/flashcards/FlashcardDeck.jsx`, `src/companion/hooks/useNovaQuiz.js`, `src/companion/CompanionLayer.jsx`, `src/companion/companionStore.js`

**Interfaces:**
- Produces:
  - `getAnnouncements(courseUuid)` (`db.announcements.getByCourse`) → `[]`
  - `markAnnouncementRead(uuid)` (`db.announcements.markRead`)
  - `getDashboard()` (`db.dashboard.get`)
  - `getSessionStats(courseUuid)` (`db.sessions.stats`)
  - `getSessionHistory({ courseUuid, limit })` (`db.sessions.history`) → `[]`
  - `getSetting(key)` / `setSetting(key, value)` (`db.settings.get(key)` / `db.settings.set({ key, value })`)
  - `updateMastery(args)` (`db.mastery.update(args)`)
- `src/db/migrateFromLocalStorage.js`'s availability guard (`window.studyHub?.db`) is not an IPC call — leave it.

- [ ] **Step 1:** Add the methods. Check `companionStore.js` does not create an import cycle with `courseStore.js` (courseStore must not import companionStore); if it would, report it instead of working around it.
- [ ] **Step 2:** Replace every remaining raw call (map §3.5). Keep argument shapes identical to what the bridge receives today.
- [ ] **Step 3: Verify.** `rg "studyHub\??\.db\??\." src --glob '!src/db/**'` returns nothing. `npx vitest run`, `npm run build`, `scripts/nova-smoke.py` passes (companion files touched): `$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 -- python scripts/nova-smoke.py` (check the A2 plan `docs/superpowers/plans/2026-10-01-a2-companion-split.md` for the exact invocation if this differs).
- [ ] **Step 4: Commit** `Phase 2.20 — Route remaining renderer DB calls through courseStore`.

---

### Task 6: Fewer fetches: one course mirror load, leaner Grades tab (TD-03 rest + TD-08)

**Files:**
- Create: `src/features/mirror/useCourseMirror.js`, `src/features/mirror/courseMirror.js`, `src/features/mirror/courseMirror.test.js`
- Modify: `src/features/study/examEstimate.js` (extract pure `upcomingExams(rows, scopes, now)`; `loadUpcomingExams` uses it)
- Modify: `src/hub/UserCourseApp.jsx`, `src/hub/components/CourseContentArea.jsx`, `src/study/flashcards/FlashcardDeck.jsx`, `src/hub/components/GradesTab.jsx`
- Delete: `src/features/mirror/useMirrorBadges.js`, `src/features/study/useCourseExams.js` (only if grep shows no other importers)
- Modify: `docs/PRODUCT_BACKLOG.md` (delete `| TD-03 |` and `| TD-08 |` rows)

**Interfaces:**
- Produces:
  - `courseMirror.js`: `mirrorBadges(announcements, assignments, now = new Date()) -> { unread, dueSoon }` (exact logic from `useMirrorBadges`: unread = `!a.read`; dueSoon = not completed, has `due_date`, `daysFromToday(due_date, now)` in `[0, 7)`).
  - `examEstimate.js`: `upcomingExams(rows, scopes) -> [{ uuid, title, dueDate, moduleIds, scopeSource }]` (the current filter/sort/map body of `loadUpcomingExams`, verbatim).
  - `useCourseMirror(courseUuid) -> { badges, exams, examFor }` — one `Promise.all([courseStore.getAnnouncements, courseStore.getAssignments, courseStore.getExamScopes])`; reloads on `studyhub-bb-synced` and `studyhub-mirror-changed` (when `!detail?.courseUuid || detail.courseUuid === courseUuid`) and on `studyhub-exam-scope-changed` (always); `examFor = useCallback((card) => examForCard(card, exams)?.dueDate ?? null, [exams])`; null courseUuid → empty state, no IPC.
  - `FlashcardDeck` prop `examFor` with default `NO_EXAM = () => null` (module-level constant so the default is stable). OM 300 renders FlashcardDeck without it and calls `examFor(card)` in `rate`.

- [ ] **Step 1: Failing test** `courseMirror.test.js` for `mirrorBadges` (unread count; due today counted, due in 7 days not, completed not, past not, missing due_date not; fixed `now`) and for `upcomingExams` (filters non-exams, completed and past exams; sorts by date; maps scopes with `"course"` default). Use a fixed `now` and `due_date` ISO strings built from `new Date(2026, 9, d, 12)`; note `upcomingExams` uses `daysUntilExam` (real today) — give it dates far in the future/past (e.g. 2099 and 2000) so the test is deterministic.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `courseMirror.js`, extract `upcomingExams`, write `useCourseMirror.js`. Run — PASS.
- [ ] **Step 4: Wire.** `UserCourseApp`: replace `useMirrorBadges(...)` and `useCourseExams(...)` with one `const { badges, examFor } = useCourseMirror(c.uuid || c.id);` and pass `examFor` to `CourseContentArea` → `FlashcardDeck`. In `FlashcardDeck` remove the `useCourseExams` call and take `examFor = NO_EXAM` from props. `StudyGuideView`'s own load can call `loadUpcomingExams` — leave it unless trivial.
- [ ] **Step 5: hasGrades.** In `UserCourseApp`, the effect that loads `courseStore.getGradeComponents(uuid)` for `hasGrades` also re-runs on `studyhub-bb-synced` for this course (listener in the same effect, cleaned up).
- [ ] **Step 6: Grades tab loading (TD-08).** In `GradesTab`:
  - Initial load (and `studyhub-bb-synced`) keeps all five queries.
  - Add `refreshAfterEdit = useCallback(async () => { const [rows, items, today] = await Promise.all([courseStore.getGradeComponents(courseUuid), courseStore.getBbGradeItems(courseUuid), courseStore.loadTodayData(courseUuid)]); setComponents(rows); setBbItems(items); setSnapshot(today?.courses?.[0] || null); }, [courseUuid])`.
  - `saveStructure`: when BB items exist, `await courseStore.applyBbGrades(courseUuid); await refreshAfterEdit();` instead of `setReloadKey`. When none exist, refresh only the snapshot (`loadTodayData`) so HOLD YOUR TARGET sees new/renamed components.
  - `assignBbItem`: after `setBbItemComponent`, call `refreshAfterEdit()` (mapping changes assignment → component shares) instead of its own `getGradeComponents`.
  - Scale and target are not refetched after edits (they don't change).
- [ ] **Step 7: Verify.** `npx vitest run`, `npm run build`. Playwright check (webapp-testing): open a user course, open QZ-01 drill, rate one card; open OM 300 drill, rate one card — no console errors. If the browser build can't load a user course (Electron bridge missing), state that in the report and rely on code reading for the user-course path.
- [ ] **Step 8: Backlog + commit.** Delete `| TD-03 |` and `| TD-08 |` rows. Commit `Phase 2.20 — One mirror load per course, leaner Grades tab`.

---

### Task 7: Tone classes and print rules in CSS (TD-07)

**Files:**
- Modify: `src/studyhub-bootstrap.css`
- Modify: `src/hub/components/GradesTab.jsx`, `src/hub/components/CourseContentArea.jsx`, `src/hub/UserCourseApp.jsx`, `src/study/BuiltinCourseApp.jsx`
- Modify: `docs/PRODUCT_BACKLOG.md` (delete `| TD-07 |` row), `docs/ROADMAP.md` (add `- ✓ A3 grade/data sweep: shared grade math, one date module, courseStore-only DB access (TD-01/02/03/07/08).` in the build-order/Phase 2 area next to the A1/A2 notes)

**Interfaces:**
- Consumes from Task 1: `gradeTone(pct)`, `neededTone(needed)`.
- Produces CSS: `.sh-tone--ok { color: var(--sh-accent); }`, `.sh-tone--warn { color: var(--sh-warn); }`, `.sh-tone--danger { color: var(--sh-danger); }`, `.sh-tone--none { color: var(--sh-text-3); }`; `.sh-score-bar.sh-tone--*` sets `background` (same tokens) instead of color.

- [ ] **Step 1: Grades tones.** Delete `gradeColor` and `neededColor`. Every `style={{ color: gradeColor(x) }}` becomes `className={\`<existing classes> sh-tone--${gradeTone(x)}\`}` (7 sites: what-if grade, drop result, score bar (background), BB grade row, BB group head pct, header grade value, TOTAL contrib); `neededColor` sites (hyp score, hyp needed) use `neededTone`. Other inline styles in GradesTab: drop delta `{ color: danger, opacity: 0.7 }` → CSS on `.sh-drop-delta`; status color → `.sh-grades-status--ok` modifier when `status.startsWith("Found")` (base already warn); TOTAL weight warn → `sh-tone--warn` when off by > 0.01; sub-entry `fontSize: 11/12` and `width: 70` → CSS on `.sh-subentry-avg` / the score input; CONTRIB column color → `.sh-tone--none` when null. Leave the skeleton `{ height: 240 }`.
- [ ] **Step 2: Grade scale.** Remove the two inline colors in `GradeScaleDisplay`; add CSS: `.sh-grade-scale-letter, .sh-grade-scale-threshold { color: var(--sh-text-3); }`, `.sh-grade-scale-row--current .sh-grade-scale-letter { color: var(--sh-accent); }`, `.sh-grade-scale-row--current .sh-grade-scale-threshold { color: var(--sh-text); }`.
- [ ] **Step 3: Definition cards.** In `CourseContentArea.jsx` `DefinitionCard`: drop the inline `borderLeftWidth/borderLeftColor/opacity` on the card, the `.def-term` inline opacity, and the confidence-dot inline background. CSS (replace the `!important` `.sh-tier-*` rules): `.sh-tier-high` full accent border, opacity 1; `.sh-tier-medium` accent border, opacity 0.85, term opacity 0.85; `.sh-tier-low` `--sh-border` border, opacity 0.75, term opacity 0.6; `.sh-tier-medium .sh-confidence-dot { background: var(--sh-warn); }`, `.sh-tier-low .sh-confidence-dot { background: var(--sh-text-3); }`. No `!important`. Glossary dot (`confidenceColor` inline) may stay if converting it needs new markup — note in report.
- [ ] **Step 4: Print.** Delete the runtime `<style>` blocks in `UserCourseApp.jsx` and `BuiltinCourseApp.jsx`. Add `.offcanvas` to the global print `display: none !important` list and `color: CanvasText` on body in the global print block (no `white`/`black`).
- [ ] **Step 5: Verify.** `npx vitest run`, `npm run build`. `rg "gradeColor|neededColor|sh-tier-.*!important" src` returns nothing. Playwright screenshots (webapp-testing, follow frontend-design's check that hierarchy/contrast are intact): Grades tab with a scored course (if reachable in the browser build), a chapter with high/medium/low definition cards, and `page.emulate_media(media="print")` on a course page showing sidebar/topbar hidden. Embed screenshots in the report.
- [ ] **Step 6: Backlog, roadmap, commit.** Delete `| TD-07 |` row, add the ROADMAP line. Commit `Phase 2.20 — Grade and tier colors from CSS classes`.
