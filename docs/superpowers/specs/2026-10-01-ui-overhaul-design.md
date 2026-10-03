# UI overhaul — design

**Date:** 2026-10-01
**Status:** approved in brainstorm, awaiting spec review
**Goal:** replace the two competing design languages with one calm, crafted, companion-first
shell. Feel: "OpenAI designed it", with charm carried by Nova (Halo) and the Zombies pack (BO2).
Build the skeleton for every screen first, then fill in.

**Reference mockups** (served by the brainstorm companion, files in
`.superpowers/brainstorm/476-1790888796/content/`):
`rail-v12.html` (shell + sidebar), `nova-v13.html` + `states-v14.html` (bar finish, Nova states),
`session-v19.html` (shield meter), `cards-v20.html` (flashcards, results),
`screens-v21.html` (Decks, Grades, Calendar, setup, backup), `final-v10.html` (course view,
Zombies pack). Screenshots: `.superpowers/ui-review/bs-*.png`. Decision log:
`.superpowers/ui-review/decisions.md`.

## Non-goals

- No change to data, IPC, priority engine, SM-2 math, grade math, Blackboard sync.
- No change to OM 300 built-in content (`src/study/sections`, `src/glossary/courseData.js`).
- No Commons UI. No new features beyond the screen shells listed below.
- A3 (grade/data sweep) stays queued behind this; its Task 7 is re-checked against the new CSS.

## 1. Design system

### 1.1 Tokens (keep `--sh-*` names, change values, add a few)

Keeping the names means most components restyle with zero edits. New tokens are additive.

| Token | Value | Notes |
|---|---|---|
| `--sh-bg` | `#04050A` | true black |
| `--sh-panel` | `rgba(14,16,24,.72)` | cards, translucent |
| `--sh-side` (new) | `#030407` | rail |
| `--sh-panel-strong` / `--sh-panel-solid` | `#0E1018` | raised surfaces, bar, cards, bubbles |
| `--sh-border` / `--sh-border-strong` | `rgba(255,255,255,.08)` / `.15` | |
| `--sh-track` | `rgba(255,255,255,.08)` | bar tracks |
| `--sh-text` / `-2` / `-3` | `#F5F7FA` / `#A9B0BC` / `#757D8A` | text-3 is the floor |
| `--sh-accent` | `#4CF0E8` aqua | the primary accent |
| `--sh-accent-ink` (new) | `#021412` | text on accent fills |
| `--sh-accent-2` (new) | `#FF4FD8` magenta | secondary only: ambient, slash commands, exam tags, formula rule, gradient ends, bar's bottom-right corner |
| `--sh-warn` | `#FFC857` | at-risk, "due soon", medium-confidence marks |
| `--sh-danger` | `#FF4D4F` | health, shields down, errors |
| `--sh-radius-*` | `0` | hard edges everywhere |
| `--sh-cut` (new) | `12px` | chamfer size for the cut-corner shape |

`--sh-accent-soft/-line/-hover`, `--sh-warn-*`, `--sh-danger-*` are recomputed with `color-mix()`
from the new bases. Colors may get one more refinement pass later; only token values change.

### 1.2 Type

- Display / wordmark: **Michroma**, uppercase, `letter-spacing: .06em` (`--sh-font-display`, new).
  Used for: NOVA wordmark, STUDY HUB, round titles ("ROUND 3 COMPLETE"), setup headlines.
- Body: **Geist** (`--sh-font-body`, replaces Manrope).
- Numbers, times, codes, readouts, small caps labels: **Geist Mono** (`--sh-font-mono`,
  replaces JetBrains Mono). `--sh-font-hud` (Chakra Petch) is retired; HUD labels become Geist
  Mono 11px, uppercase, `.08–.14em`.
- Bundled via `@fontsource` (`michroma`, `geist-sans`, `geist-mono`); if a package is
  unavailable, bundle the woff2 locally. Never a CDN. Remove Manrope, Chakra Petch, JetBrains Mono.
- Scale: 11 (labels) · 12.5 (meta) · 14 (body) · 17–18 (task titles) · 22–24 (page titles) ·
  28–30 (display). Minimum 11px.

### 1.3 Shape and surfaces

- Radius 0 everywhere. Lines are 1px `--sh-border(-strong)`.
- **Cut-corner shape** (`.sh-cut`): chamfered top-left and bottom-right corners, quiet grey
  edge, only the corners colored (aqua top-left, magenta bottom-right). Used by the message box;
  cards in sessions echo it with corner marks.
- Faint hex texture inside the message box only.
- Active states: tabs use `border-bottom: 2px solid var(--sh-accent)`; vertical nav uses a 2px
  left border. Never a full border.

### 1.4 Ambient background

One full-window canvas layer behind everything: ~12 slow drifting sine lines alternating aqua
and magenta at 4–6% opacity, plus two soft radial auras (aqua top-left, magenta bottom-right).
Paused (static frame) when `html[data-motion="reduced"]`. Pack-aware colors.

### 1.5 Motion

