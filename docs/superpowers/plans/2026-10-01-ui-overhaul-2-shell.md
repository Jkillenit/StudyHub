# UI Overhaul 2 — Shell Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development to execute this plan task by task.

**Goal:** Replace the top-nav shell with the approved one: a 56px icon rail, a centered "Pure" home, a "Plan" layout for every other hub screen, a docked cut-corner message box that replaces the floating Ask Nova bubble, and Nova resting large in a bottom-right lane.

**Architecture:** Routing stays two `useState`s in `StudyHubApp.jsx` (`courseId`, `hubView`); `hubView` gains `"plan"` (the current Today dashboard, minus its companion stage). The message box (`NovaBar`) is a plain React component in the layout; it talks to `CompanionLayer` through two window events, so command execution and FAQ answers keep their existing code paths. Nova's lane is a fixed element carrying `data-nova-home` / `data-nova-floor`, so the existing housing code (`useNovaPlacement`, `homeGeometry`) fits her into it unchanged.

**Tech Stack:** React 18, Vite, vitest, better-sqlite3 (read-only query added), Playwright (verification).

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` §2 (Shell). Mockups: `.superpowers/ui-review/bs-v5-12-rest.png`, `bs-v5-12-hover.png`, `bs-v5-12-course.png`, `bs-v5-6-pure.png`, `bs-v5-6-plan.png`, `bs-v14-states.png`. Bar finish reference CSS: `.superpowers/brainstorm/476-1790888796/content/states-v14.html` lines 94–100 (option C, "Quiet edge, colored cut corners").

**Decisions made with the user for this step:**
1. The old Today dashboard (Briefing, Tonight, Overdue, Standing, Week, Nova's desk and layout commands) lives on as the **Full plan** view (`hubView "plan"`), reached from the home cards' "Full plan" link. Nova's `layout` / `move` / `grades` commands target it.
2. Inside a course, the course keeps its own module sidebar beside the collapsed rail. Merging them is step 3.
3. The rail's **COURSES** header opens the Courses page; a `+` beside it opens it too (import lives there).
4. "Synced 2m ago" uses a new read-only query (latest `synced_at`).

## Global Constraints

- Tokens only (`--sh-*`, `color-mix()` over tokens). No hardcoded colors, radii, fonts. Radius is 0.
- `--sh-accent` (aqua) is the only interactive accent; `--sh-accent-2` (magenta) only for cut corners, slash commands, exam tags, gradient ends.
- Display type `--sh-font-display` (Michroma) is always `font-weight: 400`, uppercase, `letter-spacing: .06em`.
- Labels/codes/times in `--sh-font-mono`, 11px minimum.
- Motion via `html[data-motion="reduced"]` selectors or `useReducedMotion()` from `src/shell/motion.js`; never `@media (prefers-reduced-motion)`. Durations: hover 150ms, panels 160ms, rail slide 160ms after 150ms hover delay.
- Vertical nav active state: 2px left border in `--sh-accent`; tabs: `border-bottom: 2px solid var(--sh-accent)`. Never a full border.
- No `console.*`. OM 300 content (`src/study/sections`, `src/glossary/courseData.js`) untouched. No data writes, no schema change.
- Keep every `data-tour-id` the tours and FAQ use: `today-dashboard`, `nav-calendar`, `hub-courses`, `hub-add-course`, `hub-blackboard`, `titlebar-palette`, `titlebar-scout` (they may move to new elements, but must exist).
- localStorage only for UI prefs (`sh-rail-pinned`).
- Every task ends with `npm run test` and `npm run build` passing.
- Commit format: `Phase 2.23 — Short description` + bullets, message written UTF-8 without BOM, `git commit -F`. Stage only files you changed.

---

### Task 1: Data helpers (sync time, home line, shared action runner, token test)

**Files:**
- Modify: `electron/dbMirrorHandlers.cjs` (`todayData`), `src/db/courseStore.js` (fallback), `src/features/today/todayView.js` (`buildTodayView`), `src/features/today/briefing.js`, `src/features/today/TodayScreen.jsx`, `src/studyhub-tokens.test.js`
- Create: `src/features/today/syncedAgo.js`, `src/features/today/syncedAgo.test.js`, `src/features/today/runAction.js`
- Test: `src/features/today/todayView.test.js` (add cases)

**Interfaces:**
- `todayData()` result gains `syncedAt: string | null` (SQLite `datetime('now')` format `"YYYY-MM-DD HH:MM:SS"`, UTC).
- `buildTodayView()` result gains `syncedAt` (passed through).
- `syncedAgo(at, now = new Date()) -> string | null`
- `homeLine(view, { now, dueText }) -> (string | { num, tone })[]`
- `runTodayAction(action, onOpenCourse) -> void`

- [ ] **Step 1: Failing tests.** `src/features/today/syncedAgo.test.js`:

```js
import { describe, expect, it } from "vitest";
import { syncedAgo } from "./syncedAgo.js";

const now = new Date("2026-10-01T18:00:00Z");

