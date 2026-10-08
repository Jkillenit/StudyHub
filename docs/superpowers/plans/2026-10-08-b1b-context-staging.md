# B1b Context Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova's speech bubble sits by her head, she stands on top of tour targets that fit, and she leans on panel sides (idle activity + resting pose).

**Architecture:** `NovaStage` projects the head bone to box pixels each frame (pure `headAnchor` helper) and reports it through a callback; the layer writes `--nv-head-x/y` CSS vars that the bubble CSS reads. Two new pure-ish placement helpers in `safeZones.js` (`standOnTarget`, `findLeanSpot`) feed the tour and idle-life hooks. The lean is a procedural held pose in `NovaStage`, driven by a new `lean` prop.

**Tech Stack:** React 18, three.js + @pixiv/three-vrm (orthographic camera), vitest (node env, DOM faked with `vi.stubGlobal`).

**Spec:** `docs/superpowers/specs/2026-10-08-b1b-context-staging-design.md`

## Global Constraints

- CSS: only `--sh-*` tokens, no hardcoded colors; no new glow. Motion respects `html[data-motion="reduced"]` (never `@media (prefers-reduced-motion)`).
- No `console.log` / `console.error`. No new dependencies.
- Pure logic gets a vitest. vitest runs in **node** (no jsdom): fake `window` / `document` with `vi.stubGlobal` and `vi.unstubAllGlobals()` in `afterEach`.
- Sprite (portrait) mode keeps today's behavior for all three features.
- Every task: `npx vitest run` and `npm run build` pass before commit.
- Commit per task: subject `Phase 2.31 — Short description`, blank line, `- ` bullets. Write the message with the editor's Write tool to `.git/B1B_COMMIT_MSG` (UTF-8, no BOM; not `Set-Content`), then `git commit -F .git/B1B_COMMIT_MSG`. Stage files by explicit path. Never stage `.agents/`, `skills-lock.json`, `.cursor/`, `.superpowers/`, `scripts/__pycache__/`.
- Deviations from spec, decided while planning: (1) horizontal bubble placement keeps the box sides (`--left` / `--right`); only vertical placement and the `--center` bubble read the head vars. (2) No root x-shift for the lean: `findLeanSpot` places her box so her shoulder meets the edge.

## File map

| File | Change |
|------|--------|
| `src/companion/nova3d/headAnchor.js` | Create: pure head → box px projection |
| `src/companion/nova3d/headAnchor.test.js` | Create |
| `src/companion/nova3d/NovaStage.js` | Modify: `onHead` emit (Task 1); `lean` pose (Task 4) |
| `src/companion/nova3d/Nova3D.jsx` | Modify: `onHead` prop (Task 1); `lean` prop (Task 4) |
| `src/companion/CompanionLayer.jsx` | Modify: write head vars (Task 1); pass `lean` (Task 4) |
| `src/studyhub-bootstrap.css` | Modify: bubble vertical offsets read `--nv-head-y` |
| `src/companion/safeZones.js` | Modify: `standOnTarget` (Task 2); `findLeanSpot` + shared edge helper (Task 3) |
| `src/companion/safeZones.test.js` | Create (Task 2), extend (Task 3) |
| `src/companion/hooks/useNovaTour.js` | Modify: stand on target |
| `src/companion/hooks/useNovaIdleLife.js` | Modify: `lean` stage + resting lean |
| `src/companion/layer/constants.js` | Modify: `LEAN_MS` |
| `docs/ROADMAP.md`, `docs/PRODUCT_BACKLOG.md`, `docs/superpowers/specs/2026-10-01-build-path-design.md` | Modify (Task 5) |

---

### Task 1: Head-anchored bubble

**Files:**
- Create: `src/companion/nova3d/headAnchor.js`, `src/companion/nova3d/headAnchor.test.js`
- Modify: `src/companion/nova3d/NovaStage.js`, `src/companion/nova3d/Nova3D.jsx`, `src/companion/CompanionLayer.jsx`, `src/studyhub-bootstrap.css`

