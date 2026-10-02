# UI Overhaul 3 — Course Workspace Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development to execute this plan task by task.

**Goal:** Both course views (user courses in `UserCourseApp`, OM 300 in `BuiltinCourseApp`) drop their own left sidebar, right context panel and status bar. The course's items move into the app rail (pinned by default inside a course). Content renders in the centered 720px column with breadcrumb, title, tabs, a mastery line and a `...` course menu, with the message box docked at the bottom and Nova in her lane.

**Architecture:** Course apps keep owning their state (`active`, `activeItem`, `mainTab`). They *publish* a small nav model to `ShellContext` (`courseNav`), which `AppRail` renders under the active course. Selecting an item calls the course's own callback. A pure module (`src/hub/courseNav.js`) builds the nav model for both course types and is unit-tested. Shared presentational pieces: `CourseHeader`, `CourseMenu`, `SideDrawer`. Each course app wraps itself in the existing `.sh-plan` layout with a docked `NovaBar`.

**Tech Stack:** React 18, Vite, vitest, Playwright (verification).

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` §2.1, §4 (Course workspace row). Mockups: `.superpowers/ui-review/bs-v5-12-course.png`, `bs-v5-10-course.png`.

**Decisions made with the user for this step:**
1. The right panel's tools move to a **`...` course menu** beside the title (module/course actions, Materials, course settings). Deck modes become **chips above the deck**. OM 300's glossary term reader and course settings open in a **slide-over drawer** from the right.
2. The rail lists **all** course items under the active course, in groups: modules, then Course (Assignments, Announcements, Blackboard content), then Study (Flashcards, Practice test, Study guide, Progress). OM 300: modules, Reference (Final review, Formulas), Study (Flashcards).
3. The mastery line uses **flashcard (SM-2) mastery for both**: `masteryPercent(cards)` from `src/study/sm2.js`; OM 300 reads its cards from `loadFlashcardDeck()` (`src/study/flashcards/flashcardPersistence.js`) and refreshes on `studyhub-flashcards-updated`. Chapter completion stays visible as a ✓ on rail items.

## Global Constraints

- Tokens only (`--sh-*`, `color-mix()` over tokens). Radius 0. Michroma always weight 400.
- `--sh-accent` is the only interactive accent; `--sh-accent-2` only for the formula rule, the mastery gradient end, exam tags, cut corners.
- Labels/codes/numbers in `--sh-font-mono`, 11px minimum. Page title 22–24px.
- Tabs: `border-bottom: 2px solid var(--sh-accent)` active state; vertical nav: 2px left accent. Never a full border.
- Motion via `html[data-motion="reduced"]` selectors or `useReducedMotion()`; never `@media (prefers-reduced-motion)`. Drawer slide 160ms.
- No `console.*`. Do not edit OM 300 content (`src/study/sections/*`, `src/study/final/*` content, `src/glossary/courseData.js`). Styling components (`src/components/study/StudyTypography.jsx`, `FlashcardDeck.jsx`) may change markup classes.
- Data writes keep their existing code paths (upserts by uuid). No schema change.
- Keyboard: arrows / Ctrl+R stay in the course apps with their current guards (add the `paletteOpen()` guard to OM 300's handlers, which lack it).
- Keep these `data-tour-id`s (they may move): `course-modules`, `course-mirror`, `course-drill`, `course-tabs`, `course-context` (→ the mastery line).
- localStorage only for UI prefs.
- Every task ends with `npm run test` and `npm run build` passing.
- Commit format: `Phase 2.24 — Short description` + bullets, UTF-8 without BOM, `git commit -F`. Stage only files you changed.

---

### Task 1: Course nav model, rail sub-nav, shared header pieces

**Files:**
- Create: `src/hub/courseNav.js`, `src/hub/courseNav.test.js`, `src/hub/components/CourseHeader.jsx`, `src/hub/components/CourseMenu.jsx`, `src/shell/SideDrawer.jsx`
- Modify: `src/shell/ShellContext.jsx`, `src/shell/AppRail.jsx`, `src/studyhub-bootstrap.css`

**Interfaces:**

```js
// src/hub/courseNav.js
/** @typedef {{ id: string, prefix: string, label: string, badge?: string|number, complete?: boolean, tone?: "amber"|"accent" }} NavItem */
/** @typedef {{ key: string, label: string|null, tourId: string, items: NavItem[] }} NavGroup */