All motion respects `html[data-motion="reduced"]` (`src/shell/motion.js`). Durations: hover
150ms, panels 160ms, sidebar slide 160ms after 150ms hover delay, shield snap 120ms, trail
drain 650ms after 450ms, recharge 1.5s.

## 2. Shell

### 2.1 Sidebar

- Rests as a **56px icon rail**: logo, Search, New session, Today, Calendar, Decks, Grades,
  divider, course codes (MIS, MKT…), bottom: Make it yours, Settings.
- Hover (150ms delay) slides it to ~200px as an **overlay** (shadow, content does not shift).
- **Pin** button and **Ctrl B** pin it open in-flow. Inside a course it is pinned by default
  and the course expands into its modules (01 Requirements, 02 Use cases…).
- Collapsed rail hides labels, section header, round tally, attention dot.
- Inside a course the rail is pinned by default and lists the course's items under the active course (modules, then Course and Study groups; OM 300: modules, Reference, Study).

### 2.2 Home ("Pure")

Center of the window: NOVA wordmark (Michroma) → Nova's one-line greeting with the key number
in mono aqua ("Two MIS 430 items land at 10:00") → "Synced 2m ago" → message box → Today's top
three items as cards under the box (top card aqua top edge, due-soon amber). Top strip: date and
round in mono. Today's full ranked list stays reachable (card "more" / Ctrl K / Today in rail).
The old Today dashboard is the Full plan view, linked under the cards.

### 2.3 Every other screen ("Plan")

Content column (max ~680–720px, calendar wider) centered, message box docked at the bottom
with a context-aware prompt ("Message Nova about use cases…", "Ask Nova to plan your week…").
Nova stays in her corner (2.5).

### 2.4 Message box (Nova command bar)

This is the existing Nova Core 6 command bar, restyled and moved into the layout.
- At rest: one row: pulsing Nova hex glyph, "Message Nova, or type / for commands", `Ctrl /`.
- Focused/typing: grows a tool row: attach, Quiz me, Focus 25, `Enter`, send.
- Typing `/` opens a command list above the box (`/quiz`, `/focus`, `/open`, …) mapped to the
  existing command parser.
- Finish: `.sh-cut` + hex texture.

### 2.5 Nova placement and states

The 3D Nova keeps all existing behavior (drag, placement, autonomy, tours); only where she
rests and how big she is change.
- **Rest:** large (~280px tall at 1280w), standing in the bottom-right corner in the empty space
  beside the content column, fading in from the floor with a soft floor glow. Speech: a small
  "NOVA · line" bubble kept inside her lane (never over content).
- **Shrunk:** narrow windows, wide screens (calendar), or "tuck away": she becomes a live
  portrait in the message box glyph; her line replaces the placeholder.
- **Moved:** drag anywhere, or she walks to point at something (e.g. the top card); dashed ghost
  marks home; returns on timeout or double-click.
- **Session:** Nova steps into a larger session lane on the right (≥1100px), full size beside
  the session panel.
- Existing safe-zone logic is updated so content column + bar are her no-go zones.

## 3. Nova session (quiz, drill, flashcards)

Layout "side by side": panel center-left, Nova full size right, reacting per answer. Tucking
Nova gives the calm focus-card layout. Sidebar stays a rail.

- **Top strip:** course · topic (left) · shield meter (center) · card/question n/N and `Esc`
  (right) · thin aqua→magenta progress line.
- **Quiz:** multiple choice rows with key badges; Lock in / Hint / Skip. Keys: 1–n, Enter, H, Esc.
  Skip moves on ungraded: no SM-2 write, no shield change, not counted as answered. Modes
  (Quick, Streak, Weak spots, Clock) all end when health reaches 0; Quick/Weak also end when
  out of cards, Clock when time runs out.