**Interfaces:**
- Produces: `headAnchor(world, cam, size, { seat = 0, flipped = false })` → `{ x, y }` (integers, px from the box's top-left). `world` is `{ x, y }` in world units; `cam` is `{ left, right, top, bottom }` (orthographic frustum); `seat` is the canvas drop as a fraction of the frame (`SEAT_FRAC * seatW`); `flipped` mirrors x (lying + facing left).
- Produces: `NovaStage#onHead` — `null` or `(p: {x, y} | null) => void`. `Nova3D` prop `onHead` (stable callback). CSS vars `--nv-head-x`, `--nv-head-y` on `.sc-scout`.

Background: the camera is orthographic, square frustum, and the canvas is exactly `size`×`size` CSS px inside `.sc-scout` (`.nv-3d` and `.nv-3d-canvas` are 100%). The only canvas offset is the inline transform from `placeSeat()`: `translateY(SEAT_FRAC * seatW * 100%)` and `scaleX(-1)` when lying and facing left. The bubble is a direct child of `.sc-scout`.

- [ ] **Step 1: Write the failing test** — `src/companion/nova3d/headAnchor.test.js`

```js
import { describe, expect, it } from "vitest";
import { headAnchor } from "./headAnchor.js";

const cam = { left: -0.9, right: 0.9, top: 1.8, bottom: 0 };

describe("headAnchor", () => {
  it("maps world units to box pixels", () => {
    expect(headAnchor({ x: 0, y: 1.4 }, cam, 180)).toEqual({ x: 90, y: 40 });
  });

  it("adds the seated canvas drop", () => {
    expect(headAnchor({ x: 0, y: 1.4 }, cam, 180, { seat: 0.27 })).toEqual({ x: 90, y: 89 });
  });

  it("mirrors x when the canvas is flipped", () => {
    expect(headAnchor({ x: 0.45, y: 1.4 }, cam, 180)).toEqual({ x: 135, y: 40 });
    expect(headAnchor({ x: 0.45, y: 1.4 }, cam, 180, { flipped: true })).toEqual({ x: 45, y: 40 });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/companion/nova3d/headAnchor.test.js` → fails: cannot find `./headAnchor.js`.

- [ ] **Step 3: Implement** — `src/companion/nova3d/headAnchor.js`

```js
/**
 * Where her head is inside her box, in px from the top-left. The camera is orthographic and
 * the canvas fills the `size` box, so it's a straight linear map; `seat` is the canvas drop
 * (fraction of the frame) while seated, `flipped` the lying mirror.
 */
export function headAnchor(world, cam, size, { seat = 0, flipped = false } = {}) {
  const fx = (world.x - cam.left) / (cam.right - cam.left);
  const fy = (cam.top - world.y) / (cam.top - cam.bottom);
  return { x: Math.round((flipped ? 1 - fx : fx) * size), y: Math.round((fy + seat) * size) };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run src/companion/nova3d/headAnchor.test.js`.

- [ ] **Step 5: Emit from `NovaStage`** — in `src/companion/nova3d/NovaStage.js`:

Add the import next to the `legSwing` import:

```js
import { headAnchor } from "./headAnchor.js";
```

Add a temp vector next to the other module temps (near `const _seatHips = new THREE.Vector3();`):

```js
const _headPx = new THREE.Vector3();
```

In the constructor, after `this.sizePx = 180;`:

```js
    /** Called with the head's box px ({ x, y }) when it moves 2px or more; null-safe. */
    this.onHead = null;
    this.headPx = null;
```

Add this method right after `placeSeat()`:

```js
  /** Report where her head is in the box, so the bubble can sit beside it. */
  emitHead() {
    if (!this.onHead) return;
    const node = this.vrm.humanoid.getNormalizedBoneNode("head");
    if (!node) return;
    const seat = this.seatW < 0.002 ? 0 : SEAT_FRAC * this.seatW;
    const p = headAnchor(node.getWorldPosition(_headPx), this.camera, this.sizePx, { seat, flipped: !!this.lying && this.state.facing < 0 });
    const last = this.headPx;
    if (last && Math.abs(last.x - p.x) < 2 && Math.abs(last.y - p.y) < 2) return;
    this.headPx = p;
    this.onHead(p);
  }
```

In `tick()`, change the end from:

```js
    this.vrm.update(dt);
    this.placeProps(dt);
    this.render();
```

to:

```js
    this.vrm.update(dt);
    this.placeProps(dt);
    this.emitHead();
    this.render();
```

In `setSize(px)`, add `this.headPx = null;` as the first line (forces a re-emit at the new size).

- [ ] **Step 6: Pass it through `Nova3D`** — in `src/companion/nova3d/Nova3D.jsx`:

Add `onHead,` to the destructured props (after `onFail,`). Change the callback ref lines to:

```js
  const cbRef = useRef({ onReady, onFail, onHead });
  cbRef.current = { onReady, onFail, onHead };
```

After `stageRef.current = stage;` add:

```js
    stage.onHead = (p) => cbRef.current.onHead?.(p);
```

In the effect cleanup, before `stage.dispose();` add:

```js
      cbRef.current.onHead?.(null);
```

Add to the JSDoc block: `` `onHead` gets her head's box px ({ x, y }) as it moves, and null on unmount. ``

- [ ] **Step 7: Write the vars in `CompanionLayer`** — in `src/companion/CompanionLayer.jsx`, after the `onBodyFail` line add:

```js
  /** Head position from the 3D body, as CSS vars the bubble reads; cleared when the body goes. */
  const onHead = useCallback((p) => {
    const st = nodeRef.current?.style;
    if (!st) return;
    if (!p) {
      st.removeProperty("--nv-head-x");
      st.removeProperty("--nv-head-y");
      return;
    }
    st.setProperty("--nv-head-x", `${p.x}px`);
    st.setProperty("--nv-head-y", `${p.y}px`);
  }, []);
```

`nodeRef` is declared a few lines below (`const nodeRef = useRef(null);`, line ~110); move that line up above this callback. Add `onHead={onHead}` to the `<Nova3D ... />` props after `onFail={onBodyFail}`.

- [ ] **Step 8: CSS** — in `src/studyhub-bootstrap.css`. `23%` is the fallback head height (standing), chosen so standing layout is unchanged; offsets are recomputed from today's values:

Replace

```css
.sc-bubble--center {
  left: 50%;
```

with

```css
.sc-bubble--center {
  left: var(--nv-head-x, 50%);
```

Replace

```css
.sc-bubble--above {
  bottom: 42%;
}
.sc-bubble--below {
  top: 30%;
}
```

with

```css
/* Vertical placement follows her head (--nv-head-y from the 3D body); 23% is her standing head. */
.sc-bubble--above {
  bottom: calc(100% - var(--nv-head-y, 23%) - 35%);
}
.sc-bubble--below {
  top: calc(var(--nv-head-y, 23%) + 7%);
}
```

Replace

```css
.sc-scout--home .sc-bubble--above {
  bottom: 62%;
}

.sc-scout--home .sc-bubble--center.sc-bubble--above {
  bottom: 92%;
}
```

with

```css
.sc-scout--home .sc-bubble--above {
  bottom: calc(100% - var(--nv-head-y, 23%) - 15%);
}

.sc-scout--home .sc-bubble--center.sc-bubble--above {
  bottom: calc(100% - var(--nv-head-y, 23%) + 15%);
}
```

- [ ] **Step 9: Calibrate the standing fallback** — run `npm run dev`, open the app in a browser, let Nova load standing, and in devtools read `getComputedStyle(document.querySelector('.sc-scout')).getPropertyValue('--nv-head-y')` and the box size. If her standing head isn't ~23% of the box (±3%), replace every `23%` from Step 8 with the measured percentage so standing bubbles land where they do today. Note the measured value in the commit message.

- [ ] **Step 10: Verify** — `npx vitest run` (all pass) and `npm run build` (succeeds).

- [ ] **Step 11: Commit**

```
Phase 2.31 — Bubble follows Nova's head

- headAnchor: head bone to box px (orthographic camera, seat drop, lying mirror), tested
- NovaStage emits head px on 2px moves; Nova3D onHead; layer writes --nv-head-x/y
- Bubble vertical offsets and the centered bubble read the head vars; sprite keeps box anchoring
```

Stage: `src/companion/nova3d/headAnchor.js src/companion/nova3d/headAnchor.test.js src/companion/nova3d/NovaStage.js src/companion/nova3d/Nova3D.jsx src/companion/CompanionLayer.jsx src/studyhub-bootstrap.css`

---

### Task 2: Stand on tour targets

**Files:**
- Modify: `src/companion/safeZones.js`, `src/companion/hooks/useNovaTour.js`
- Create: `src/companion/safeZones.test.js`

**Interfaces:**
- Produces: `standOnTarget(el, size)` → `{ x, y, plat: { el, top, left, right } }` or `null`. Exported from `safeZones.js`.
- Consumes (existing, in `safeZones.js`): `visibleRect`, `viewportBounds`, `coversContent`, `isClear`, `avoidRects`, `CONTENT_SELECTOR`, `NOT_CONTENT`, `MIN_PLATFORM_W` (120), `EDGE` (12), `TITLEBAR_H` (40). `core.use3dRef`, `core.platRef` in the tour hook.

- [ ] **Step 1: Write the failing test** — `src/companion/safeZones.test.js`

```js
import { afterEach, describe, expect, it, vi } from "vitest";
import { standOnTarget } from "./safeZones.js";

/** Fake element: `kinds` are the selector tokens it matches (e.g. "button", ".sh-panel"). */
function el(kinds, r, children = []) {
  const e = {
    kinds,
    children,
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }),
  };
  e.contains = (o) => o === e || children.includes(o);
  return e;
}

function stubDom(els, { w = 1200, h = 800 } = {}) {
  vi.stubGlobal("window", { innerWidth: w, innerHeight: h });
  vi.stubGlobal("document", {
    querySelector: () => null,
    querySelectorAll: (sel) => {
      const parts = sel.split(",").map((s) => s.trim());
      return els.filter((e) => e.kinds.some((k) => parts.includes(k)));
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("standOnTarget", () => {
  const S = 180;

  it("stands centered on a wide target with room above", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    stubDom([target]);
    const spot = standOnTarget(target, S);
    expect(spot).toMatchObject({ x: 410, y: 320 });
    expect(spot.plat).toMatchObject({ el: target, top: 500, left: 406, right: 594 });
  });

  it("ignores the panel that contains the target", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    const panel = el([".sh-panel"], { left: 300, top: 300, width: 500, height: 300 }, [target]);
    stubDom([panel, target]);
    expect(standOnTarget(target, S)).toMatchObject({ x: 410, y: 320 });
  });

  it("refuses a narrow target", () => {
    const target = el(["button"], { left: 400, top: 500, width: 80, height: 40 });
    stubDom([target]);
    expect(standOnTarget(target, S)).toBe(null);
  });

  it("refuses when she would cover text above it", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    const text = el(["p"], { left: 420, top: 380, width: 200, height: 20 });
    stubDom([target, text]);
    expect(standOnTarget(target, S)).toBe(null);
  });

  it("refuses when there's no headroom on screen", () => {
    const target = el(["button"], { left: 400, top: 150, width: 200, height: 40 });
    stubDom([target]);
    expect(standOnTarget(target, S)).toBe(null);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/companion/safeZones.test.js` → `standOnTarget is not a function` / not exported.

- [ ] **Step 3: Implement** — in `src/companion/safeZones.js`, add right after `standOn(...)`:

```js
/**
 * Standing on top of a tour target: only when it's wide enough to stand on, her whole box fits
 * on screen above it, and she wouldn't cover anything there. Returns { x, y, plat } or null.
 */
export function standOnTarget(el, size) {
  const r = visibleRect(el);
  if (!r || r.width < MIN_PLATFORM_W) return null;
  const plat = { el, top: r.top, left: Math.max(EDGE, r.left + 6), right: Math.min(window.innerWidth - EDGE, r.right - 6) };
  const p = { x: r.left + r.width / 2 - size / 2, y: r.top - size };
  const b = viewportBounds(size);
  if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return null;
  const rects = [...document.querySelectorAll(CONTENT_SELECTOR)]
    .filter((c) => c !== el && !el.contains(c) && !c.contains(el) && !c.closest(NOT_CONTENT))
    .map(visibleRect)
    .filter((c) => c && c.top < r.top - 2);
  if (coversContent(p, size, { rects }) || !isClear(p, size, avoidRects())) return null;
  return { ...p, plat };
}
```

(`isClear`, `avoidRects`, `visibleRect` are module-private functions defined above; that's fine inside the module.)

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run src/companion/safeZones.test.js`.

- [ ] **Step 5: Use it in the tour** — in `src/companion/hooks/useNovaTour.js`:

Import: change `import { clampPoint, pointBeside, waitForTarget } from "../safeZones.js";` to

```js
import { clampPoint, pointBeside, standOnTarget, waitForTarget } from "../safeZones.js";
```

Add `use3dRef, platRef` to the `core` destructure.

In `goStep`, change `let rect = null;` to

```js
      let rect = null;
      let on = null;
```

and replace

```js
        rect = el.getBoundingClientRect();
        p = pointBeside(rect, s, step.placement);
```

with

```js
        rect = el.getBoundingClientRect();
        on = use3dRef.current ? standOnTarget(el, s) : null;
        p = on || pointBeside(rect, s, step.placement);
```

After `if (tourRef.current !== t || t.token !== token) return;` (the one right after `await flyTo(...)`), add:

```js
      if (on) platRef.current = on.plat;
```

Replace the anchor line

```js
      setAnchor({ h, v: p.y > window.innerHeight / 2 ? "above" : "below" });
```

with

```js
      setAnchor({ h, v: on ? (p.y > 200 ? "above" : "below") : p.y > window.innerHeight / 2 ? "above" : "below" });
```

After `t.placement = step.placement;` add `t.on = !!on;`.

In the resize/scroll effect, replace

```js
          const p = pointBeside(t.el.getBoundingClientRect(), sizeRef.current, t.placement);
          jumpTo(p);
```

with

```js
          const on = t.on && use3dRef.current ? standOnTarget(t.el, sizeRef.current) : null;
          if (on) platRef.current = on.plat;
          jumpTo(on || pointBeside(t.el.getBoundingClientRect(), sizeRef.current, t.placement));
```

- [ ] **Step 6: Verify** — `npx vitest run` and `npm run build`.

- [ ] **Step 7: Commit**

```
Phase 2.31 — Nova stands on tour targets

- standOnTarget: wide-enough target, headroom on screen, nothing covered; tested
- Tour steps stand on the target when it fits (3D only), else beside it as before
- Her platform follows the target so she stays on it through scroll and resize
```

Stage: `src/companion/safeZones.js src/companion/safeZones.test.js src/companion/hooks/useNovaTour.js`

---

### Task 3: findLeanSpot (shared panel-edge search)

**Files:**
- Modify: `src/companion/safeZones.js`, `src/companion/safeZones.test.js`

**Interfaces:**
- Produces: `findLeanSpot(pos, size, current, { maxDist = 420 })` → `{ x, y, el, outward, side }` or `null`. `outward` is -1/1 (direction she faces, away from the wall); `side` is `"left" | "right"` — the screen side the wall is on (`outward < 0` → `"right"`).
- `findPeekSpot` keeps its signature and results.

- [ ] **Step 1: Write the failing tests** — append to `src/companion/safeZones.test.js` (add `findLeanSpot, findPeekSpot` to the import from `./safeZones.js`):

```js
describe("panel edges: peek and lean", () => {
  const S = 180;
  /* Ground top is 800 - 12 = 788, so standing on it puts her box at y = 608. */
  const pos = { x: 300, y: 608 };
  const panel = () => el([".sh-panel"], { left: 600, top: 500, width: 300, height: 288 });

  it("leans just outside the near edge, facing away from it", () => {
    const p = panel();
    stubDom([p]);
    const spot = findLeanSpot(pos, S, null);
    expect(spot).toMatchObject({ el: p, outward: -1, side: "right", y: 608 });
    expect(spot.x).toBeCloseTo(600 - S * 0.14 - S / 2);
  });

  it("finds nothing when the panel is too short to lean on", () => {
    stubDom([el([".sh-panel"], { left: 600, top: 728, width: 300, height: 60 })]);
    expect(findLeanSpot(pos, S, null)).toBe(null);
  });

  it("respects maxDist", () => {
    stubDom([panel()]);
    expect(findLeanSpot(pos, S, null, { maxDist: 100 })).toBe(null);
  });

  it("peek still hides just inside the edge", () => {
    stubDom([panel()]);
    expect(findPeekSpot(pos, S, null)).toMatchObject({ outward: -1, x: 600 + S * 0.1 - S / 2, y: 608 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/companion/safeZones.test.js` → `findLeanSpot` not exported (the peek test should already pass; it pins current behavior).

- [ ] **Step 3: Implement** — in `src/companion/safeZones.js`, replace the whole `findPeekSpot` function (doc comment included) with:

```js
/** How far outside a panel edge her box center sits when she leans on it, so her shoulder meets it. */
const LEAN_GAP = 0.14;

/**
 * A panel edge on her current platform that covers most of her height, and a clear walk to it.
 * Her box center goes `inset` px inside the edge (negative: outside). `outward` points from the
 * panel toward open space. Returns { x, y, el, outward } or null.
 */
function panelEdgeSpot(pos, size, current, { maxDist, minDist, inset }) {
  const plat = livePlatform(current, size) || platformAt(pos, size) || groundPlatform();
  const feet = pos.y + size;
  const top = pos.y + size * 0.12;
  const bottom = feet - size * 0.05;
  const cx = pos.x + size / 2;
  const options = [];
  for (const el of document.querySelectorAll(PANEL_SELECTOR)) {
    if (el.closest(NOT_CONTENT)) continue;
    const r = visibleRect(el);
    if (!r || r.width < size * 0.6) continue;
    if (Math.min(r.bottom, bottom) - Math.max(r.top, top) < (bottom - top) * 0.6) continue;
    const outward = cx < r.left ? -1 : cx > r.right ? 1 : 0;
    if (!outward) continue;
    const edge = outward < 0 ? r.left : r.right;
    const x = edge - outward * inset;
    if (x < plat.left || x > plat.right || Math.abs(x - cx) < minDist || Math.abs(x - cx) > maxDist) continue;
    options.push({ el, x: x - size / 2, y: feet - size, outward });
  }
  if (!options.length) return null;
  const all = [...document.querySelectorAll(CONTENT_SELECTOR)];
  for (const o of options.sort(() => Math.random() - 0.5)) {
    const rects = all
      .filter((el) => el !== o.el && !o.el.contains(el) && !el.contains(o.el) && !el.closest(NOT_CONTENT))
      .map(visibleRect)
      .filter((r) => r && r.top < feet - 2);
    const steps = Math.max(1, Math.ceil(Math.abs(o.x - pos.x) / (size * 0.3)));
    let clear = true;
    for (let i = 1; i <= steps && clear; i += 1) {
      if (coversContent({ x: pos.x + ((o.x - pos.x) * i) / steps, y: o.y }, size, { rects })) clear = false;
    }
    if (clear) return o;
  }
  return null;
}

/**
 * A panel she can hide behind: she stands just inside the near edge and peeks out toward
 * open space (`outward`). Returns { x, y, el, outward } or null.
 */
export function findPeekSpot(pos, size, current, { maxDist = 420 } = {}) {
  return panelEdgeSpot(pos, size, current, { maxDist, minDist: 40, inset: size * 0.1 });
}

/**
 * A panel side she can lean on: she stands just outside the edge, shoulder on it, facing away
 * (`outward`). `side` is the screen side the wall is on. Returns { x, y, el, outward, side } or null.
 */
export function findLeanSpot(pos, size, current, { maxDist = 420 } = {}) {
  const spot = panelEdgeSpot(pos, size, current, { maxDist, minDist: 0, inset: -size * LEAN_GAP });
  return spot && { ...spot, side: spot.outward < 0 ? "right" : "left" };
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/companion/safeZones.test.js`.

- [ ] **Step 5: Verify** — `npx vitest run` and `npm run build`.

- [ ] **Step 6: Commit**

```
Phase 2.31 — Lean spots on panel sides

- findLeanSpot: just outside a panel edge on her platform, shoulder on it, facing away
- Peek and lean share one panel-edge search; peek behavior unchanged (pinned by a test)
```

Stage: `src/companion/safeZones.js src/companion/safeZones.test.js`

---

### Task 4: Lean pose, idle lean, resting lean

**Files:**
- Modify: `src/companion/nova3d/NovaStage.js`, `src/companion/nova3d/Nova3D.jsx`, `src/companion/hooks/useNovaIdleLife.js`, `src/companion/layer/constants.js`, `src/companion/CompanionLayer.jsx`

**Interfaces:**
- Consumes: `findLeanSpot(pos, size, current, { maxDist })` → `{ x, y, el, outward, side }` (Task 3). `mayPeek({ idleMs, lastPeek, now })` from `idleStages.js` (existing, reused as the lean chance gate).
- Produces: `NovaStage` state `lean: "left" | "right" | null`; `Nova3D` prop `lean`; `useNovaIdleLife` returns `lean` in addition to its current values and takes `dragging` and `gait` options.

- [ ] **Step 1: Pose in `NovaStage`** — in `src/companion/nova3d/NovaStage.js`:

Add near `SEAT_PLAYFUL`:

```js
/**
 * Leaning on a panel side: arms crossed, torso tilted into the wall, head tipped back the other way.
 * LEAN_TILT is the spine roll toward the wall for `lean: "right"`; "left" mirrors it.
 */
const LEAN_TILT = 0.12;
const LEAN_ARMS = bothArms(dir(0.25, -0.8, 0.45), dir(-0.85, 0.15, 0.5), dir(-0.9, 0.2, 0.3));
```

Add `lean: null` to the `this.state` default object in the constructor, and `this.leanW = 0;` after `this.lieW = 0;`.

In `tick()`, after the line `this.lieW = ease(this.lieW, lying ? 1 : 0, 4);` add:

```js
    const leaning = !!s.lean && !lying && !seated && !s.gait && !s.held && !this.oneShot;
    this.leanW = ease(this.leanW, leaning ? 1 : 0, 4);
    if (leaning) this.leanSide = s.lean === "right" ? 1 : -1;
```

After the `if (this.cardsW > 0.01) this.applyArmPose(CARDS_ARMS, this.cardsW);` line add:

```js
    if (this.leanW > 0.01) {
      const tilt = LEAN_TILT * (this.leanSide || 1);
      this.applyArmPose(LEAN_ARMS, this.leanW);
      this.bend("spine", [0, 0, tilt], this.leanW);
      this.bend("chest", [0, 0, tilt * 0.7], this.leanW);
      this.bend("head", [0, 0, -tilt], this.leanW);
    }
```

`Nova3D.jsx`: add `lean = null,` to the props (after `seat = null,`), add `lean` to both the `set({...})` object and its dependency array, and add to the JSDoc: `` `lean` ("left" | "right", the side the wall is on) holds her leaning on a panel side. ``

- [ ] **Step 2: Calibrate the pose visually** — `npm run dev`; in devtools on the running app you can't reach the stage directly, so temporarily (do not commit) pass `lean="right"` as a literal on `<Nova3D>` in `CompanionLayer.jsx`, reload, and screenshot. Expected: torso tilts toward screen-right, head tips back left, forearms cross in front of her chest. If the tilt goes the wrong way, flip the sign of `LEAN_TILT`. If the arms look wrong, adjust only the `LEAN_ARMS` vectors (world directions relative to the chest: +x her left, +y up, +z toward camera). Remove the literal before continuing.

- [ ] **Step 3: Constant** — in `src/companion/layer/constants.js`, next to `READ_MS`, add:

```js
/** How long she leans on a panel side as an idle activity. */
export const LEAN_MS = [20000, 40000];
```

- [ ] **Step 4: Idle life** — in `src/companion/hooks/useNovaIdleLife.js`:

Imports: add `findLeanSpot` to the `../safeZones.js` import and `LEAN_MS` to the `../layer/constants.js` import.

Signature: change to

```js
export function useNovaIdleLife(core, { mode, facing, bodyReady, ticking, quiet, syncRef, housedRef, setSeat, dragging, gait }) {
```

Add `jumpTo` to the `core` destructure.

State, next to `const [drowsy, setDrowsy] = useState(false);`:

```js
  /** Leaning on a panel side ("left" | "right", where the wall is), as an activity or her resting pose. */
  const [lean, setLean] = useState(null);
  const lastLeanRef = useRef(0);
  /** Where she last checked for a wall to rest against, so the DOM scan runs once per spot. */
  const restCheckedRef = useRef(null);
```

In `clearActivityVisuals`, add as the first lines:

```js
    setLean(null);
    restCheckedRef.current = null;
```

After the existing `useEffect(() => { if (mode !== "play" && activityRef.current) api.current.endActivity(); }, [mode]);` add:

```js
  /* Moving, being grabbed or leaving idle ends a lean. */
  useEffect(() => {
    if ((mode !== "idle" && mode !== "play") || dragging || gait) {
      setLean(null);
      restCheckedRef.current = null;
    }
  }, [mode, dragging, gait]);
```

Add a stage after `peek` inside `api.current.stages`:

```js
    /* Once in a while: walks to a panel side and leans on it for a while, then walks back. */
    lean: async (tk) => {
      const s = sizeRef.current;
      const start = { ...posRef.current };
      const spot = findLeanSpot(start, s, platRef.current);
      if (!spot) return;
      const wasAway = awayFromSpotRef.current;
      awayFromSpotRef.current = true;
      const speed = (MOVE[stateRef.current?.movement] || MOVE.normal).speed;
      tk.moving = true;
      const there = await flyTo({ x: spot.x, y: spot.y }, { speed, walk: true });
      tk.moving = false;
      if (!there || tk.aborted) return;
      setFacing(spot.outward);
      setLean(spot.side);
      if (!(await hold(rand(LEAN_MS), tk))) return;
      setLean(null);
      if (!(await hold(600, tk))) return;
      tk.moving = true;
      const back = await flyTo(start, { speed, walk: true });
      tk.moving = false;
      if (back && !tk.aborted) awayFromSpotRef.current = wasAway;
    },
```

In `api.current.idleTick`, replace the final peek block

```js
    if (body3d && !housedRef.current && mayPeek({ idleMs, lastPeek: lastPeekRef.current, now })) {
      lastPeekRef.current = now;
      void api.current.runStage("peek");
    }
```

with

```js
    if (!body3d || housedRef.current) return;
    if (mayPeek({ idleMs, lastPeek: lastPeekRef.current, now })) {
      lastPeekRef.current = now;
      void api.current.runStage("peek");
      return;
    }
    if (mayPeek({ idleMs, lastPeek: lastLeanRef.current, now })) {
      lastLeanRef.current = now;
      void api.current.runStage("lean");
      return;
    }
    restLean();
```

Add this helper just above `api.current.idleTick`:

```js
  /** Idle at her own spot right beside a panel side: she leans on it until she next moves. */
  const restLean = () => {
    if (modeRef.current !== "idle" || awayFromSpotRef.current || lean) return;
    const s = sizeRef.current;
    const p = posRef.current;
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (restCheckedRef.current === key) return;
    restCheckedRef.current = key;
    const spot = findLeanSpot(p, s, platRef.current, { maxDist: s / 3 });
    if (!spot) return;
    if (Math.abs(spot.x - p.x) > 0.5) jumpTo({ x: spot.x, y: spot.y });
    restCheckedRef.current = `${Math.round(spot.x)},${Math.round(spot.y)}`;
    setFacing(spot.outward);
    setLean(spot.side);
  };
```

Return value: add `lean` to the returned object.

- [ ] **Step 5: Wire the layer** — in `src/companion/CompanionLayer.jsx`:

Add `lean` to the destructure of `useNovaIdleLife(...)` (line ~505), and add `dragging, gait,` to its options object. Both are already declared above that call: `dragging` from `useNovaDrag` (line ~464), `gait` from `useCompanionMotion` (line ~117).

Add to `<Nova3D ... />` after the `seat=` line:

```jsx
                    lean={mode === "idle" || mode === "play" ? lean : null}
```

- [ ] **Step 6: Verify** — `npx vitest run` and `npm run build`. Then `npm run dev`: leave the app idle on a course page with panels and confirm she eventually walks to a panel side and leans (lean and peek share the ~25s-average chance after 20s idle, each with a 4 min cooldown), and that moving the mouse ends it.

- [ ] **Step 7: Commit**

```
Phase 2.31 — Nova leans on panel sides

- NovaStage lean pose: crossed arms, torso into the wall, eased like the seat; Nova3D lean prop
- Idle lean stage: walks to a panel side, leans 20-40s, walks back (same chance as peek)
- Resting lean: idle at her own spot beside a panel side, she leans until she moves
```

Stage: `src/companion/nova3d/NovaStage.js src/companion/nova3d/Nova3D.jsx src/companion/hooks/useNovaIdleLife.js src/companion/layer/constants.js src/companion/CompanionLayer.jsx`

---

### Task 5: Docs (controller runs screenshots)

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/PRODUCT_BACKLOG.md`, `docs/superpowers/specs/2026-10-01-build-path-design.md`

- [ ] **Step 1: ROADMAP** — in `docs/ROADMAP.md`, replace the C.7 line

```
- ○ C.7 Context staging: on top of the quiz panel, standing on tour targets, bubble follows her head,
  leaning on panel sides.
```

with

```
- ✓ C.7 Context staging (Phase 2.31): bubble follows her head (3D), she stands on tour targets that
  fit, and leans on panel sides (idle activity + resting pose). Standing on the quiz panel was dropped:
  sessions have their own Nova lane.
```

and in the Phase 2 section change `Nova's quiz has no exam mode yet; head-anchored staging is C.7 (B1b).` to `Nova's quiz has no exam mode yet. Head-anchored staging shipped with C.7 (B1b, Phase 2.31).`

- [ ] **Step 2: Backlog** — in `docs/PRODUCT_BACKLOG.md`, find the C.7 entry (search `C.7`) and mark it shipped in the file's existing style with `Phase 2.31`, noting the quiz-panel part was dropped.

- [ ] **Step 3: Build path** — in `docs/superpowers/specs/2026-10-01-build-path-design.md`, in the B1 row replace `**B1b (C.7 staging) next.**` with `**B1b ✓ Shipped (Phase 2.31):** C.7 staging. Spec \`docs/superpowers/specs/2026-10-08-b1b-context-staging-design.md\`, plan \`docs/superpowers/plans/2026-10-08-b1b-context-staging.md\`. **B2 next.**`

- [ ] **Step 4: Commit**

```
Phase 2.31 — Build path: B1b shipped

- ROADMAP, backlog and build path mark C.7 context staging shipped
```

Stage: `docs/ROADMAP.md docs/PRODUCT_BACKLOG.md docs/superpowers/specs/2026-10-01-build-path-design.md`

- [ ] **Step 5 (controller, not a subagent): screenshots** — with `webapp-testing` (`scripts/with_server.py --help` first) against the Vite dev server: a bubble while she's standing (should match pre-change placement), a bubble while seated (should sit by her head, not float above), a tour step standing on a target. Lean is checked live in Task 4 Step 6.
