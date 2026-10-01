# UI Overhaul 1 — Foundation (tokens, fonts, ambient) Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development to execute this plan task by task.

**Goal:** Re-skin the whole app to the approved palette, type and hard-edged shape by changing token values only, and add the drifting-line ambient background.

**Architecture:** Every screen already reads `--sh-*` tokens from `:root` in `src/studyhub-bootstrap.css`, so new values re-skin everything without touching components. Literal `border-radius` values are zeroed. The ambient layer is one fixed `<canvas>` behind the app shell, driven by a pure geometry module.

**Tech Stack:** React 18, Vite, vitest, `@fontsource/*`.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` (§2 tokens, §3 type/shape, §4 ambient).

## Global Constraints

- Keep every existing `--sh-*` token name; change values only. New tokens: `--sh-side`, `--sh-accent-2`, `--sh-accent-2-soft`, `--sh-accent-2-line`, `--sh-cut`, `--sh-font-display`.
- Never hardcode colors outside `:root`; `color-mix()` over tokens is fine.
- Motion only via `html[data-motion]` / `useReducedMotion()` from `src/shell/motion.js`. Never `@media (prefers-reduced-motion)`.
- No `console.*` in production code.
- Do not touch OM 300 content (`src/study/sections`, `src/glossary/courseData.js`).
- Every task ends with `npm run test` and `npm run build` passing.
- Commit format: `Phase 2.22 — Short description` + bullets, message written UTF-8 without BOM and committed with `git commit -F`.

---

### Task 1: Fonts, tokens, radius

**Files:**
- Modify: `package.json` (via npm), `src/main.jsx`, `src/desktop/OverlayApp.jsx`, `src/studyhub-bootstrap.css`, `.cursorrules`
- Create: `src/studyhub-tokens.test.js`

- [ ] **Step 1: Write the failing token test** — `src/studyhub-tokens.test.js`:

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studyhub-bootstrap.css", import.meta.url), "utf8");
const start = css.indexOf(":root {");
const root = css.slice(start, css.indexOf("}", start));
const token = (name) => root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

describe("design tokens", () => {
  it("uses the aqua/magenta palette on true black", () => {
    expect(token("sh-bg")).toBe("#04050A");
    expect(token("sh-accent")).toBe("#4CF0E8");
    expect(token("sh-accent-2")).toBe("#FF4FD8");
    expect(token("sh-danger")).toBe("#FF4D4F");
    expect(token("sh-warn")).toBe("#FFC857");
  });

  it("uses Geist and Michroma", () => {
    expect(token("sh-font-body")).toMatch(/^"Geist Sans"/);
    expect(token("sh-font-mono")).toMatch(/^"Geist Mono"/);
    expect(token("sh-font-display")).toMatch(/^"Michroma"/);
    expect(css).not.toMatch(/Manrope|Chakra Petch|JetBrains Mono/);
  });

  it("has no rounded corners", () => {
    for (const r of ["xl", "lg", "md", "sm", "xs"]) expect(token(`sh-radius-${r}`)).toBe("0");
    const literals = [...css.matchAll(/border-radius:\s*([^;]+);/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^(0|inherit|var\(--sh-radius-[a-z]+\))( !important)?$/.test(v));
    expect(literals).toEqual([]);
  });

  it("drops the background grid", () => {
    expect(css).not.toMatch(/--sh-grid-line/);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npx vitest run src/studyhub-tokens.test.js` → FAIL on every case.

- [ ] **Step 3: Swap font packages**

```powershell
npm i @fontsource/michroma @fontsource/geist-sans @fontsource/geist-mono
npm uninstall @fontsource/manrope @fontsource/chakra-petch @fontsource/jetbrains-mono
```

Confirm the real family names: `rg "font-family" node_modules/@fontsource/geist-sans/400.css node_modules/@fontsource/geist-mono/400.css node_modules/@fontsource/michroma/400.css`. If they differ from `Geist Sans` / `Geist Mono` / `Michroma`, use the real names in Step 4 and in the test.

- [ ] **Step 4: Replace font imports**

In `src/main.jsx`, replace the Manrope / Chakra Petch / JetBrains Mono imports with:

```js
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/michroma/400.css";
```

In `src/desktop/OverlayApp.jsx`, replace the two font imports with:

```js
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-mono/500.css";
```

Then `rg "manrope|chakra-petch|jetbrains-mono" src electron` must return nothing.

- [ ] **Step 5: Replace the `:root` token values** in `src/studyhub-bootstrap.css` (lines 3–76). Keep the comments/sections; set:

```css
  /* surfaces */
  --sh-bg: #04050A;
  --sh-side: #030407;
  --sh-panel: rgba(14, 16, 24, 0.72);
  --sh-panel-strong: rgba(14, 16, 24, 0.86);
  --sh-panel-solid: #0E1018;
  --sh-border: rgba(255, 255, 255, 0.08);
  --sh-border-strong: rgba(255, 255, 255, 0.15);
  --sh-track: rgba(255, 255, 255, 0.08);
  --sh-scrim: rgba(4, 5, 10, 0.72);

  /* text */
  --sh-text: #F5F7FA;
  --sh-text-strong: #FFFFFF;
  --sh-text-2: #A9B0BC;
  --sh-text-3: #757D8A;

  /* accent: aqua primary, magenta secondary (corners, ambient, aura only) */
  --sh-accent: #4CF0E8;
  --sh-accent-hover: #8AF7F2;
  --sh-accent-press: #22C9C1;
  --sh-accent-ink: #021412;
  --sh-accent-soft: color-mix(in oklab, var(--sh-accent) 8%, transparent);
  --sh-accent-line: color-mix(in oklab, var(--sh-accent) 38%, transparent);
  --sh-accent-glow: color-mix(in oklab, var(--sh-accent) 35%, transparent);
  --sh-link: #9CF7F2;
  --sh-accent-2: #FF4FD8;
  --sh-accent-2-soft: color-mix(in oklab, var(--sh-accent-2) 10%, transparent);
  --sh-accent-2-line: color-mix(in oklab, var(--sh-accent-2) 40%, transparent);

  /* meaning colors: only when earned */
  --sh-warn: #FFC857;
  --sh-warn-text: #FFD27A;
  --sh-warn-soft: color-mix(in oklab, var(--sh-warn) 12%, transparent);
  --sh-warn-line: color-mix(in oklab, var(--sh-warn) 35%, transparent);
  --sh-danger: #FF4D4F;
  --sh-danger-text: #FF7375;
  --sh-danger-soft: color-mix(in oklab, var(--sh-danger) 10%, transparent);
  --sh-danger-wash: color-mix(in oklab, var(--sh-danger) 7%, transparent);
  --sh-danger-line: color-mix(in oklab, var(--sh-danger) 32%, transparent);
```

Leave `--sh-danger-chip-*`, `--sh-danger-link`, `--sh-crimson*` as they are. Delete `--sh-grid-line`. Then:

```css
  /* type */
  --sh-font-body: "Geist Sans", system-ui, sans-serif;
  --sh-font-display: "Michroma", "Geist Sans", sans-serif;
  --sh-font-mono: "Geist Mono", ui-monospace, monospace;
  /* deprecated: HUD labels are mono now */
  --sh-font-hud: var(--sh-font-mono);

  /* shape: hard edges; chamfer size for .sh-cut */
  --sh-radius-xl: 0;
  --sh-radius-lg: 0;
  --sh-radius-md: 0;
  --sh-radius-sm: 0;
  --sh-radius-xs: 0;
  --sh-cut: 12px;
```

Depth, layout, legacy and bootstrap sections stay unchanged.

- [ ] **Step 6: Remove the grid background** — find the `.sh-app-shell` rule (~line 7521) that uses `--sh-grid-line` and replace it with:

```css
.sh-app-shell {
  background-color: var(--sh-bg);
}
```

- [ ] **Step 7: Zero literal radii** — `rg -n "border-radius:\s*[^v0]" src/studyhub-bootstrap.css` and set each to `0` (keep `!important` where present). Also replace any literal `Manrope` / `Chakra Petch` / `JetBrains Mono` font-family in the CSS with the matching token (`var(--sh-font-body)` / `var(--sh-font-mono)`). Also check `rg -n "borderRadius" src` for inline JSX radii and zero any that are not `0`/token; list them in the report.