- **Flashcards:** card with aqua/magenta corner marks; front = term + exam tag ("EXAM IN 5
  DAYS") + exam chip; Space flips; back = definition, example (magenta rule); ratings Again /
  Hard / Good / Easy (1–4, SM-2 grades 1 / 3 / 4 / 5) each showing the next interval from
  existing SM-2 ("3 days · before exam"). Existing keyboard rules (palette check, 200ms flip debounce, ignore keys in flight)
  stay.
- **Results ("ROUND N COMPLETE"):** Michroma title, one-line summary, stats strip (accuracy,
  shield at end, best streak, time), medals, mastery change per topic, round tally gains a new
  glowing mark, primary next step ("Review 2 missed"), Another round, Back to Today.

### 3.1 Shield meter (Halo Reach inspired, app-styled)

- Fine scale above (ticks every 10%, tall at 0/50/100).
- **Shield:** one continuous aqua bar, hairline frame with angled ends, soft glow, animated
  energy ripple + occasional light sweep. Drains from both ends toward the center.
- **Health:** 10 red skewed chunks centered beneath.
- Readouts (Geist Mono): `SHIELD 100 · status · HEALTH 10/10`.
- **Hit:** white flash + small shake + ripple speeds up → shield snaps in → pale trail lingers
  then drains → status "HIT · RECHARGE IN 3".
- **Rules:** shields absorb misses; 3 correct in a row recharge (outward from center, bright
  edges). Health drops only while shields are down; each lost chunk = one card re-queued at the
  end. **Shields down:** red frame slow pulse, last chunk blinks, lost chunks red outlines.
- Never touches grades or SM-2 scheduling beyond the existing "missed card returns" behavior.

## 4. Screens

All "Plan" layout unless noted. Shells may show real data where it already exists.

| Screen | Content |
|---|---|
| Home | 2.2 |
| Course workspace | breadcrumb, title, tabs CONTENT/NOTES/GLOSSARY/GRADES, mastery line (aqua→magenta), definitions two-column list (medium confidence = amber square; low = NEEDS REVIEW), formula block (magenta left rule), numbered sections (mono aqua 01 02), `...` course menu, slide-over drawer for glossary/settings, deck mode chips; mastery = flashcard mastery for both course types |
| Decks | "N cards due · ~M min" + Review all due; grouped by course with exam date header; rows: name, cards due, mastery bar, exam countdown |
| Grades hub | rows per course: current grade (mono, amber when at risk) + letter, trend sparkline, next step ("Need 84 on the midterm to reach B"); What if… opens the calculator |
| Calendar | week grid, today aqua top edge; due = aqua edge, exam = magenta, Nova study blocks = dashed; Month toggle; Nova shrunk |
| Session | section 3 |
| First-run setup | no sidebar; steps 01 NAME · 02 BLACKBOARD · 03 MAKE IT YOURS · 04 TOUR; Nova center stage; Michroma headline; privacy points (read only, stays on this computer, no account) |
| Settings | tabs General · Nova · Make it yours · Blackboard · Backup · AI key |
| Backup | status line, Back up now, weekly auto (keeps 4), folder, Restore (backs up first) |
| Command palette | restyled to tokens (cut-corner panel, mono key hints) |

Screens with no backing feature yet (Backup actions, setup steps, Make it yours) ship as shells
wired to existing handlers where they exist, inert otherwise, and are filled in by REL-002 /
REL-003 / C.10.

## 5. Flavor packs ("Make it yours")

Two packs only. A pack swaps token values, ambient colors, Nova's look, copy voice and
celebration effects; layout never changes. Stored as a UI pref (localStorage).

- **Nova (default):** everything above. Celebrations: medals.
- **Zombies:** warm-dark base (`#0A0706` / `#15100D`), accent red `#FF4D4F`, second amber
  `#FFB23F`, power-up green `#7CFF6B`; zombie-tinted Nova with amber eyes; original Origins-style
  dig-site map art in the background with fog and embers; round tally in the corner; power-up
  drops on completion (MAX AMMO style, bounce + glow); Zombies voice ("One down. Reload.").
- Pack art is original (no ripped assets). References are homage in copy and style.

## 6. Systems carried by the UI

- **Rounds:** each completed session or Today item adds a tally mark; 5 marks = next round.
  Shown in the top strip, rail, and results. For now only completed sessions add marks; Today
  items adding marks is deferred to Plan 5 (screen shells).
- **Medals** (Nova pack) / **power-ups** (Zombies pack) on results and completions.
- **Shield meter** in sessions (3.1).
- Completing work never changes a grade until it is graded.

## 7. Copy voice

Nova speaks in short, dry, warm lines; numbers come from code, Haiku may rephrase but never
compute. Examples: "Late one, Jack. Two MIS 430 items land at 10:00." · "Last one was clean.
Don't get cocky." · "Shields are down. Slow down, read it twice." UI labels stay plain.

## 8. `.cursorrules` and docs updates (part of the work)

- CSS DESIGN SYSTEM section: new token values, `--sh-accent-2` allowed as secondary (not a
  second primary), `--sh-font-display`, fonts (Michroma/Geist/Geist Mono), radius 0, cut-corner
  shape, vertical nav left-border rule, ambient background.
- COMPONENT RULES: definition cards and section blocks restated in aqua/amber (no "green").
- Visual reference changes from `docs/design/today-mockup.html` to this spec + mockups.
- `docs/companion-spec.md` ("Scout the firefly") is stale; replace with a short pointer to the
  Nova docs (or update) in the same pass.

## 9. Rollout (for the plan)

1. Tokens + fonts + ambient layer (everything restyles in place).
2. Shell: rail sidebar, Pure home, Plan layout, message box (merge command bar), Nova lane and
   states, safe zones.
3. Course workspace restyle.
4. Session: layout, shield meter, flashcards, results, rounds/medals.
5. Screen shells: Decks, Grades hub, Calendar, Settings tabs, Backup, First-run setup.
6. Zombies pack.
7. `.cursorrules` + docs.

Each step: `npm run build`, OM 300 still works, screenshots with the webapp-testing skill
compared to the mockups, no `console.*` in production paths.

## 10. Risks

- **3D Nova at ~280px** costs more GPU than today's size; keep the existing draw-mode/portrait
  fallback and the Shrunk state for weak GPUs.
- **Safe zones:** Nova must never cover the content column or bar at any window size; narrow
  windows force Shrunk.
- **Font packages:** confirm `@fontsource` names before step 1.
- **Scope creep:** shells stay shells; features land in their own roadmap steps.
