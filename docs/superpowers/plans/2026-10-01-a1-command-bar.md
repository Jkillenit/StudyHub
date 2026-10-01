# A1 — Command bar + hotkey guard + palette index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Nova Core Phase 6 (command bar, already written but uncommitted), plus TD-06 (one shared hotkey guard) and TD-04 (command palette stops rebuilding its index while closed and on every keystroke).

**Architecture:** The command bar lives in `src/nova/commands.js` (pure parser, tested) and is wired through `HelpBubble.jsx` and `CompanionLayer.jsx`; it needs verification, docs and a commit, not new code. TD-06 adds `src/lib/hotkeys.js` and replaces five local copies. TD-04 splits `CommandPalette`'s single `useMemo` into "build rows (only while open)" and "filter rows (per keystroke)", with parent callbacks read from a ref.

**Tech Stack:** React 18, Vite, vitest (node environment, no DOM), Electron. Visual checks via `.agents/skills/webapp-testing` (Python Playwright against `npm run dev`; in a plain browser `window.studyHub` is absent and `courseStore` no-ops, which is enough for the palette and Nova's bubble).

## Global Constraints

- Every task passes `npm run build` and `npx vitest run` (265+ tests green).
- No `console.log` / `console.error` in production paths.
- Styling only via `--sh-*` tokens in `src/studyhub-bootstrap.css`; no hardcoded colors, fonts, radii, shadows.
- Renderer never calls `require()`; DB access only through `src/db/courseStore.js`.
- OM 300 built-in course must keep working (`src/study/sections`, `src/glossary/courseData.js` untouched).
- Design skill: read `.agents/skills/frontend-design/SKILL.md` before judging UI; `.cursorrules` design system wins where they conflict (uppercase Chakra Petch HUD labels, mono numbers, cyan only accent).
- Commit format: `Phase 2.18 — Short description` + bullet list.

---

### Task 1: Ship the command bar (Nova Core Phase 6)

**Files:**
- Already modified (uncommitted): `src/companion/CompanionLayer.jsx`, `src/companion/HelpBubble.jsx`, `src/companion/character.js`, `src/nova/mood.js`, `src/studyhub-bootstrap.css`
- Already created (untracked): `src/nova/commands.js`, `src/nova/commands.test.js`
- Modify: `docs/design/NOVA_CORE.md` (section 8 checkboxes)
- Create (throwaway, not committed): `%TEMP%\a1_smoke.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseCommand(text, { courses })`, `describeCommand(cmd)`, `CHIPS`, `dueBetween(...)` in `src/nova/commands.js`; `api.current.runCommand(cmd)` and `api.current.startFocus(minutes)` in `CompanionLayer`. Task 2 adds a palette guard to the Ctrl+J listener added here.

- [ ] **Step 1: Run the parser tests**

Run: `npx vitest run src/nova/commands.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built in …` (the >600 kB chunk warning is pre-existing).

- [ ] **Step 3: Visual smoke test with webapp-testing**

Run `python .agents/skills/webapp-testing/scripts/with_server.py --help` first. Then write `%TEMP%\a1_smoke.py`:

```python
from playwright.sync_api import sync_playwright
import os

out = os.environ.get("TEMP", ".")
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    page.keyboard.press("Control+j")
    page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/a1_empty.png")
    page.fill(".sc-help-input", "focus 5")
    page.wait_for_timeout(300)
    assert page.locator(".sc-ask-run").inner_text().strip().endswith("Focus for 5 minutes")
    page.screenshot(path=f"{out}/a1_preview.png")
    page.fill(".sc-help-input", "purple monkey dishwasher")
    page.wait_for_timeout(300)
    assert page.locator(".sc-help-dunno").count() == 1
    assert page.locator(".sc-ask-chip").count() == 6
    page.screenshot(path=f"{out}/a1_unknown.png")
    b.close()
print("smoke ok")
```

Run: `python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 -- python %TEMP%\a1_smoke.py`
Expected: `smoke ok`. If Nova is disabled by default in a fresh browser profile (no bubble appears), enable her in Settings inside the script before Ctrl+J, or fall back to `npm run electron:dev` and check by hand.

- [ ] **Step 4: Design review of the screenshots**

Open the three screenshots. Check against `frontend-design` (copy is plain and active, empty and error states give direction, one glow at most) and `.cursorrules` (tokens only, HUD labels uppercase, cyan accent only, nothing under 11px). Fix any violation in `src/studyhub-bootstrap.css` (`.sc-ask-*`, `.sc-focus-pill`) and rerun Step 3.

- [ ] **Step 5: Check off section 8 in `docs/design/NOVA_CORE.md`**

Change all five `- [ ]` under `## 8. Command Bar (talking to her without AI)` to `- [x]`. Enhanced-mode routing ships in Nova Core 8, so the "Unknown input" bullet becomes:

```markdown
- [x] **Unknown input:** she answers in character and shows the closest commands
      ("No idea what that means. Did you want one of these?"). With a key in enhanced mode,
      unknown input goes to the AI instead (Nova Core 8).
```

- [ ] **Step 6: Commit**

```bash
git add src/nova/commands.js src/nova/commands.test.js src/companion/CompanionLayer.jsx src/companion/HelpBubble.jsx src/companion/character.js src/nova/mood.js src/studyhub-bootstrap.css docs/design/NOVA_CORE.md
git commit -m "Phase 2.18 — Nova Core Phase 6: command bar" -m "- Ask Nova (Ctrl+J or radial menu): typed commands, chips, live preview row
- Intent matcher with course nicknames and one-edit typo forgiveness (no AI)
- Focus mode with countdown pill; due, need-score, grades, layout and move commands
- Small talk pool and in-character unknown-input reply"
```

---

### Task 2: Shared hotkey guard (TD-06, hotkey part)

**Files:**
- Create: `src/lib/hotkeys.js`
- Create: `src/lib/hotkeys.test.js`
- Modify: `src/study/flashcards/FlashcardDeck.jsx:37-41`
- Modify: `src/hub/UserCourseApp.jsx:30-34`
- Modify: `src/companion/QuizPanel.jsx:24-30`
- Modify: `src/features/practice/PracticeTestView.jsx:10-16`
- Modify: `src/study/BuiltinCourseApp.jsx:178,189`
- Modify: `src/companion/CompanionLayer.jsx` (Ctrl+J listener from Task 1)
- Modify: `docs/PRODUCT_BACKLOG.md` (TD-06 row)

**Interfaces:**
- Consumes: Ctrl+J listener in `CompanionLayer` (Task 1).
- Produces: `isTypingTarget(el: Element | null): boolean`, `paletteOpen(): boolean` from `src/lib/hotkeys.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/hotkeys.test.js`

```js
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./hotkeys.js";

describe("isTypingTarget", () => {
  it("is true for fields and contentEditable, false otherwise", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName }), tagName).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/hotkeys.test.js`
Expected: FAIL, cannot resolve `./hotkeys.js`.

- [ ] **Step 3: Implement** — `src/lib/hotkeys.js`

```js
/** True when keystrokes belong to a field: input, textarea, select or contentEditable. */
export function isTypingTarget(el) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
}

/** True while the command palette is open. */
export const paletteOpen = () => !!document.querySelector(".sh-palette");
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/hotkeys.test.js`
Expected: PASS.

- [ ] **Step 5: Replace the local copies**

In each file delete the local `function isTypingTarget(el) { … }` (and local `paletteOpen`) and import instead. Fix the relative path per file:

- `src/study/flashcards/FlashcardDeck.jsx`: delete lines 37-41; add `import { isTypingTarget } from "../../lib/hotkeys.js";`
- `src/hub/UserCourseApp.jsx`: delete lines 30-34; add `import { isTypingTarget } from "../lib/hotkeys.js";`
- `src/companion/QuizPanel.jsx`: delete lines 24-30 (`paletteOpen` and `isTypingTarget`); add `import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";`
- `src/features/practice/PracticeTestView.jsx`: delete lines 10-16; add `import { isTypingTarget, paletteOpen } from "../../lib/hotkeys.js";` (the palette element carries `.sh-palette`, so the narrower selector is equivalent).
- `src/study/BuiltinCourseApp.jsx`: add `import { isTypingTarget } from "../lib/hotkeys.js";` and replace both

```js
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
```

with

```js
      if (isTypingTarget(e.target)) return;
```

(This also fixes arrow keys changing chapter while a `<select>` is focused.)

- `src/companion/CompanionLayer.jsx`: add `import { paletteOpen } from "../lib/hotkeys.js";` and in the Ctrl+J `onKey`, change

```js
      if (!stateRef.current?.enabled || modeRef.current === "hidden") return;
```

to

```js
      if (!stateRef.current?.enabled || modeRef.current === "hidden" || paletteOpen()) return;
```

- [ ] **Step 6: Verify no copies remain**

Run: `rg -n "function isTypingTarget|function paletteOpen|const paletteOpen" src`
Expected: only `src/lib/hotkeys.js`.

- [ ] **Step 7: Full tests + build**

Run: `npx vitest run; npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 8: Update the backlog row**

In `docs/PRODUCT_BACKLOG.md`, replace the TD-06 row with what remains (the duplicate `ApiStatusSync` is already gone, and `BuiltinCourseApp.htmlToPlainText` is a different export format, not a duplicate):

```markdown
| TD-06 | Hotkey guard shared via `lib/hotkeys.js` (done, Phase 2.18). Left: `BuiltinCourseApp` has 4 identical localStorage effects and an `execCommand` clipboard fallback | `usePersistedState`; drop the fallback (Electron has `navigator.clipboard`) | ~25 | Low |
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/hotkeys.js src/lib/hotkeys.test.js src/study/flashcards/FlashcardDeck.jsx src/hub/UserCourseApp.jsx src/companion/QuizPanel.jsx src/features/practice/PracticeTestView.jsx src/study/BuiltinCourseApp.jsx src/companion/CompanionLayer.jsx docs/PRODUCT_BACKLOG.md
git commit -m "Phase 2.18 — Shared hotkey guard (TD-06)" -m "- lib/hotkeys.js: isTypingTarget and paletteOpen replace five local copies
- OM 300 chapter arrows now ignore a focused select
- Ctrl+J does nothing while the command palette is open"
```

---

### Task 3: Command palette index only while open (TD-04)

**Files:**
- Modify: `src/shell/CommandPalette.jsx`
- Modify: `docs/PRODUCT_BACKLOG.md` (remove TD-04 row)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no API change; `CommandPalette` props are unchanged.

- [ ] **Step 1: Drop the duplicate matcher**

Delete `function termMatches(query, termItem) { … }` (lines 17-24). Later, change

```js
    let termsF = termRows.filter((row) => termMatches(q, row));
```

to

```js
    let termsF = termRows.filter(filterRow);
```

(`matches` checks `primary + " " + sub`, a superset of what `termMatches` checked.)

- [ ] **Step 2: Read parent callbacks from a ref**

Directly after `const { before: layoutBefore } = useWorkspace();` add:

```js
  /* Parent passes fresh inline callbacks every render; reading them at run time keeps them out of the memo deps. */
  const actionsRef = useRef(null);
  actionsRef.current = { onSelectCourse, onNavigateCourseChapter, onGoToHub, onGoToHubAndNewCourse, onPickImportFiles, onOpenSettings, onExport, onMarkChapterReviewed, onShuffleDeck };
```

Then inside the row builders, replace every direct callback call with a run-time ref read. The full list:

| Old | New |
|-----|-----|
| `run: () => onSelectCourse("builtin")` | `run: () => actionsRef.current.onSelectCourse("builtin")` |
| `run: () => onSelectCourse(ec.id)` | `run: () => actionsRef.current.onSelectCourse(ec.id)` |
| `run: () => onNavigateCourseChapter("builtin", ch.id)` | `run: () => actionsRef.current.onNavigateCourseChapter("builtin", ch.id)` |
| `run: () => onNavigateCourseChapter(ec.id, m.id)` | `run: () => actionsRef.current.onNavigateCourseChapter(ec.id, m.id)` |
| `run: () => onNavigateCourseChapter("builtin", r.chapterId)` | `run: () => actionsRef.current.onNavigateCourseChapter("builtin", r.chapterId)` |
| `onNavigateCourseChapter(activeUserCourse.id, g.moduleId);` (term row) | `actionsRef.current.onNavigateCourseChapter(activeUserCourse.id, g.moduleId);` |
| `run: () => onGoToHub()` | `run: () => actionsRef.current.onGoToHub()` |
| `run: () => onGoToHubAndNewCourse()` | `run: () => actionsRef.current.onGoToHubAndNewCourse()` |
| `run: () => void onPickImportFiles()` | `run: () => void actionsRef.current.onPickImportFiles()` |
| `run: () => onOpenSettings()` | `run: () => actionsRef.current.onOpenSettings()` |
| `run: () => onExport()` | `run: () => actionsRef.current.onExport()` |
| `run: () => onMarkChapterReviewed()` | `run: () => actionsRef.current.onMarkChapterReviewed()` |
| `run: () => onShuffleDeck()` | `run: () => actionsRef.current.onShuffleDeck()` |
| `onGoToHub("today");` (layout rows) | `actionsRef.current.onGoToHub("today");` |

- [ ] **Step 3: Make the dead import-backup row honest**

`executeRow` special-cases `act-import-backup` and never calls its `run()`. Replace that row's `run: () => { const input = document.createElement("input"); … input.click(); },` with:

```js
        /* Stays open: the hidden input unmounts with the palette, and its onChange closes it. */
        keepOpen: true,
        run: () => importBackupRef.current?.click(),
```

and replace `executeRow` with:

```js
  const executeRow = useCallback(
    (row) => {
      if (!row) return;
      row.run();
      if (!row.keepOpen) onClose();
    },
    [onClose]
  );
```

- [ ] **Step 4: Split build from filter**

Rename the existing `const indexRows = useMemo(() => {` to `const allRows = useMemo(() => {`, add `if (!mounted) return null;` as its first line, and end its body (just before `const q = query.trim();`) with:

```js
    return { courseRows, chapterRows, referenceRows, termRows, actionRows };
  }, [mounted, userCourses, courseId, builtinActiveChapter, layoutBefore]);

  const indexRows = useMemo(() => {
    if (!allRows) return { groups: [], flat: [] };
    const { courseRows, chapterRows, referenceRows, termRows, actionRows } = allRows;
```

Keep the existing filter/slice/groups code (from `const q = query.trim();` through `return { groups, flat };`) as the body of the new `indexRows` memo, and replace the old dependency array (`[query, userCourses, courseId, onSelectCourse, … layoutBefore]`) with:

```js
  }, [allRows, query]);
```

- [ ] **Step 5: Build + tests**

Run: `npx vitest run; npm run build`
Expected: green. Then run `rg -n "termMatches|run: \(\) => on|run: \(\) => void on" src/shell/CommandPalette.jsx` and expect no output (every callback goes through `actionsRef`).

- [ ] **Step 6: Visual smoke test**

Write `%TEMP%\a1_palette.py`:

```python
from playwright.sync_api import sync_playwright
import os

out = os.environ.get("TEMP", ".")
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    page.keyboard.press("Control+k")
    page.wait_for_selector(".sh-palette")
    assert page.locator(".sh-palette-row").count() > 0
    page.fill(".sh-palette-input", "tidy")
    page.wait_for_timeout(200)
    assert "Tidy Up" in page.locator(".sh-palette-results").inner_text()
    page.fill(".sh-palette-input", "zzzz-no-match")
    page.wait_for_timeout(200)
    assert page.locator(".sh-palette-empty").count() == 1
    page.screenshot(path=f"{out}/a1_palette.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.locator(".sh-palette").count() == 0
    b.close()
print("palette ok")
```

Run: `python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 -- python %TEMP%\a1_palette.py`
Expected: `palette ok`. Then in `npm run electron:dev`, open the palette, pick "Go to Today", a course and "Import Backup" (file dialog opens, palette stays until a file is picked).

- [ ] **Step 7: Update the backlog and commit**

Delete the TD-04 row from `docs/PRODUCT_BACKLOG.md`'s tech-debt table, then:

```bash
git add src/shell/CommandPalette.jsx docs/PRODUCT_BACKLOG.md
git commit -m "Phase 2.18 — Command palette index only while open (TD-04)" -m "- Rows built only while open; typing filters without rebuilding
- Parent callbacks read from a ref, out of memo deps
- Dead import-backup run body and duplicate term matcher removed"
```

---

## After A1

The git log is the record of done steps; the spec is not edited. Next: write the plan for A2 (TD-11 `CompanionLayer` split + TD-10).