export function userCourseNav(course, { completedIds = [], badges = {} } = {}) /* -> NavGroup[] */;
export function builtinCourseNav({ chapters, completedIds = [] }) /* -> NavGroup[] */;
```

- `userCourseNav`: group `modules` (label `null`, tourId `course-modules`): every non-disabled module in order, `id: "module:" + m.id`, `prefix` two-digit index (`"01"`), `label` module label, `complete` when in `completedIds`. Group `course` (label `"Course"`, tourId `course-mirror`): `COURSE_ITEMS` from `CourseSidebar.jsx` with prefixes `AS`/`AN`/`BB`. Group `study` (label `"Study"`, tourId `course-drill`): `STUDY_ITEMS` with prefixes `QZ`/`PT`/`SG`/`ST`. `badge` from `badges[id]` when truthy. Move `COURSE_ITEMS` / `STUDY_ITEMS` into `courseNav.js` (export them; `CourseSidebar.jsx` is deleted in Task 2 — until then re-export from it).
- `builtinCourseNav`: from `STUDY_SIDEBAR_GROUPS` (`src/study/chapterUiMeta.js`): `mod` → label `null`, tourId `course-modules`, prefix two-digit chapter number taken from `studySidebarPrefix(id)` (`CH·06S` → `06S`); `ref` → label `"Reference"`, tourId `course-mirror`, prefixes `FR`/`EQ`, `tone: "amber"`; `drill` → label `"Study"`, tourId `course-drill`, prefix `QZ`, `tone: "accent"`. Only chapters present in `chapters` (the visible list); `complete` from `completedIds`.

```js
// ShellContext additions
courseNav: { courseId: string, groups: NavGroup[], activeId: string, onSelect: (id) => void } | null
setCourseNav(next | null)
prompt: string | null   // message box placeholder for the course
setPrompt(text | null)
```

- `CourseHeader({ crumb, title, titleNode, tag, tabs, activeTab, onTab, masteryPct, menu })`
  - `crumb`: `[strong, rest]` → `MIS 430` (mono, `--sh-accent`) ` / ` `02 Use cases` (mono, `--sh-text-3`), 12px.
  - `title` (string) or `titleNode` (e.g. an `InlineEdit`), 24px/600 `--sh-font-body`; `tag` optional mono chip after it.
  - `tabs`: `[{ id, label, disabled?, dot? }]` rendered as `.sh-tab` buttons inside `div.sh-tab-row[data-tour-id="course-tabs"]`; omit the row when `tabs` is empty.
  - Mastery line `div.sh-mastery[data-tour-id="course-context"]`: label "Mastery" (12.5px `--sh-text-3`), a 3px track (`--sh-track`) with fill `linear-gradient(90deg, var(--sh-accent), var(--sh-accent-2))` at `masteryPct`%, value mono `62%` right. Omit when `masteryPct == null`.
  - `menu`: items for `CourseMenu`, rendered at the right end of the title row.
- `CourseMenu({ items })` — `items: [{ label, onClick, danger?, disabled?, divider? }]`. A `...` button (`aria-label="Course menu"`, `aria-haspopup="menu"`, `aria-expanded`) opening a `role="menu"` list of `role="menuitem"` buttons; closes on outside pointerdown, Escape, or after a pick; Arrow Up/Down move focus between items. Styling: `--sh-panel-solid`, 1px `--sh-border-strong`, `--sh-shadow-panel`, items 13px, danger in `--sh-danger`.
- `SideDrawer({ open, title, onClose, children })` — fixed right panel 380px wide, full height below the top strip (`top: var(--sh-topbar-h)`), `--sh-panel-solid`, left border `--sh-border-strong`, `z-index: 9400` (above Nova's 9000, below settings 9500); header with mono title + close button; Escape closes; slides in 160ms (`transform: translateX`), none under reduced motion. Renders nothing when closed. Mark it `data-sprite-avoid`.

**Rail behavior in a course (`AppRail`):**
- Reads `courseNav` from `useShell()`. Under the course row whose `id === courseNav.courseId`, when the rail is visually open (pinned or hovered), render the groups: optional group label (mono 11px uppercase `--sh-text-3`, `.1em`), then items as buttons — prefix (mono 11px; `--sh-accent` when active, `--sh-warn` for `tone: "amber"`), label (13px, ellipsis), `complete` → a small `✓` in `--sh-text-3` after the label, `badge` → mono 11px pill at the right. Active item: `--sh-text` + inset 2px left accent. Each group wrapper carries its `tourId` as `data-tour-id`. Click → `courseNav.onSelect(item.id)`.
- Sub-items are hidden when the rail is collapsed (56px, not hovered) — same opacity/visibility technique as the labels.
- Pinned inside a course by default: separate pref `sh-rail-pinned-course` (default `true`); hub keeps `sh-rail-pinned` (default `false`). The Pin button and Ctrl+B toggle the pref for the current context (`onHub` → hub pref, else course pref). `showPinned = onHub ? pinnedHub : pinnedCourse`.
- The course list scrolls as a whole (the sub-items live inside `.sh-rail-course-list`).

- [ ] **Step 1: Failing test** `src/hub/courseNav.test.js`: a two-module user course (one disabled) → modules group has 1 item `{ id: "module:m1", prefix: "01", complete }`; badges map onto `qz-deck` / `course-assignments`; group order and tourIds; builtin nav from a subset of chapters (`["ch1","ch6s","final","flashcards"]`) → prefixes `01`, `06S`, `FR` (amber), `QZ`, labels from the chapter metadata, no `formulas` item when not in `chapters`. Run → FAIL.
- [ ] **Step 2:** Implement `courseNav.js` → PASS.
- [ ] **Step 3:** ShellContext fields; `CourseHeader`, `CourseMenu`, `SideDrawer`; `AppRail` sub-nav + per-context pin; CSS. Nothing publishes `courseNav` yet, so the app looks unchanged — verify the rail by temporarily calling `setCourseNav` with a fixture from `UserCourseApp`, screenshot, then remove.
- [ ] **Step 4:** `npm run test`, `npm run build`. Commit `Phase 2.24 — Course nav model and shared header pieces`.

---

### Task 2: User course workspace

**Files:**
- Modify: `src/hub/UserCourseApp.jsx`, `src/hub/components/CourseContentArea.jsx`, `src/app/StudyHubApp.jsx` (pass `novaCourses={userCoursesList}`), `src/studyhub-bootstrap.css`
- Delete: `src/hub/components/CourseSidebar.jsx`, `src/hub/components/CourseContextPanel.jsx`, `CourseSidebarSkeleton` if it becomes unused, and CSS only they used (grep each selector first)

**Layout.** `UserCourseApp` renders:

```jsx
<div className="sh-plan sh-course sh-app-usercourse">
  <div className="sh-plan-col">
    {isCourseView ? null : <CourseHeader … />}
    <CourseContentArea … />   {/* body only; its own .sh-main-header/tab row is removed */}
  </div>
  <div className="sh-plan-dock"><NovaBar courses={novaCourses} placeholder={prompt} /></div>
  {toast}