describe("syncedAgo", () => {
  it("is null without a sync", () => {
    expect(syncedAgo(null, now)).toBeNull();
    expect(syncedAgo("garbage", now)).toBeNull();
  });
  it("reads SQLite UTC timestamps", () => {
    expect(syncedAgo("2026-10-01 17:58:00", now)).toBe("Synced 2m ago");
    expect(syncedAgo("2026-10-01 17:59:50", now)).toBe("Synced just now");
    expect(syncedAgo("2026-10-01 15:00:00", now)).toBe("Synced 3h ago");
    expect(syncedAgo("2026-09-28 18:00:00", now)).toBe("Synced 3d ago");
  });
  it("accepts ISO strings", () => {
    expect(syncedAgo("2026-10-01T17:50:00Z", now)).toBe("Synced 10m ago");
  });
});
```

Add to `src/features/today/todayView.test.js` (reuse that file's existing view fixtures/helpers if present; otherwise build the minimal `view` inline):

```js
import { homeLine } from "./briefing.js";
// ...
describe("homeLine", () => {
  const dueText = () => "Today";
  it("asks to connect when there are no courses", () => {
    const segs = homeLine({ hasCourses: false, tonight: [] }, { now: new Date(2026, 9, 1, 20), dueText });
    expect(segs[0]).toBe("Evening.");
    expect(segs.join("")).toMatch(/Connect Blackboard/);
  });
  it("marks clock times as accent numbers", () => {
    const due = new Date(2026, 9, 1, 22, 0).toISOString();
    const tonight = [
      { title: "A", courseLabel: "MIS 430", daysUntil: 0, dueDate: due, type: "assignment" },
      { title: "B", courseLabel: "MIS 430", daysUntil: 0, dueDate: due, type: "assignment" },
    ];
    const segs = homeLine({ hasCourses: true, tonight }, { now: new Date(2026, 9, 1, 20), dueText });
    const nums = segs.filter((s) => typeof s === "object");
    expect(nums).toHaveLength(1);
    expect(nums[0].tone).toBe("accent");
    expect(nums[0].num).toMatch(/10:00/);
    expect(segs.map((s) => (typeof s === "string" ? s : s.num)).join("")).toMatch(/Two MIS 430 items are due today/);
  });
});
```

Add a `buildTodayView` case asserting `syncedAt` passes through (`buildTodayView({ ...minimalData, syncedAt: "2026-10-01 17:58:00" }).syncedAt === "2026-10-01 17:58:00"`, and `null` when absent).

Harden `src/studyhub-tokens.test.js` (deferred from Plan 1):

```js
  it("leaves no old palette behind", () => {
    expect(css).not.toMatch(/79,\s*216,\s*255|#4FD8FF/i);
  });

  it("defines the secondary and chamfer tokens", () => {
    expect(token("sh-side")).toBe("#030407");
    expect(token("sh-accent-2-soft")).toMatch(/^color-mix/);
    expect(token("sh-accent-2-line")).toMatch(/^color-mix/);
    expect(token("sh-cut")).toBe("12px");
  });
```

and extend the radius filter regex to `/border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;]+);/g`.

Run `npx vitest run src/features/today src/studyhub-tokens.test.js` → the new cases FAIL (missing modules/exports/field); token cases may already pass (that's fine, they're guards).

- [ ] **Step 2: `src/features/today/syncedAgo.js`**

```js
/** "Synced 2m ago" from a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") or ISO string. */
export function syncedAgo(at, now = new Date()) {
  if (!at) return null;
  const t = Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  if (Number.isNaN(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "Synced just now";
  if (m < 60) return `Synced ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Synced ${h}h ago`;
  return `Synced ${Math.round(h / 24)}d ago`;
}
```

- [ ] **Step 3: `homeLine` in `src/features/today/briefing.js`** (reuses the existing private `greeting` and `taskSentence`):

```js
const CLOCK = /\b\d{1,2}:\d{2}(?:\s?[AP]M)?/gi;

/** The home screen's one line: greeting + the task sentence, clock times as accent numbers. */
export function homeLine(view, { now = new Date(), dueText }) {
  const text = view?.hasCourses
    ? taskSentence(view.tonight || [], dueText)
    : "Connect Blackboard and I'll tell you what matters every day.";
  const segments = [greeting(now), " "];
  let i = 0;
  for (const m of text.matchAll(CLOCK)) {
    segments.push(text.slice(i, m.index), { num: m[0], tone: "accent" });
    i = m.index + m[0].length;
  }
  segments.push(text.slice(i));
  return segments.filter((s) => s !== "");
}
```

- [ ] **Step 4: `syncedAt`.** In `electron/dbMirrorHandlers.cjs` `todayData`, next to `synced`:

```js
  const syncedAt =
    db.prepare("SELECT MAX(at) AS at FROM (SELECT MAX(synced_at) AS at FROM bb_items UNION ALL SELECT MAX(synced_at) FROM bb_grade_items)").get()?.at || null;
  return { now: new Date().toISOString(), synced: !!synced, syncedAt, courses: result };
```

In `courseStore.loadTodayData` fallback object add `syncedAt: null`. In `buildTodayView` return add `syncedAt: data?.syncedAt ?? null` (match how that function reads `synced`).

- [ ] **Step 5: `src/features/today/runAction.js`** — move the body of `TodayScreen`'s `run` callback here verbatim:

```js
import { openInBlackboard } from "../mirror/openInBlackboard.js";
import { openCourseView } from "./courseView.js";

/** Runs a Today item's action (see priority.js `action`). */
export function runTodayAction(action, onOpenCourse) {
  if (!action) return;
  if (action.type === "blackboard") openInBlackboard(action.url);
  else if (action.type === "review") openCourseView(onOpenCourse, action.courseUuid, { item: "qz-deck" });
  else if (action.type === "grades") openCourseView(onOpenCourse, action.courseUuid, { tab: "grades" });
  else onOpenCourse(action.courseUuid);
}
```

In `TodayScreen.jsx`, `run` becomes `useCallback((action) => runTodayAction(action, onOpenCourse), [onOpenCourse])`; drop imports it no longer needs (keep `openInBlackboard` / `openCourseView` only if still used).

- [ ] **Step 6:** `npm run test`, `npm run build` → pass.

- [ ] **Step 7: Commit** `Phase 2.23 — Shell data helpers` (bullets: sync time query, homeLine, shared Today action runner, token test guards).

---

### Task 2: Icon rail and top strip

**Files:**
- Create: `src/shell/AppRail.jsx`
- Modify: `src/components/TitleBar.jsx`, `src/app/StudyHubApp.jsx`, `src/studyhub-bootstrap.css`, `src/hub/HubScreen.jsx` (accept `"plan"` view — render the existing `TodayScreen` for both `"today"` and `"plan"` for now; Task 4 splits them)

**Interfaces:**
- `AppRail({ onHub, hubView, courseId, courses, onNavigate, onOpenCourse, onSearch, onOpenSettings })`
  - `courses`: `[{ id, code }]` — built in `StudyHubApp`: `{ id: "builtin", code: "OM 300" }` first, then each user course `{ id, code: shortCourse(courseCode) || name }`.
  - `onNavigate(view)` is `goHub`.
- `TitleBar({ onHub })` — becomes the top strip.
- `hubView` values: `"today" | "plan" | "calendar" | "courses"`.

**Layout.** The app root becomes a row: rail (full height) + a main column holding the top strip and the screen.

```jsx
<div data-bs-theme="dark" className="sh-app-root sh-app-shell">
  <AmbientBackground />
  <ApiStatusSync /> <BlackboardImportHandler … />
  <AppRail … />
  <div className="sh-frame-main">
    <TitleBar onHub={onHub} />
    <ErrorBoundary …>{/* unchanged hub / course content */}</ErrorBoundary>
  </div>
  {/* palette, AI panel, settings, CompanionLayer, splash unchanged */}
</div>
```

`.sh-app-root, .sh-app-shell` switch from `flex-direction: column` to `row`; `.sh-frame-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }`.

**Rail behavior:**
- In-flow footprint is always 56px (`.sh-rail { position: relative; flex: 0 0 56px; }`), except when pinned: 200px in-flow (`.sh-rail--pinned { flex-basis: 200px; }`).
- The visible panel `.sh-rail-panel` is `position: absolute; inset: 0 auto 0 0; width: 56px; z-index` above content (below `.sc-layer` 9000 and the palette), background `var(--sh-side)`, right border `var(--sh-border)`.
- Hover: `.sh-rail:hover .sh-rail-panel { width: 200px; box-shadow: var(--sh-shadow-panel); transition: width 160ms ease 150ms; }` (the 150ms delay applies on open only; closing has no delay: base `transition: width 160ms ease`). Content never shifts.
- `html[data-motion="reduced"] .sh-rail-panel { transition: none; }`.
- Collapsed (56px) hides labels, the COURSES header text, the pin button and the `+`; codes show only their prefix (`MIS`), full `MIS 430` when open. Use `overflow: hidden; white-space: nowrap` and hide text with `opacity: 0` when collapsed so nothing wraps mid-slide.
- Pinned (`sh-rail-pinned` in localStorage via `loadJson`/`saveJson` from `src/lib/storage.js`, default `false`): panel 200px, no shadow. Toggle with the Pin button and **Ctrl+B** (window keydown; ignore when `isTypingTarget(e.target)` or `paletteOpen()` from `src/lib/hotkeys.js`; `preventDefault`).
- Inside a course (`!onHub`) the rail stays collapsed regardless of pin (decision 2) — hover still opens it as an overlay.

**Rail items (top to bottom), each a `<button>` with a 16px stroke icon + label:**
1. Logo row: hex glyph + `STUDY HUB` (Michroma 400, 12px, `.06em`) → `onNavigate("today")`; Pin button at the right (`aria-pressed`).
2. Search → `onSearch` (opens palette). `data-tour-id="titlebar-palette"`. Right-aligned mono hint `Ctrl K` (only visible when open).
3. New session → `window.dispatchEvent(new CustomEvent("studyhub-nova-run", { detail: { id: "quiz" } }))`.
4. Today → `onNavigate("today")`; active when `onHub && (hubView === "today" || hubView === "plan")`.
5. Calendar → `onNavigate("calendar")`; `data-tour-id="nav-calendar"`.
6. Decks, Grades → `disabled`, `title="Coming soon"`, dimmed to `--sh-text-3`.
7. Divider, then the COURSES header row: `COURSES` label button → `onNavigate("courses")` (`data-tour-id="nav-courses"`), and a `+` button → `onNavigate("courses")` (title "Add a course"). Active when `onHub && hubView === "courses"`.
8. One row per course: mono code, split as prefix + number (`MIS` `430`), → `onOpenCourse(id)`; active when `courseId === id`.
9. Spacer, then bottom: Make it yours → `onOpenSettings` (until step 6), Settings → `onOpenSettings` with `data-tour-id="titlebar-scout"`.

Active state: `box-shadow: inset 2px 0 0 var(--sh-accent)` (or a 2px left border that doesn't shift the content) + `--sh-text`, background `color-mix(in oklab, var(--sh-accent) 6%, transparent)`. Hover: `--sh-text`, 150ms.

**Top strip (`TitleBar`):** `header.sh-titlebar` keeps its drag region, double-click maximize and the window controls. Remove the nav, wordmark, `SyncStatus`, settings icon and `Ctrl K` hint (they moved to the rail / home). Left: course breadcrumb (unchanged logic, shown only in a course). Center: today's date in mono, uppercase, `--sh-text-3`, 11px, letter-spacing .14em, e.g. `THU OCT 1` (`toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })`, commas removed, uppercased). Right: window controls. Height 40px: set `--sh-topbar-h: 40px` and make `.sh-titlebar` use it. Remove `HUB_VIEWS` and any CSS made unused by these removals (`.sh-titlebar-nav`, `.sh-nav-link*`, `.sh-nav-soon`, `.sh-top-sync*`, `.sh-titlebar-wordmark`, `.sh-titlebar-icon`, `.sh-kbd-hint` if nothing else uses them — grep first). If `HUB_VIEWS` is imported elsewhere, inline what that caller needs.

- [ ] **Step 1:** Implement `AppRail.jsx`, the CSS, the `StudyHubApp` layout change, the `TitleBar` slimming, and `HubScreen` accepting `"plan"`.
- [ ] **Step 2:** Grep for other users of `--sh-topbar-h` and `TITLEBAR_H` (`src/companion/safeZones.js`); set `TITLEBAR_H = 40` there and make `viewportBounds`' left edge clear the rail (`document.querySelector(".sh-rail")?.getBoundingClientRect().right ?? 0` + `EDGE`).
- [ ] **Step 3:** `npm run test`, `npm run build`. Screenshot via the tour (`$env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 60 -- python .superpowers/ui-review/tour.py`); if tour steps that clicked the old nav fail, note them (Task 6 updates the tour). Compare `06-today-empty.png` against `bs-v5-12-rest.png` for the rail.
- [ ] **Step 4: Commit** `Phase 2.23 — Icon rail and top strip`.

---

### Task 3: Message box (NovaBar) replaces the Ask Nova bubble

**Files:**
- Create: `src/nova/slash.js`, `src/nova/slash.test.js`, `src/shell/NovaBar.jsx`
- Modify: `src/companion/hooks/useNovaHelp.js`, `src/companion/hooks/useNovaCommands.js`, `src/companion/CompanionLayer.jsx`, `src/studyhub-bootstrap.css`, `scripts/nova-smoke.py`

**Interfaces:**
- Events (window `CustomEvent`): `studyhub-nova-run` (`detail`: a parsed command object, e.g. `{ id: "quiz" }`) and `studyhub-nova-answer` (`detail`: a FAQ entry from `searchFaq`).
- `NovaBar({ courses, placeholder })` — `courses` is the same list `CompanionLayer` receives (`userCoursesList` in `StudyHubApp`).
- `useNovaHelp` returns `openAnswer(entry)` in addition to its current API.
- The bar's input has class `sh-novabar-input`.

- [ ] **Step 1: Failing test** `src/nova/slash.test.js`:

```js
import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands.js";
import { SLASH, slashMatches } from "./slash.js";