- [ ] **Step 8: Run tests and build** — `npm run test` (all pass, including the new file) and `npm run build` (passes).

- [ ] **Step 9: Update `.cursorrules`** — in `## CSS DESIGN SYSTEM`, replace the paragraphs from `Holographic HUD look.` through `Minimum text size 11px.` with:

```
Hard-edged HUD on true black. Spec: docs/superpowers/specs/2026-10-01-ui-overhaul-design.md.
NEVER hardcode colors, fonts, radii or shadows. ALWAYS use tokens
(defined in :root of studyhub-bootstrap.css; color-mix() over tokens is fine):
 Surfaces: --sh-bg --sh-side --sh-panel --sh-panel-strong --sh-panel-solid (floating UI)
 Lines: --sh-border --sh-border-strong --sh-track
 Accent: --sh-accent --sh-accent-soft --sh-accent-line --sh-accent-hover
 Secondary: --sh-accent-2 (magenta) for chamfer corners, ambient lines, auras ONLY
 States: --sh-warn(-soft/-line) --sh-danger(-soft/-line)
 Text: --sh-text --sh-text-2 --sh-text-3 (never dimmer than text-3)
 Shape: radius is 0 everywhere; --sh-cut chamfer; --sh-shadow-panel --sh-glow-accent
Aqua (--sh-accent) is the only interactive accent. No terminal green.
Glow only on the single most important element on screen.

Typography (fonts bundled via @fontsource, never a CDN):
 - Display: --sh-font-display (Michroma), uppercase, letter-spacing 0.06em
 - Content: --sh-font-body (Geist). Task titles 17-18px / 600.
 - Numbers, times, codes, HUD labels: --sh-font-mono (Geist Mono)
 - Scale: 11 / 12.5 / 14 / 17-18 / 22-24 / 28-30. Minimum 11px.
```
- [ ] **Step 10: Commit**

```
Phase 2.22 — UI overhaul tokens, fonts, hard edges

- Aqua/magenta palette on true black via existing --sh-* names
- Geist / Geist Mono / Michroma replace Manrope / JetBrains Mono / Chakra Petch
- Radius 0 everywhere, background grid removed, token test added
- .cursorrules design system updated
```

---

### Task 2: Ambient background

**Files:**
- Create: `src/shell/ambient.js`, `src/shell/ambient.test.js`, `src/shell/AmbientBackground.jsx`
- Modify: `src/studyhub-bootstrap.css`, `src/app/StudyHubApp.jsx`

**Interfaces:**
- `ambientY(i, count, x, w, h, t) -> number` — y of line `i` at `x`, time `t` seconds.
- `ambientAlpha(i, t) -> number` — opacity of line `i`, always within 0.02–0.07.
- `<AmbientBackground />` — no props.

- [ ] **Step 1: Failing test** — `src/shell/ambient.test.js`:

```js
import { describe, expect, it } from "vitest";
import { AMBIENT_LINES, ambientAlpha, ambientY } from "./ambient.js";

describe("ambient geometry", () => {
  it("keeps every line near its own band", () => {
    const w = 1440, h = 900;
    for (let i = 0; i < AMBIENT_LINES; i++) {
      const band = (h * (i + 0.5)) / AMBIENT_LINES;
      for (let x = 0; x <= w; x += 90) {
        for (const t of [0, 7.3, 120]) {
          expect(Math.abs(ambientY(i, AMBIENT_LINES, x, w, h, t) - band)).toBeLessThanOrEqual(h * 0.08 + 1e-9);
        }
      }
    }
  });

  it("is deterministic and actually moves", () => {
    expect(ambientY(3, 12, 400, 1000, 800, 2)).toBe(ambientY(3, 12, 400, 1000, 800, 2));
    expect(ambientY(3, 12, 400, 1000, 800, 2)).not.toBe(ambientY(3, 12, 400, 1000, 800, 5));
  });

  it("stays faint", () => {
    for (let i = 0; i < AMBIENT_LINES; i++) {
      for (const t of [0, 1, 2.5, 10, 99]) {
        const a = ambientAlpha(i, t);
        expect(a).toBeGreaterThanOrEqual(0.02);
        expect(a).toBeLessThanOrEqual(0.07);
      }
    }
  });
});
```