</div>
```

- `isCourseView`: `activeItem` is one of the `COURSE_VIEWS` keys — those views keep rendering full-body with no header (as today), but inside the column.
- Header: `crumb = [shortCourse(courseCode || name) || name, `${pad2(index)} ${module.label}`]`; `titleNode` = the existing `InlineEdit` for the module label (rename module, same handler `CourseSidebar` used); tabs content/notes/glossary/grades (Grades always enabled, as today); `masteryPct = masteryPercent(c.flashcards)`; on `qz-deck` the title is "Flashcards" and tabs are omitted.
- Prompt: `Message Nova about ${module.label}…` (on deck: `Message Nova about these cards…`).
- Publish nav: effect → `setCourseNav({ courseId: course.id, groups: userCourseNav(c, { completedIds, badges }), activeId: activeItem, onSelect })` where `onSelect` is the old sidebar `onActiveChange` logic (`module:` → `selectModule`, else `setActiveItem` + `setMainTab("content")`); clear with `setCourseNav(null)` on unmount. Keep `onSelect` stable (ref or `useCallback`) so the effect doesn't loop.
- `...` menu items: Rename course (puts the crumb's course name into an `InlineEdit` editing state — smallest working approach; say which), Add module, Delete module, Delete course (danger, divider before), Set up grades (only when `!hasGrades` → grades tab), Edit card (only on deck → `flashcardEditTriggerRef`). Reuse the existing handlers verbatim, including their confirm prompts.
- Deck modes: chips row above `FlashcardDeck` in `CourseContentArea` (move the `DECK_MODES` markup from `CourseContextPanel`; chip = mono 11px button, active `--sh-accent` text + `--sh-accent-soft` bg, label + due count), plus the "x/y cards · n due" line in `--sh-text-3`.
- Remove `sidebarCollapsed`, `ctxCollapsed`, `shellSkelVis` if only the removed panels used them; remove `setStatusBar` calls. Keep breadcrumb (`setBreadcrumb`) — the top strip shows it (Task 5).
- Content blocks still render with their current classes; Task 4 restyles them.

- [ ] **Step 1:** Implement. Keep `takePendingCourseView`, events, keyboard handlers, toast unchanged.
- [ ] **Step 2:** `npm run test`, `npm run build`. Throwaway Playwright under `.superpowers/ui-review/task3-2/` (not committed): open the MIS course from the rail (create one via Courses → manual setup if the fixture has none), screenshot content, notes, glossary, grades, each Course/Study item, the open `...` menu, deck with chips; rename a module from the title; Ctrl+R marks complete (✓ in rail); arrows change module. Compare with `bs-v5-12-course.png`.
- [ ] **Step 3:** Commit `Phase 2.24 — User course workspace`.

---

### Task 3: OM 300 workspace

**Files:**
- Modify: `src/study/BuiltinCourseApp.jsx`, `src/app/StudyHubApp.jsx` (pass `novaCourses`), `src/studyhub-bootstrap.css`

**Layout.** Same `.sh-plan.sh-course` wrapper and docked `NovaBar` as Task 2 (`placeholder`: `Message Nova about ${current.title}…`).
- Header: `crumb = ["OM 300", `${prefix} ${current.title}`]` where prefix is the nav prefix (`01`, `FR`, `QZ`); `title = current.title`; tabs Content / Notes (Notes `dot` when the chapter has notes; on notes tab keep the export button — render it at the right of the tab row via a `tabsExtra` prop on `CourseHeader` or as the first menu item "Export notes", pick the smaller diff and say which); no tabs on `flashcards`. `masteryPct = masteryPercent(loadFlashcardDeck().cards)` (check the return shape), recomputed on `studyhub-flashcards-updated`.
- Publish nav: `builtinCourseNav({ chapters: visibleChapters, completedIds })`, `courseId: "builtin"`, `activeId: active`, `onSelect: (id) => { setActive(id); setMainTab("content"); }`.
- `...` menu: Materials (opens `MaterialsOffcanvas`), Course settings… (opens the drawer with the existing settings section moved as-is: Add new course, Module visibility, Show all, Clear completion, Comfort spacing, A−/A+), and on `flashcards`: Add card, Restore seed deck, Delete current card (the existing `<details>` DECK actions, same handlers/confirm).
- Glossary: when `splitOpen`, render `GlossaryContextBlock` inside `SideDrawer` (`title="GLOSSARY"`, `onClose={closeSplit}`).
- `studyhub-open-settings` opens the settings drawer (it used to toggle the panel section).
- Remove the inline sidebar, right panel, `search`/`filteredChapters` (arrows then walk `visibleChapters`), `sidebarCollapsed`/`ctxCollapsed`, status bar calls. Add the `paletteOpen()` guard to the arrow and Ctrl+R handlers.
- Body keeps its font-scale/comfort inline styles and `StudySectionBody`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run test`, `npm run build`. Throwaway Playwright under `.superpowers/ui-review/task3-3/`: OM 300 first chapter, scrolled, notes, a glossary term click (drawer), Formulas, Final review, Flashcards front/back, `...` menu, settings drawer (toggle A+ and see text grow), Materials. Arrows and Ctrl+R still work.
- [ ] **Step 3:** Commit `Phase 2.24 — OM 300 workspace`.