describe("slash commands", () => {
  it("lists all commands for a bare slash and filters by prefix", () => {
    expect(slashMatches("/")).toHaveLength(SLASH.length);
    expect(slashMatches("/fo").map((s) => s.cmd)).toEqual(["/focus"]);
    expect(slashMatches("quiz")).toEqual([]);
    expect(slashMatches("/quiz mis")).toEqual([]);
  });
  it("every command fills text the parser understands", () => {
    for (const s of SLASH) {
      if (s.cmd === "/open") continue;
      expect(parseCommand(s.text.trim(), { courses: [] }), s.cmd).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: `src/nova/slash.js`.** Use texts that `parseCommand` already accepts — check `CHIPS` and `commands.test.js` and copy their phrasings; the values below are the intent, adjust the strings (not the shape) until the test passes:

```js
/** "/" menu in the message box. Picking one fills the box with plain text the parser understands. */
export const SLASH = [
  { cmd: "/quiz", hint: "Quiz me on a course", text: "quiz me " },
  { cmd: "/focus", hint: "Focus timer", text: "focus 25" },
  { cmd: "/open", hint: "Open a course or tab", text: "open " },
  { cmd: "/due", hint: "What's due this week", text: "what's due this week" },
  { cmd: "/next", hint: "What should I do next", text: "what's next" },
  { cmd: "/grades", hint: "Where my grades stand", text: "grades" },
];

export function slashMatches(q) {
  if (!q.startsWith("/") || /\s/.test(q)) return [];
  const w = q.slice(1).toLowerCase();
  return SLASH.filter((s) => s.cmd.slice(1).startsWith(w));
}
```

- [ ] **Step 3: `src/shell/NovaBar.jsx`.**

```jsx
import { useMemo, useRef, useState } from "react";
import { describeCommand, parseCommand } from "../nova/commands.js";
import { searchFaq } from "../companion/faq.js";
import { slashMatches } from "../nova/slash.js";

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

const Hex = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <path d="M12 2l8 5v10l-8 5-8-5V7z" />
  </svg>
);

/** The message box: commands run through Nova (studyhub-nova-run), questions open her answer bubble (studyhub-nova-answer). */
export function NovaBar({ courses, placeholder = "Message Nova, or type / for commands" }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const slash = slashMatches(q);
  const text = q.trim().replace(/^\//, "");
  const cmd = useMemo(() => (slash.length || !text ? null : parseCommand(text, { courses })), [slash.length, text, courses]);
  const preview = describeCommand(cmd);
  const faqs = useMemo(
    () => (text && !slash.length && cmd?.id !== "talk" ? searchFaq(text, preview ? 3 : 4) : []),
    [text, slash.length, cmd, preview]
  );

  const done = () => {
    setQ("");
    inputRef.current?.blur();
  };
  const run = (c) => {
    emit("studyhub-nova-run", c);
    done();
  };
  const answer = (f) => {
    emit("studyhub-nova-answer", f);
    done();
  };
  const fill = (t) => {
    setQ(t);
    inputRef.current?.focus();
  };
  const submit = () => {
    if (slash[0]) fill(slash[0].text);
    else if (cmd) run(cmd);
    else if (faqs[0]) answer(faqs[0]);
  };

  const showList = focused && (slash.length > 0 || !!preview || faqs.length > 0);
  return (
    <div className={`sh-novabar${focused ? " sh-novabar--open" : ""}`}>
      {showList ? (
        <ul className="sh-novabar-list" role="listbox">
          {slash.map((s) => (
            <li key={s.cmd}>
              <button type="button" className="sh-novabar-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => fill(s.text)}>
                <span className="sh-novabar-slash">{s.cmd}</span> {s.hint}
              </button>
            </li>
          ))}
          {preview ? (
            <li>
              <button type="button" className="sh-novabar-opt sh-novabar-opt--run" onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)}>
                ▸ {preview}
              </button>
            </li>
          ) : null}
          {faqs.map((f) => (
            <li key={f.id}>
              <button type="button" className="sh-novabar-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => answer(f)}>
                {f.q}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sh-cut">
        <div className="sh-cut-fill sh-hex">
          <div className="sh-novabar-row">
            <span className="sh-novabar-glyph">
              <Hex />
              <span className="sh-novabar-portrait" data-nova-portrait />
            </span>
            <input
              ref={inputRef}
              className="sh-novabar-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") done();
              }}
              placeholder={placeholder}
              aria-label="Message Nova"
            />
            <kbd className="sh-novabar-key">Ctrl /</kbd>
          </div>
          {focused ? (
            <div className="sh-novabar-tools">
              <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "quiz" })}>
                Quiz me
              </button>
              <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "focus", minutes: 25 })}>
                Focus 25
              </button>
              <span className="sh-novabar-hint">Enter to send</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

If `parseCommand("focus 25")` yields a different shape than `{ id: "focus", minutes: 25 }`, use what it yields (`parseCommand("focus 25", { courses })`) for the tool button.

- [ ] **Step 4: Wire Nova.**
  - `useNovaHelp`: at the top of `startHelp`, `const bar = document.querySelector(".sh-novabar-input"); if (bar) { bar.focus(); return; }` — every caller (Ctrl+J, radial menu ASK NOVA, Ctrl+Shift+Space summon) now lands in the box when one is on screen; without a box (inside a course) the old bubble still opens. Make sure a caller that had the radial menu open still closes it (`send("CLOSE")` when `modeRef.current === "menu"`) before the redirect returns. Add `openAnswer(entry)`: same as `startHelp` minus the bar redirect, but `setHelp({ query: "", answer: entry, pointed: false })`. Return it.
  - `useNovaCommands`: the Ctrl+J handler also accepts **Ctrl+/** (`e.key === "/"`). Its `onToday` helper navigates to `"plan"` instead of `"today"` (decision 1: the panels live on Full plan).
  - `CompanionLayer`: one effect adding window listeners — `studyhub-nova-run` → `api.current.runCommand?.(e.detail)`, `studyhub-nova-answer` → `openAnswer(e.detail)` — removed on cleanup.
- [ ] **Step 5: CSS.** Port option C from `states-v14.html` lines 94–100/136 with tokens only:

```css
.sh-cut {
  --sh-cut-edge: linear-gradient(135deg, var(--sh-accent) 0 18px, var(--sh-border-strong) 18px calc(100% - 18px), var(--sh-accent-2) calc(100% - 18px));
  padding: 1px;
  background: var(--sh-cut-edge);
  clip-path: polygon(var(--sh-cut) 0, 100% 0, 100% calc(100% - var(--sh-cut)), calc(100% - var(--sh-cut)) 100%, 0 100%, 0 var(--sh-cut));
}

.sh-cut-fill {
  position: relative;
  background: var(--sh-panel-solid);
  clip-path: polygon(calc(var(--sh-cut) - 1px) 0, 100% 0, 100% calc(100% - var(--sh-cut) + 1px), calc(100% - var(--sh-cut) + 1px) 100%, 0 100%, 0 calc(var(--sh-cut) - 1px));
}

.sh-hex::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: var(--sh-accent);
  opacity: 0.05;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='48' viewBox='0 0 28 48'%3E%3Cpath d='M14 0l14 8v16l-14 8L0 24V8zM14 32v16' fill='none' stroke='black'/%3E%3C/svg%3E") repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='48' viewBox='0 0 28 48'%3E%3Cpath d='M14 0l14 8v16l-14 8L0 24V8zM14 32v16' fill='none' stroke='black'/%3E%3C/svg%3E") repeat;
}
```

Then `.sh-novabar` (relative, width 100%), `.sh-novabar-row` (flex, 52px tall, gap 12px, padding 0 16px), glyph aqua with a 2.4s opacity pulse (none under reduced motion), input transparent borderless `--sh-font-body` 14px `--sh-text`, placeholder `--sh-text-3`, `.sh-novabar-key` mono 11px boxed in `--sh-border`, `.sh-novabar-tools` (row under the input, top border `--sh-border`, small mono buttons), `.sh-novabar-list` (absolute, `bottom: calc(100% + 6px)`, full width, `--sh-panel-solid`, 1px `--sh-border-strong`, `--sh-shadow-panel`), `.sh-novabar-slash` in `--sh-accent-2` mono, `.sh-novabar-opt--run` in `--sh-accent`. `.sh-novabar-portrait` is `display: none` here (Task 5 shows it). Remove `.sc-help-*` / `.sc-ask-*` rules only if `HelpBubble` no longer renders them — it still does inside courses, so keep them.
- [ ] **Step 6: Smoke script.** In `scripts/nova-smoke.py` the ask step presses Ctrl+J and types into `.sc-help-input`; change it to use `.sh-novabar-input` when present (fall back to `.sc-help-input`), keep the "focus 5" → `.sc-focus-pill` assertion.
- [ ] **Step 7:** NovaBar isn't mounted anywhere yet (Task 4 places it). To verify now, temporarily render it on the hub, type `/`, `focus 5`, a FAQ question; confirm the slash list, focus pill and answer bubble; then remove the temporary mount. `npm run test`, `npm run build`.
- [ ] **Step 8: Commit** `Phase 2.23 — Nova message box`.

---

### Task 4: Pure home and Plan layout

**Files:**
- Create: `src/features/today/HomeScreen.jsx`
- Modify: `src/hub/HubScreen.jsx`, `src/app/StudyHubApp.jsx` (pass `courses={userCoursesList}` to `HubScreen` for the bar), `src/features/today/TodayScreen.jsx`, `src/studyhub-bootstrap.css`

**Interfaces:**
- `HomeScreen({ refreshKey, courses, onOpenCourse, onNavigate })`
- `HubScreen` gains `courses` prop.

**Home (`hubView "today"`), centered vertically and horizontally, column max-width 720px:**
1. Wordmark: hex glyph + `NOVA` in `--sh-font-display` 28px, weight 400, `.06em`.
2. One line from `homeLine(view, { now: new Date(), dueText })`: strings plain `--sh-text-2` 15px; `{ num }` segments in `--sh-font-mono` `--sh-accent`.
3. Sync line, 12.5px `--sh-text-3`: a 6px aqua square + `syncedAgo(view.syncedAt)`; when null: "Blackboard not connected".
4. `<NovaBar courses={courses} />`.
5. Up to three cards from `view.tonight` in a 3-column grid (1 column under 900px window width): title 14px/600 (two-line clamp), meta line mono 11px `--sh-text-3`: `courseLabel · dueText(dueDate, daysUntil, type === exam prep)` (use the same `dueText` signature `TodayScreen`/`todayView.js` uses). Card: `--sh-panel` background, 1px `--sh-border`, top edge 2px: first card `--sh-accent`, a card with `daysUntil === 0` (that isn't first) `--sh-warn`, others `--sh-border-strong`. Hover border `--sh-border-strong`. Click → `runTodayAction(item.action, onOpenCourse)`.
6. Under the cards, right-aligned: `Full plan →` link button → `onNavigate("plan")`.
7. Empty states: no courses → instead of cards, one outline button "Connect Blackboard" → `onNavigate("courses")`; courses but nothing tonight → a single muted line "Nothing due in the next two weeks." (from the home line already; render no cards).

Root element: `<section className="sh-home" aria-label="Today" data-tour-id="today-dashboard">`. Use `useTodayModel(refreshKey)` and call `publishToday(briefingContext(...))` the same way `TodayScreen` does (move that effect here too if `TodayScreen` is not mounted on home — both screens should publish; extract nothing new, just call it in both).

**Plan layout (`plan`, `calendar`, `courses`):**

```jsx
<div className={`sh-plan${view === "calendar" ? " sh-plan--wide" : ""}`}>
  <div className="sh-plan-col">{screen}</div>
  <div className="sh-plan-dock">
    <NovaBar courses={courses} placeholder={PROMPTS[view]} />
  </div>
</div>
```

`PROMPTS = { plan: "Ask Nova to plan your week…", calendar: "Ask Nova what's due…", courses: "Ask Nova to open a course…" }`. CSS: `.sh-plan { height: 100%; display: flex; flex-direction: column; }`, `.sh-plan-col { flex: 1; min-height: 0; overflow: auto; width: 100%; max-width: 720px; margin: 0 auto; padding: 24px 0; }`, `.sh-plan-dock { width: 100%; max-width: 720px; margin: 0 auto; padding: 12px 0 20px; }`, `.sh-plan--wide .sh-plan-col, .sh-plan--wide .sh-plan-dock { max-width: 1040px; }`. Inside `.sh-plan-col`, the existing screens must stack in one column: add overrides (e.g. `.sh-plan .sh-today2 { flex-direction: column; padding: 0; }`, `.sh-plan .sh-today2-left { width: auto; }`, `.sh-plan .sh-courses-page` single column) rather than editing their base rules. `.sh-page` padding inside the column → 0.

**Full plan (`plan`):** the existing `TodayScreen`, with `CompanionStage` removed from its left column (Nova's home moves to the lane in Task 5) and its `data-tour-id="today-dashboard"` moved to the home root. Leave `CompanionStage.jsx` in place for now (Task 5 deletes it).

- [ ] **Step 1:** Implement `HomeScreen.jsx`, the `HubScreen` branching (`today` → `HomeScreen`; `plan`/`calendar`/`courses` → plan layout), the `TodayScreen` change and CSS.
- [ ] **Step 2:** `npm run test`, `npm run build`. Run the tour; compare home against `bs-v5-6-pure.png` / `bs-v5-12-rest.png` and Full plan against `bs-v5-6-plan.png`. Check Nova commands `tidy up` / `move week to dock` still rearrange panels (they now open Full plan first).
- [ ] **Step 3: Commit** `Phase 2.23 — Pure home and Plan layout`.

---

### Task 5: Nova's lane, tucked state, safe zones

**Files:**
- Create: `src/shell/NovaLane.jsx`
- Modify: `src/app/StudyHubApp.jsx`, `src/companion/CompanionLayer.jsx`, `src/companion/safeZones.js`, `src/features/today/TodayScreen.jsx` (nothing if Task 4 already removed the stage), `src/studyhub-bootstrap.css`, `scripts/nova-smoke.py`
- Delete: `src/features/today/components/CompanionStage.jsx` and its `.sh-stage*` CSS (orphaned)

**Interfaces:**
- `NovaLane()` renders `<div className="sh-nova-lane" data-nova-home aria-hidden="true"><div className="sh-nova-lane-floor" data-nova-floor /></div>`.
- `CompanionLayer` prop `place: "lane" | "tuck" | "free"` replaces its use of `onHub && hubView === "today"` for `stageActive`.
  - `StudyHubApp`: `place = onHub ? (hubView === "calendar" ? "tuck" : "lane") : "free"`; render `<NovaLane />` when `place === "lane"`.
- `html` attribute `data-nova-tucked` is present while she is tucked (the bar's portrait shows via CSS).

**Lane.** `position: fixed; right: 24px; bottom: 24px; width: 260px; height: 320px; pointer-events: none;` (the existing `homeGeometry` math then sizes her ≈ 280px). The floor is a 2px aqua line 60% wide with a soft `--sh-accent-soft` radial glow above it, centered at the bottom; when `[data-housed]` is set (by `markStage`) the glow brightens. Hide the lane under 1260px window width: `@media (max-width: 1259px) { .sh-nova-lane { display: none; } }` — `homeGeometry` then returns null and she can't house. Keep the number in one JS constant too: `export const LANE_MIN_W = 1260; // matches .sh-nova-lane media query` in `src/companion/layer/constants.js`.

**CompanionLayer.**
- `stageActive = place === "lane"` (keep the name; it feeds `useNovaPlacement`).
- `tucked = enabled && (place === "tuck" || (place === "lane" && window.innerWidth < LANE_MIN_W)) && HOME_MODES.has(mode) && !dragging` (re-evaluate on resize — the layer already listens to resize; add a `winW` state if needed). When tucked: add `sc-scout--tucked` (`visibility: hidden; pointer-events: none;`), set `document.documentElement.dataset.novaTucked = ""` (remove when not tucked / on unmount), and make `canAct` return false so she doesn't wander while hidden (`tuckedRef`). Any engaged mode (quiz, help answer, tour, brief) makes `HOME_MODES.has(mode)` false, so she reappears for it.
- `refreshAnchor`: when `housedRef.current`, set `{ h: "center", v: "above" }` so the bubble stays over her lane instead of spilling left over the content. CSS `.sc-bubble--center { left: 50%; right: auto; transform: translateX(-50%); max-width: 240px; }` (check the existing `--left/--right` rules for the properties to mirror, and the tail position). The existing viewport nudge in `SpeechBubble` still applies.
- `.nv-drop` (Plan 1 left it a hard rectangle): remove its border and box-shadow so only the gradient glow remains.

**Portrait.** `html[data-nova-tucked] .sh-novabar-portrait { display: block; }` and hide the hex glyph's svg then. Render inside the portrait span a small live `NovaSprite` (`src/companion/NovaSprite.jsx`, `size={28}`, neutral mood — check its required props) from `NovaBar` — mount it only when tucked (read `document.documentElement.dataset.novaTucked` via a `MutationObserver` on `<html>` attributes, or accept a `tucked` prop if simpler to thread; pick the smaller diff and say which).

**Safe zones (`src/companion/safeZones.js`).** Add `.sh-novabar` and `.sh-rail` to `AVOID_SELECTOR`; add `.sh-plan-col` and `.sh-home` to `CONTENT_SELECTOR`. `NOT_CONTENT` gains `.sh-nova-lane`. (`TITLEBAR_H` / rail edge were done in Task 2.)

**Smoke.** `scripts/nova-smoke.py` drag step drags her "toward the middle" so the drop isn't over the old Today home; with the home now bottom-right, make the drag go up-left by ≥ 300px and keep the ">50px moved" assertion.

- [ ] **Step 1:** Implement lane, prop, tucked state, bubble anchor, portrait, safe zones, `.nv-drop`, delete `CompanionStage`.
- [ ] **Step 2:** Add a focused test for the pure part if any logic is extracted (e.g. a `placeFor({ onHub, hubView })` helper); otherwise none — this is DOM/geometry wiring verified by smoke and screenshots.
- [ ] **Step 3:** `npm run test`, `npm run build`, then `python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 90 -- python scripts/nova-smoke.py` (all steps pass) and the tour. Check at 1440×900: Nova ≈ 280px in the bottom-right, bubble above her, nothing covering the content column or bar. At 1100×720: lane hidden, she's tucked, portrait in the bar. Calendar: tucked.
- [ ] **Step 4: Commit** `Phase 2.23 — Nova lane and tucked state`.

---

### Task 6: Verification pass and doc fixes

**Files:**
- Modify: `.superpowers/ui-review/tour.py` (not committed — scratch), `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md`, `.superpowers/ui-review/decisions.md` (scratch)

- [ ] **Step 1:** Update `tour.py` for the new shell: navigate with rail buttons (`[data-tour-id=nav-calendar]`, `[data-tour-id=nav-courses]`, `.sh-rail` Today button, course rows), open Full plan via the home link, open the bar with Ctrl+/ and type `/`, add shots: `rail-hover` (hover the rail 400ms), `rail-pinned` (Ctrl+B), `home`, `plan`, `bar-slash`, `bar-answer`, `calendar-tucked`, `narrow-1100` (viewport 1100×720, home), `course` (OM 300). Run it.
- [ ] **Step 2:** Compare against the mockups (`bs-v5-12-rest.png`, `bs-v5-12-hover.png`, `bs-v5-6-pure.png`, `bs-v5-6-plan.png`, `bs-v14-states.png`). List concrete mismatches (spacing, sizes, colors, overlap) in the report with screenshot names. Fix only CSS-level mismatches inside files this plan touched; report anything bigger.
- [ ] **Step 3: Spec fixes.** In the spec's §1.1 table, split the first row so it reads `--sh-panel` = `rgba(14,16,24,.72)` (cards, translucent) and `--sh-side` = `#030407` (rail), matching the shipped tokens. In §2.1 add: "Inside a course the course keeps its own module list beside the collapsed rail until step 3." In §2.2 add: "The old Today dashboard is the Full plan view, linked under the cards." Append the four decisions to `decisions.md`.
- [ ] **Step 4:** `npm run test`, `npm run build`. Commit (spec only) `Phase 2.23 — Shell verification and spec sync`.