Run `npx vitest run src/shell/ambient.test.js` → FAIL (module missing).

- [ ] **Step 2: Implement `src/shell/ambient.js`**

```js
export const AMBIENT_LINES = 12;

export function ambientY(i, count, x, w, h, t) {
  const band = (h * (i + 0.5)) / count;
  const u = x / w;
  return band
    + Math.sin(u * 6 + t * 0.25 + i * 0.7) * h * 0.06
    + Math.sin(u * 13 - t * 0.15 + i) * h * 0.02;
}

export function ambientAlpha(i, t) {
  return 0.045 + 0.025 * Math.sin(t * 0.3 + i);
}
```

Run the test → PASS.

- [ ] **Step 3: Implement `src/shell/AmbientBackground.jsx`**

```jsx
import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion.js";
import { AMBIENT_LINES, ambientAlpha, ambientY } from "./ambient.js";

export function AmbientBackground() {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const css = getComputedStyle(document.documentElement);
    const colors = ["--sh-accent", "--sh-accent-2"].map((v) => css.getPropertyValue(v).trim());
    let w = 0;
    let h = 0;
    let t = 0;
    let raf = 0;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.width = canvas.offsetWidth * dpr;
      h = canvas.height = canvas.offsetHeight * dpr;
      ctx.lineWidth = dpr;
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < AMBIENT_LINES; i++) {
        ctx.strokeStyle = colors[i % 2];
        ctx.globalAlpha = ambientAlpha(i, t);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = ambientY(i, AMBIENT_LINES, x, w, h, t);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    const frame = () => {
      draw();
      t += 1 / 60;
      raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      size();
      if (reduced) draw();
    };

    size();
    window.addEventListener("resize", onResize);
    if (reduced) draw();
    else frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  return <canvas ref={ref} className="sh-ambient" aria-hidden="true" />;
}
```

- [ ] **Step 4: CSS** — replace the Task 1 `.sh-app-shell` rule with:

```css
.sh-app-shell {
  isolation: isolate;
  background-color: var(--sh-bg);
  background-image:
    radial-gradient(55% 60% at 18% 6%, color-mix(in oklab, var(--sh-accent) 13%, transparent), transparent 70%),
    radial-gradient(55% 60% at 88% 92%, color-mix(in oklab, var(--sh-accent-2) 20%, transparent), transparent 70%);
}

.sh-ambient {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  pointer-events: none;
}
```

- [ ] **Step 5: Mount** — in `src/app/StudyHubApp.jsx`, `import { AmbientBackground } from "../shell/AmbientBackground.jsx";` and render `<AmbientBackground />` as the first child of the `sh-app-root sh-app-shell` div (before `<ApiStatusSync />`).

- [ ] **Step 6: Make page wrappers see-through** — the canvas sits behind the shell, so full-page wrappers painted with `var(--sh-bg)` hide it. Run `rg -n "background(-color)?:\s*var\(--sh-bg\)" src/studyhub-bootstrap.css`. For each hit that is a full-screen layout wrapper (shell body, main area, screen root — not cards, inputs or floating panels), change it to `transparent`. Keep `.sh-app-root, .sh-app-shell` itself on `var(--sh-bg)`. List every changed selector in the report.

- [ ] **Step 7: Verify** — `npm run test`, `npm run build`, then screenshot the running app:

```powershell
$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 60 -- python .superpowers/ui-review/tour.py
```

Check `06-today-empty.png`, `20-courses.png`, `27-om300-content-first-chapter.png`: true-black background, faint aqua/magenta lines visible behind content, auras top-left/bottom-right, Geist body text, no rounded corners, OM 300 content renders. `console.txt` has no errors mentioning `AmbientBackground`, canvas or fonts.

- [ ] **Step 8: Commit**

```
Phase 2.22 — Ambient background

- Drifting aqua/magenta sine lines on a fixed canvas behind the shell
- One static frame when motion is reduced
- Corner auras via CSS, page wrappers made transparent
```