---

### Task 4: Content blocks restyle

**Files:**
- Modify: `src/studyhub-bootstrap.css`, `src/components/study/StudyTypography.jsx` (classes only), `src/hub/components/CourseContentArea.jsx` (classes only, if needed)

Match the mockup (`bs-v5-12-course.png`) and spec §4 row:
- **User-course definitions** (`.def-card.sh-pptx-card`): no box. Rows separated by 1px `--sh-border` lines; two columns — term (14px/600 `--sh-text`, ~32% width) and definition (14px `--sh-text-2`). Medium confidence: a 6px `--sh-warn` square after the term (replace the dot; drop the inline `borderLeft*`/`opacity` styles from `DefinitionCard` and express tiers with classes). Low confidence stays in the NEEDS REVIEW section (toggle label mono 11px `--sh-warn`). Card actions appear on row hover. Under 700px column width the row stacks (term above definition) — use a container query on `.sh-plan-col` (`container-type: inline-size`).
- **Section blocks:** `.sh-section-label` → mono 11px uppercase `--sh-text-3` `.12em` (no accent). Numbered: mono `--sh-accent` `01 02` (`.sh-item-number`), text `--sh-text-2`. Bullets: `—` in `--sh-text-3`. Deflist: term above, definition indented 16px.
- **Formula blocks** (`.sh-formula-block`, `.def-card--formula`): flat, background `color-mix(in oklab, var(--sh-accent-2) 6%, transparent)`, 2px left rule `--sh-accent-2`, formula text mono 13px `--sh-text`, label mono 11px `--sh-accent-2`.
- **OM 300 cards** (`.def-card` from `Card`): flat rows like the definitions (no box, separator lines), title 14px/600, body `--sh-text-2`; keep nested formula boxes working. `NumList` / `BulletList`: replace inline styles with classes `.sh-numlist` / `.sh-bulletlist`; numbered uses a CSS counter rendered mono `--sh-accent` two-digit (`decimal-leading-zero`), 14px text.
- **Glossary cards** (`.sh-glossary-card`): same row style as definitions; meta line mono 11px.
- Body text in the column: 15px / 1.6 `--sh-text-2`, headings `--sh-text`. Remove the 65ch max-width rule for content inside `.sh-plan-col` (the column already limits width).
- Deck (`.drill-*`) and grades table: only fix anything broken at 720px width (overflow, cramped columns); no redesign (step 4 redoes the session/deck).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run test` (token test must stay green), `npm run build`. Screenshots of the same screens as Tasks 2–3 into `.superpowers/ui-review/task3-4/`; compare with the mockup.
- [ ] **Step 3:** Commit `Phase 2.24 — Course content blocks restyle`.

---

### Task 5: Shell glue, tours, verification

**Files:**
- Modify: `src/app/StudyHubApp.jsx`, `src/components/TitleBar.jsx`, `src/shell/TilingChrome.jsx` / `StatusBar` (delete if unused), `src/shell/ShellContext.jsx` (drop `statusLeft/statusRight/setStatusBar` if unused), `src/companion/tours/course-tools.json`, `src/companion/faq.js` (only if a `pointTo` broke), `src/companion/CompanionLayer.jsx` (radial REARRANGE inside a course), `.superpowers/ui-review/tour.py` (scratch), `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md`

- Nova: `novaPlace` = `"lane"` in courses too (calendar stays `"tuck"`). She houses in the lane when there's room, else tucks into the bar.
- Remove the `.sh-shell-body` wrapper's leftover chrome and the `StatusBar` render; delete dead code it leaves.
- Top strip: inside a course, center shows the breadcrumb (`MIS 430 · MODULE 02` style, mono 11px `--sh-text-3`, `.14em`) instead of the date; left crumb removed. Build it from `breadcrumb` in ShellContext.
- Radial menu REARRANGE inside a course: hide those items when not on the hub (deferred from Plan 2) instead of jumping to Full plan.
- Tours: `course-tools.json` steps still target `course-modules`, `course-mirror`, `course-drill` (now rail groups — placement `right`), `course-tabs`, `course-context` (now the mastery line — placement `bottom`). The tour must open a course with the rail pinned so the targets are visible; check `ensureRoute("course")`.
- `tour.py`: replace `.sh-sidebar .ch-item` clicks with rail sub-item clicks (`.sh-rail [data-tour-id=course-modules] button`, etc.), wait for `.sh-course` instead of `.sh-workspace`; add shots `course-menu`, `course-drawer-glossary`, `course-settings-drawer`, `course-1280-tucked`. Run the full tour and the Nova smoke.
- Spec sync: §2.1 drop the "until step 3" note; §4 course row: add "`...` course menu, slide-over drawer for glossary/settings, deck mode chips; mastery = flashcard mastery for both course types".

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run test`, `npm run build`, Nova smoke, tour. Compare course shots with `bs-v5-12-course.png`; list mismatches; fix CSS-level ones in files this plan touched.
- [ ] **Step 3:** Commit `Phase 2.24 — Course shell glue and verification`.
