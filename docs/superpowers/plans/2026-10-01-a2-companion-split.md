# A2 — CompanionLayer split (TD-11) + NovaStage per-frame allocations (TD-10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/companion/CompanionLayer.jsx` (3,291 lines) into hooks by concern with no behavior change, fix its 13 uncleared timeouts, stop the per-mousemove full re-render while dragging, stop leaking WebGL contexts, and remove per-frame allocations in `NovaStage.js`.

**Architecture:** The structural map at `.superpowers/sdd/a2-companion-map.md` is the source of truth for line ranges, owned state, reads, exposed functions and effects per concern (sections 1-3), the timer table (section 4), drag cost (5), WebGL lifecycle (6), TD-10 allocations (7) and extraction order (9). Each concern becomes a hook under `src/companion/hooks/` that receives a `core` object (the shared refs, state setters and callbacks listed in map section 3) plus the cross-concern actions it needs, and returns what other concerns or the render use. Line numbers in the map refer to the 3,291-line snapshot at commit `7123be5`; they shift as tasks land, so locate code by the function and section names the map gives.

**Tech Stack:** React 18 (hooks), three.js + three-vrm, Vite, vitest (node environment, no DOM), Python Playwright via `.agents/skills/webapp-testing` for smoke checks.

## Global Constraints

- **No behavior change.** Same timings, same lines spoken, same effect dependency arrays (copy them verbatim), same order of hook calls where state is declared mid-body (notably `focusUntil`).
- `api.current.X = …` assignments stay in render bodies (inside the hook body, not inside effects); they are latest-closure functions called from timers and other concerns.
- `stageRef`, `dragRef`, `focusRef`, `send`, `force`, `update`, `say`, `setBubble`, `setMood`, `refreshAnchor`, `api`, `navRef` and the `useCompanionMotion` outputs stay in `CompanionLayer` (core) and are passed in.
- Every uncleared fire-and-forget timeout listed in map section 4 (lines 557, 638, 883, 1107, 1128, 1142, 1697, 1732, 1768, 1789, 2230, 2350, 2498 of the snapshot) goes through the `useTimeouts` `later(fn, ms)` helper when its code moves, so it is cleared on unmount.
- No new dependencies. No `console.log` / `console.error` in production paths. Styling only via `--sh-*` tokens.
- Every task ends with: `npx vitest run` green, `npm run build` succeeds, and `scripts/nova-smoke.py` passes (from Task 2 on). Run the smoke with:
  `$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 60 -- python scripts/nova-smoke.py`
- One commit per task, format `Phase 2.19 — Short description` + bullet list. Work on `main` (the project's established workflow).
- OM 300 built-in course keeps working.

---

### Task 1: Ignore scratch dir

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1:** Append to `.gitignore`:

```gitignore

# Superpowers scratch (task briefs, reports, review packages)
.superpowers/
```

- [ ] **Step 2:** Run `git status --short` and confirm `.superpowers/` no longer appears.
- [ ] **Step 3:** Commit: `git add .gitignore; git commit -m "Phase 2.19 — Ignore superpowers scratch dir"`

---

### Task 2: Nova smoke script (safety net)

**Files:**
- Create: `scripts/nova-smoke.py`

**Interfaces:**
- Produces: `scripts/nova-smoke.py`, exit code 0 and final line `nova smoke ok` on success; non-zero exit with the failing check's name otherwise. Every later task runs it.

Requirements (discover selectors by reading `CompanionLayer.jsx`'s render section, `RadialMenu.jsx`, `QuizPanel.jsx`, `HelpBubble.jsx`, `CompanionSettings.jsx`; prefer stable class names already in the JSX):

1. Header docstring with the run command from Global Constraints and a note that it needs `pip install playwright` + `python -m playwright install chromium`.
2. Chromium headless, viewport 1400×900. (As built: companion state loads through the Electron bridge, absent in a browser, so a localStorage seed has no effect; the script instead clicks through Nova's onboarding in an `onboard` check.)
3. Collect `pageerror` events and `console` messages of type `error`; ignore none. Any collected error fails the run at the end, printing them.
4. Checks, in order, each with a short printed name (`check: <name>`), screenshot to `%TEMP%/nova-smoke-<name>.png`:
   - `load`: go to `http://localhost:5173`, wait for `networkidle`, wait up to 15 s for Nova's scout node to be visible.
   - `menu`: click Nova; radial menu appears; press Escape; menu closes.
   - `ask`: Ctrl+J opens `.sc-help-input`; type `focus 5`, Enter; `.sc-focus-pill` text starts with `FOCUS`; click the pill; pill disappears.
   - `quiz`: open the radial menu, click the `QUIZ ME` item; the quiz panel is visible; close it via its close control; it disappears.
   - `drag`: record Nova's bounding box; mouse down at its center, move 250 px toward the window center and 120 px up in 10 steps (left would drop her back on her home panel, where she snaps home), mouse up; wait 1.5 s; the box center moved by more than 50 px from the start.
   - `toggle`: disable Nova through `CompanionSettings` (open it the way the app does: find the trigger in `CompanionLayer`/radial menu), confirm the scout node is gone; re-enable; scout node visible again within 15 s.
5. Print `nova smoke ok` and exit 0 only if every check passed and no errors were collected.

- [ ] **Step 1:** Write the script per the requirements.
- [ ] **Step 2:** Run the smoke command. Expected: `nova smoke ok`. If a check is inherently flaky (timing), add a bounded wait (`wait_for_selector`/`wait_for_function` with timeout), never a blind long sleep over 2 s.
- [ ] **Step 3:** Run it twice more; all three runs pass.
- [ ] **Step 4:** Commit: `git add scripts/nova-smoke.py; git commit -m "Phase 2.19 — Nova smoke script" -m "- Playwright smoke: load, menu, Ask Nova + focus, quiz, drag, toggle"`

---

### Task 3: NovaStage per-frame allocations (TD-10) + WebGL leak + Nova3D canvas rect

**Files:**
- Modify: `src/companion/nova3d/NovaStage.js`
- Modify: `src/companion/nova3d/Nova3D.jsx`

Requirements (map sections 5-7 list every site with line numbers):

1. **Scratch objects:** module-level reusable `THREE.Vector3` / `Quaternion` / `Euler` scratch instances replace every per-frame `new THREE.*` / `.clone()` in the tick path listed in map section 7 (`at` getWorldPosition, book/deck `position.clone()`, `bend()`, `pullPose`, `placeSeat`, `centerLie`, `applyLimbs`, `applyHeadLook`, the head Euler/Quaternion at ~1060, `HELD.arms/legs`, `forward`/`seatLeg`, `PROC.*.arms`). Where a function returns a vector that the caller stores, write into a caller-owned output object instead of returning a fresh one. Precompute `anchorRestQ.clone().invert()` once in `captureRest`.
2. **Matrix updates:** replace per-bone `bone.node.updateMatrixWorld(true)` in `applyLimbs` and `this.root.updateMatrixWorld(true)` in `placeSeat`/`centerLie` with the narrowest update that yields identical results (`updateWorldMatrix(true, false)` on the node: updates parents, not children). Visual result must be unchanged.
3. **WebGL leak:** in `NovaStage.dispose()` call `this.renderer.forceContextLoss()` after `this.renderer.dispose()`. In `webglAvailable()`, cache the result in a module-level variable and release the probe context with `gl.getExtension("WEBGL_lose_context")?.loseContext()`.
4. **Nova3D layout read:** the window `pointermove` handler in `Nova3D.jsx` must not call `canvas.getBoundingClientRect()` per event. Cache the rect; refresh it from a `ResizeObserver` on the canvas plus `scroll`/`resize` listeners, and once per animation frame at most while the pointer is moving (rAF-throttle the handler). Clean up all listeners/observers on unmount.

- [ ] **Step 1:** Implement 1-2. Run `npx vitest run src/companion/nova3d` and `npm run build`.
- [ ] **Step 2:** Implement 3-4. Run `npm run build`.
- [ ] **Step 3:** Run the smoke script. Then compare `%TEMP%/nova-smoke-load.png` and `nova-smoke-drag.png` against the Task 2 screenshots by eye: same pose and placement.
- [ ] **Step 4:** In `docs/PRODUCT_BACKLOG.md` delete the `TD-10` row.
- [ ] **Step 5:** Commit: `Phase 2.19 — NovaStage scratch objects, WebGL context release (TD-10)` with bullets for each of 1-4.

---

### Task 4: Module helpers out + `useTimeouts`

**Files:**
- Create: `src/companion/layer/constants.js` (all module constants, map 1a lines 82-157 incl. `TOURS`, `BUILTIN_ID`, `BUILTIN_NAME`)
- Create: `src/companion/layer/geometry.js` (`rand`, `randInt`, `rectOf`, `nextFrame`, `subscribeVisibility`, `pageShown`, `homeGeometry`, `homeSpot`, `overHome`, `dropTargetAt`, `markStage`, `builtinCourse`)
- Create: `src/companion/FocusPill.jsx`
- Create: `src/companion/hooks/useTimeouts.js`
- Create: `src/companion/hooks/useTimeouts.test.js`
- Modify: `src/companion/CompanionLayer.jsx`

**Interfaces:**
- Produces: `createTimeouts()` → `{ later(fn, ms): id, clear(id), clearAll() }` (pure, no React) and `useTimeouts()` → `later(fn, ms)` stable across renders, all pending ids cleared on unmount.

- [ ] **Step 1: Failing test** — `src/companion/hooks/useTimeouts.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeouts } from "./useTimeouts.js";

describe("createTimeouts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs callbacks once and forgets them", () => {
    const t = createTimeouts();
    const fn = vi.fn();
    t.later(fn, 100);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    t.clearAll();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clearAll cancels everything pending", () => {
    const t = createTimeouts();
    const a = vi.fn();
    const b = vi.fn();
    t.later(a, 50);
    t.later(b, 500);
    t.clearAll();
    vi.advanceTimersByTime(1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("clear cancels one", () => {
    const t = createTimeouts();
    const a = vi.fn();
    const b = vi.fn();
    const id = t.later(a, 50);
    t.later(b, 50);
    t.clear(id);
    vi.advanceTimersByTime(50);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/companion/hooks/useTimeouts.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** — `src/companion/hooks/useTimeouts.js`:

```js
import { useEffect, useRef } from "react";

/** Tracked setTimeout: `later` ids are forgotten when they fire; `clearAll` cancels the rest. */
export function createTimeouts() {
  const ids = new Set();
  return {
    later(fn, ms) {
      const id = globalThis.setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
      return id;
    },
    clear(id) {
      globalThis.clearTimeout(id);
      ids.delete(id);
    },
    clearAll() {
      for (const id of ids) globalThis.clearTimeout(id);
      ids.clear();
    },
  };
}

/** `later(fn, ms)` for fire-and-forget timeouts that must not outlive the component. */
export function useTimeouts() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createTimeouts();
  useEffect(() => () => ref.current.clearAll(), []);
  return ref.current.later;
}
```

(`globalThis` because vitest runs in node, where `window` is undefined.)

- [ ] **Step 4:** Test passes.
- [ ] **Step 5:** Move the module-scope code into `layer/constants.js`, `layer/geometry.js`, `FocusPill.jsx`; import them in `CompanionLayer.jsx`. Pure move, no edits to bodies.
- [ ] **Step 6:** In `CompanionLayer`, add `const later = useTimeouts();` in the preamble and route the uncleared timeouts at snapshot lines 557 (`pushPop`), 638 (`appear`), 883 (`showMe`), 1107, 1128, 1142 (onboarding forms), 1697 (`returnAfterDrop`), 1732 (`fall`), 1768 (E14 late quip), 1789 (E15 wake denial), 2230 (`briefEnd`), 2350 (E26 `back()`), 2498 (`onToday`) through `later(...)`. Leave the promise-based sleeps (`hold`, `waitToSpeak`, `scrollTo`, `nextFrame`) and the 0 ms `suppressClickRef` reset as they are. Add an unmount cleanup that calls `peekClipRef.current?.()` so the `clipBehind` rAF loop cannot outlive the component.
- [ ] **Step 7:** vitest, build, smoke. Report the new line count of `CompanionLayer.jsx`.
- [ ] **Step 8:** Commit: `Phase 2.19 — Companion helpers out, tracked timeouts`.

---

### Task 5: Leaf hooks — window events, sync, commands

**Files:**
- Create: `src/companion/hooks/useNovaWindowEvents.js` (map 2.16 window events E42, E43, E44, E45, plus E22 voice level; owns `settingsOpen`)
- Create: `src/companion/hooks/useNovaSync.js` (map 2.11: E24, E25; owns `sync`, `syncRef`, `offline`)
- Create: `src/companion/hooks/useNovaCommands.js` (map 2.13: `focusUntil`, `focusMinutesRef`, `api.startFocus`, `stopFocus`, E28, `onToday`, `api.runCommand`, E29 Ctrl+J; `focusRef` stays in core and is passed in and written by the hook)
- Modify: `src/companion/CompanionLayer.jsx`

**Interfaces:**
- `useNovaWindowEvents(core, deps)` → `{ settingsOpen, setSettingsOpen }`
- `useNovaSync(core, { flashReaction, sfx })` → `{ sync, syncRef, offline }`
- `useNovaCommands(core, { startQuiz, startHelp, closeHelp, later })` → `{ focusUntil, stopFocus }`

Each hook's parameter object lists exactly what it reads per the map; pass nothing extra. Call each hook at the position in `CompanionLayer` where its first state was declared before (hook order). `syncRef` is read by autonomy, idle life and the Director: they keep reading it from the hook's return value.

- [ ] **Step 1:** Extract `useNovaWindowEvents`; vitest + build + smoke.
- [ ] **Step 2:** Extract `useNovaSync`; vitest + build + smoke.
- [ ] **Step 3:** Extract `useNovaCommands`; vitest + build + smoke.
- [ ] **Step 4:** Commit: `Phase 2.19 — Nova window events, sync and command hooks`. Report line count.

---

### Task 6: Orchestrator hooks — nudges, director, study events + XP, memory voice

**Files:**
- Create: `src/companion/hooks/useNovaNudges.js` (map 2.12)
- Create: `src/companion/hooks/useNovaDirector.js` (map 2.14)
- Create: `src/companion/hooks/useNovaStudyEvents.js` (map 2.15: `drillRef`, E32, `rampantNow`, E33, `awardXp`, `pushPop`, `pops`, `popIdRef`; `now`/`setNow` stays in core because E1 sets it)
- Create: `src/companion/hooks/useNovaMemoryVoice.js` (map 2.6: `canSpeak`, `waitToSpeak`, `api.speakMemory`, `memoryActions`, `api.sayOpener`, `api.openWithMemory`, `api.onMemoryNews`, E7, `api.askName`, `api.askMore`, `api.greet`, `api.offerTour`; `openerDoneRef` stays in core)
- Modify: `src/companion/CompanionLayer.jsx`

**Interfaces:**
- `useNovaNudges(core, …)` → `{ dueNow }` (plus `api.nudgeDue`, `api.offerBriefing` assigned in body)
- `useNovaDirector(core, { dueNow, memoryActions, syncRef, … })` → nothing
- `useNovaStudyEvents(core, …)` → `{ awardXp, pushPop, pops }`
- `useNovaMemoryVoice(core, { startQuiz, startTour, returnHome, later, … })` → `{ memoryActions, canSpeak }`

Because `awardXp` is used by tours and quiz (extracted later, still inline here), call `useNovaStudyEvents` before the code that uses `awardXp`. `startQuiz`/`startTour` are still inline in `CompanionLayer` at this point: pass them in; if a hook needs a function declared later in the component body, pass a stable wrapper `(...a) => api.current.X(...a)` and assign `api.current.X` where the function is defined, rather than reordering behavior.

- [ ] **Step 1:** Nudges; vitest + build + smoke.
- [ ] **Step 2:** Director; vitest + build + smoke.
- [ ] **Step 3:** Study events + XP; vitest + build + smoke.
- [ ] **Step 4:** Memory voice; vitest + build + smoke.
- [ ] **Step 5:** Commit: `Phase 2.19 — Nova nudges, director, study events and memory hooks`. Report line count.

---

### Task 7: Quiz, tours/help/marks, briefing

**Files:**
- Create: `src/companion/hooks/useNovaQuiz.js` (map 2.5; `flashReaction` + `react` + `reactTimerRef` move to core, not the quiz hook)
- Create: `src/companion/hooks/useNovaMarks.js` (`marks`, `setMarks`, `setMarkTick`, `hasMarks`, E5)
- Create: `src/companion/hooks/useNovaTour.js` (map 2.3 minus marks: `tour`, `tourRef`, `ensureRoute`, `endTour`, `goStep`, `startTour`, E4)
- Create: `src/companion/hooks/useNovaHelp.js` (map 2.4: `help`, `startHelp`, `closeHelp`, `showMe`)
- Create: `src/companion/hooks/useNovaBriefing.js` (map 2.10: `briefRef`, `briefSpot`, `api.briefStart`, `faceToward`, `api.stageDeps`, `api.playScene`, `api.briefEnd`, E23; `stageRef` stays in core)
- Modify: `src/companion/CompanionLayer.jsx`

**Interfaces:**
- `useNovaMarks()` → `{ marks, setMarks }`
- `useNovaTour(core, { setMarks, awardXp, setHelp })` → `{ tour, setTour, tourRef, ensureRoute, endTour, goStep, startTour }`
- `useNovaHelp(core, { setMarks, ensureRoute, later })` → `{ help, setHelp, startHelp, closeHelp, showMe }`
- `useNovaQuiz(core, { awardXp, returnHome, setHelp, setMarks, onUpdateCourse })` → `{ quizDeck, builtinCards, glow, quizCourses, lastTierRef, startQuiz, dockPoint, onQuizAnswer, onQuizFinish, closeQuiz }`
- `useNovaBriefing(core, { ensureRoute, setMarks, glanceAtRect, setGlance, later })` → nothing (assigns `api.current.*`)

`setHelp` is used by tours and `setTour` cleanup by help/settings: create the `help` state before tours, or pass setters through stable wrappers; do not change which state updates happen on which event.

- [ ] **Step 1:** Marks + tours + help; vitest + build + smoke.
- [ ] **Step 2:** Quiz; vitest + build + smoke.
- [ ] **Step 3:** Briefing; vitest + build + smoke.
- [ ] **Step 4:** Commit: `Phase 2.19 — Nova quiz, tour, help and briefing hooks`. Report line count.

---

### Task 8: Drag hook + per-mousemove fix

**Files:**
- Create: `src/companion/hooks/useNovaDrag.js` (map 2.7: `dragging`, `dropMark`, `dropTarget`, `menuLine`, `clicksRef`, `spamUntilRef`, `suppressClickRef`, `swingRef`, `onScoutClick`, `swingStep`/`startSwing`/`releaseSwing`, E8, E9, `onPointerDown/Move/Up`; `dragRef` stays in core)
- Modify: `src/companion/CompanionLayer.jsx`
- Modify: `src/companion/nova3d/Nova3D.jsx` (wrap the export in `React.memo`)

**Interfaces:**
- `useNovaDrag(core, { houseAt, leaveHome, closeHelp, … })` → `{ dragging, dropTarget, menuLine, dropMarkRef, onScoutClick, onPointerDown, onPointerMove, onPointerUp }`

- [ ] **Step 1:** Pure move into `useNovaDrag`; vitest + build + smoke. Commit: `Phase 2.19 — Nova drag hook`.
- [ ] **Step 2:** Perf (map section 5): replace `dropMark` state with a ref to the `.nv-drop` element and write its `left`/`top`/visibility directly in `onPointerMove`, so a drag no longer re-renders `CompanionLayer` per pointermove. Wrap `Nova3D`'s export in `React.memo` and make sure every prop passed to it from `CompanionLayer` is referentially stable across renders that don't change it (memoize object/function props).
- [ ] **Step 3:** Verify the re-render is gone: temporarily add a render counter (`useRef` incremented in the body, exposed as `window.__novaRenders` in DEV only), extend a throwaway copy of the smoke drag check to print the count before and after the drag, confirm fewer than 10 renders for a 10-step drag, then remove the counter. Record the before/after numbers in the report.
- [ ] **Step 4:** vitest + build + smoke. Commit: `Phase 2.19 — Drag without per-move re-render`.

---

### Task 9: Idle life, placement, autonomy, input

**Files:**
- Create: `src/companion/hooks/useNovaIdleLife.js` (map 2.9)
- Create: `src/companion/hooks/useNovaPlacement.js` (map 2.1 + `api.fall`, `api.returnAfterDrop`: `housed`, `housedRef`, `homeSize`, `awayRef`, `growRef`, `grownSizeRef`, `houseAt`, `leaveHome`, `api.leaveHome`, `api.goHome`, `returnHome`, `api.backToSpot`, E11, E12, LE13)
- Create: `src/companion/hooks/useNovaAutonomy.js` (map 2.8: wander E10, idle gestures E14, wake E15, platform E16, perch E17-E18, covers content E19; owns `seat`, `seatRef`, `lastLandQuipRef`, `lastLateQuipRef`, `sitHoldRef`, `prevModeRef`, `wokeByRef`)
- Create: `src/companion/hooks/useNovaInput.js` (map 2.16: E26 welcome back, E34 global input, `api.summon`, `burst` + E35, E36 outside click, E37 Escape/resize, `prevSizeRef` + E38, E39-E41 bubble/anchor/talk)
- Modify: `src/companion/CompanionLayer.jsx`

`housedRef`, `leaveHome`, `api.goHome`, `api.backToSpot`, `platRef`, `activityRef`, `seat`, `glance` have many readers (map section 3): the owning hook returns them and `CompanionLayer` threads them to the others. `send`/`force` call `api.current.leaveHome` — keep that indirection.

- [ ] **Step 1:** Placement; vitest + build + smoke.
- [ ] **Step 2:** Idle life; vitest + build + smoke.
- [ ] **Step 3:** Autonomy; vitest + build + smoke.
- [ ] **Step 4:** Input; vitest + build + smoke.
- [ ] **Step 5:** Commit: `Phase 2.19 — Nova placement, idle life, autonomy and input hooks`. Report the final line count of `CompanionLayer.jsx` (expected: core state + plumbing + render, well under half of the original).

---

### Task 10: Docs

**Files:**
- Modify: `docs/PRODUCT_BACKLOG.md` (delete the `TD-11` row)
- Modify: `docs/ROADMAP.md` (Companion section: add a line `- ✓ Nova Core 6 command bar; CompanionLayer split into hooks (TD-10/TD-11).`)

- [ ] **Step 1:** Edit both files.
- [ ] **Step 2:** Commit: `Phase 2.19 — Docs for CompanionLayer split`.
