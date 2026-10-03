# UI Overhaul 6 — Zombies Pack Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development. Task 1 runs first and commits; Tasks 2–5 run in parallel (disjoint files, coordinator commits); Task 6 last.

**Goal:** "Make it yours" switches between two flavor packs, Nova (default) and Zombies. A pack swaps token values, ambient colors, background art, Nova's look, copy voice and celebrations; layout never changes. Rounds get a visible tally outside sessions.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-overhaul-design.md` §1.4, §5, §6, §7. Mockup: `.superpowers/brainstorm/476-1790888796/content/final-v10.html` ("Home (Zombies pack, just finished something)": amber line-art dig-site map, red/amber ambient lines, power-up hopping above the content with green glow, big skewed red tally top-right). Decision log: `.superpowers/ui-review/decisions.md` lines 38–43.

**Decisions made with the user:**
1. **Power-up names are the real ones** (MAX AMMO, DOUBLE POINTS, INSTA-KILL, CARPENTER, NUKE). The user accepted the IP risk; all art stays original (no ripped icons, logos, fonts or audio).
2. **Drops:** on session results (power-ups replace medals in the Zombies pack) and when a round closes (MAX AMMO). Not on every Today completion.
3. **Nova:** red hologram tint + amber eyes, plus tasteful appearance tweaks that sell "zombie" (tattered/ragged clothing edges, grime, occasional flicker). Shader-level only; the VRM file is not edited.
4. **Round tally for both packs:** small tally in the rail and the Home top strip; the Zombies pack adds the big skewed corner tally.

**Decisions made by the planner:**
5. Pack pref: localStorage key `studyHub.v2.prefs.pack` (`"nova" | "zombies"`), applied as `html[data-pack]` before first paint, like `data-motion` (`src/shell/motion.js`). Event `studyhub-pack-changed`, hook `usePack()`.
6. Power-up mapping (pure, tested): round closed → MAX AMMO; perfect run → INSTA-KILL; shields never went down → CARPENTER; best streak medal → DOUBLE POINTS; shields went down and the run still finished with ≥ 80% → NUKE. Same thresholds as `earnedMedals` (`MEDAL_MIN`). At most 3 shown, MAX AMMO first.
7. Power-up green `#7CFF6B` becomes a new token `--sh-power` (defined for both packs; only used by power-ups).

## Zombies tokens (from spec §5)

`--sh-bg #0A0706`, `--sh-side` slightly darker than bg, `--sh-panel-strong/-solid #15100D`, `--sh-panel` translucent `#15100D`, `--sh-accent #FF4D4F` (red, the only interactive accent), `--sh-accent-ink` dark on red, `--sh-accent-2 #FFB23F` (amber, secondary), `--sh-warn` stays amber-ish but must be distinguishable from accent-2 (use `#FFD27A`), `--sh-danger` a deeper red `#E0312F` so health/shields-down still differ from the accent, `--sh-power #7CFF6B`. Text tokens warm-tinted (`#F7F1EC` / `#B9ADA4` / `#83766D`). Derived tokens recompute via `color-mix()` automatically.

## Global Constraints

- `.cursorrules` applies. Tokens only; packs override **token values** under `html[data-pack="zombies"]`, never per-component colors (exception: art layers may use `color-mix()` over tokens). Radius 0. Layout never changes between packs.
- Motion via `html[data-motion="reduced"]` / `useReducedMotion()`: embers, fog drift, power-up hop, Nova flicker all stop (static frame) when reduced.
- Glow only on the single most important element (results: the power-up; home: nothing new glows except the corner tally's soft text-shadow in Zombies).
- Art is original SVG/canvas drawn in code. No external assets, no CDN.
- Nova default pack must look and behave exactly as today (screenshot-compare Home, a course, a session, results in Nova pack before/after).
- No `console.*`. No schema change. No OM 300 content edits.
- **Parallel rules (Tasks 2–5):** edit only your listed files + CSS directly below your own anchor (Task 1 adds anchors). No commits, no git index changes. Build with `npx vite build --outDir .superpowers/build-task6-N`; Playwright on port `5190 + N` (`--server "npx vite --port 519N --strictPort" --port 519N`), scripts in `.superpowers/ui-review/task6-N/`, GPU flags via `from tour import GPU_ARGS`, `python -u`, `$env:PYTHONIOENCODING="utf-8"`. Browser build shows the first-run setup screen: click `.sh-setup-done`. Switch pack in-page with `localStorage.setItem("studyHub.v2.prefs.pack", JSON.stringify("zombies"))` + reload, or via Settings → Make it yours.
- Final report: files changed, screenshot paths + verdicts (Nova pack and Zombies pack), anything not verified.

---

### Task 1: Pack system, tokens, picker (runs alone, commits)

**Files:** create `src/shell/pack.js` + `src/shell/pack.test.js`; `src/main.jsx` (or wherever `applyStoredMotionPref` runs) to apply the pack before render; `src/studyhub-bootstrap.css` (token override block right after `:root`, `--sh-power` in `:root`, anchors at end of file: `/* ── Zombies Nova ── */`, `/* ── Zombies backdrop ── */`, `/* ── Power-ups and tally ── */`); `src/shell/AmbientBackground.jsx` (re-read colors when the pack changes: add pack to the effect deps); `src/features/settings/SettingsScreen.jsx` (pack cards become real buttons: `aria-pressed`, click sets the pack); `src/features/setup/SetupScreen.jsx` (step 03 picks the pack the same way); replace the placeholder Zombies swatch rules with token-based ones.

- `pack.js`: `PACKS = ["nova","zombies"]`, `getPack()`, `setPack(id)` (validates, saves, sets `html[data-pack]`, dispatches `studyhub-pack-changed`), `applyStoredPack()`, `usePack()` (`useSyncExternalStore`). Test: invalid ids fall back to nova; setPack sets the attribute and fires the event.
- Verify: test + build; screenshots of Home in both packs (`.superpowers/ui-review/task6-1/`), Settings Make it yours with Zombies selected. Commit `Phase 2.27 — Flavor pack switch and Zombies tokens` (include this plan file).

### Task 2: Zombie Nova

**Files:** `src/companion/nova3d/NovaStage.js`, `src/companion/nova3d/Nova3D.jsx`, `src/companion/NovaSprite.jsx` (only if the fallback needs a pack class), `src/companion/companionStore.js` (only if level tints must yield to the pack), CSS under `/* ── Zombies Nova ── */`.

- On `studyhub-pack-changed` (and on construction) call `refreshColors()` so the hologram takes the red accent.
- Amber eyes: in `applyHologram()`'s traverse, detect eye materials/meshes by name (log names once in a dev script to find them; VRM eye materials usually contain "Eye"/"EYE"/"iris"); give them their own uniform color (`--sh-accent-2` in Zombies; in Nova pack keep current look exactly).
- Zombie wear (Zombies pack only, behind a `uZombie` uniform 0/1 so Nova pack is untouched): tattered edges on clothing (noise-threshold `discard` concentrated toward hem/sleeve ends using UV or local-Y; keep the body readable), grime (low-frequency noise darkening), occasional flicker (brief intensity dips; none under reduced motion). Keep the shader cheap.
- 2D fallbacks (sprite, portrait, splash, message-box glyph): CSS filter in the Zombies pack shifting toward red with amber accents; level tints (`--nv-tint`) don't fight it (pack wins).
- Verify: screenshots of Nova in her lane, in a session lane, and the sprite fallback, in both packs; `scripts/nova-smoke.py` passes on your port (copy it to your task folder with the port swapped if needed).

### Task 3: Zombies backdrop (map, fog, embers)

**Files:** create `src/shell/ZombiesBackdrop.jsx`; `src/shell/AmbientBackground.jsx` (mount the backdrop when pack is zombies, or render it beside the canvas from wherever AmbientBackground is mounted — say which); `src/shell/ambient.js` (only if helpers are shared); CSS under `/* ── Zombies backdrop ── */`.

- Original Origins-style dig-site map as inline SVG line art (trenches, excavation squares, a central dig circle, dashed paths, grid ticks), stroke `--sh-accent-2` at low opacity, `preserveAspectRatio="xMidYMid slice"`, behind everything, never over content, `pointer-events: none`, `aria-hidden`.
- Fog: 2–3 large soft radial layers drifting slowly (CSS animation). Embers: a few dozen small rising particles on a canvas (amber/red from tokens), sparse and slow. Both static under reduced motion. Keep CPU low (pause when the window is hidden).
- Verify: screenshots of Home, a course, Calendar in Zombies; Nova pack unchanged.

### Task 4: Zombies voice

**Files:** create `src/companion/packs/zombiesLines.js` (+ test); `src/companion/character.js` (line lookup merges the active pack's pools over Nova's); `src/companion/memory/lines.js` (same for memory lines, only if pools there are user-facing on Home); `src/features/today/*` greeting copy only if Home's one-liner comes from there (find where "Late one, Jack…" style home lines are produced).

- Override ~25–40 keys that users see most: home greeting/briefing, quiz start/correct/wrong/shields down/results, flashcard session start/end, nudges, round complete, idle quips. Voice: short, dry, survival-horror homage ("One down. Reload.", "They're getting faster. So are you.", "Round 4. Don't get greedy."). Same `{facts}` placeholders as the Nova lines they replace; numbers stay from code. Respect the profanity levels (`clean` default).
- Missing keys fall back to Nova's lines. Recent-line history keeps working.
- Test: with pack zombies, `line("quizStart")` returns a Zombies line; with nova, the original; every override key exists in Nova's pools; placeholders in each override are a subset of the original key's placeholders.

### Task 5: Power-ups and round tally

**Files:** create `src/session/powerups.js` + `powerups.test.js`, `src/session/PowerUpDrop.jsx`, `src/shell/RoundTally.jsx`; `src/session/SessionResults.jsx` (Zombies: power-ups replace the medals row; MAX AMMO when `closedRound`); `src/shell/AppRail.jsx` (small tally near Settings, hidden when the rail is collapsed per spec §2.1); `src/features/today/HomeScreen.jsx` (top strip "ROUND n" + small marks; Zombies adds the big skewed corner tally top-right); CSS under `/* ── Power-ups and tally ── */`.

- `powerups.js`: `earnedPowerUps({ answered, correct, best, wentDown, closedRound })` per decision 6 → `[{ id, label, short }]` (short = the 3–4 char glyph text, e.g. "MAX", "2X", "KILL", "FIX", "NUKE"). Tests for each rule, ordering, cap of 3, MEDAL_MIN gate (MAX AMMO ignores the gate).
- `PowerUpDrop`: square icon with `--sh-power` border + glow, Michroma label, bounce-in then gentle hop (static under reduced motion). On results it sits where medals sit.
- `RoundTally`: reads `loadRounds()`, listens to `studyhub-rounds-changed`, renders marks in the current round (skewed bars, 5 per round) + "ROUND n"; `variant="rail" | "strip" | "corner"`. Corner variant only in the Zombies pack.
- Verify: results screenshots in both packs (force a round close in-page by seeding `session.rounds` is not possible in browser — instead run 5 quick sessions or render with a fixture; say which), Home with tally in both packs, rail expanded with tally.

### Task 6: Tours, spec, verification (after 2–5 committed)

- Tour steps in `.superpowers/ui-review/tour.py`: `zombies-home`, `zombies-course`, `zombies-session`, `zombies-results`, `zombies-calendar`, `zombies-settings`, `nova-home-tally`. Full tour + Nova smoke pass in the Nova pack.
- Spec §5: record decisions 1–7 (real power-up names with the user's accepted risk, Nova wear, tally for both packs). §6: tally shipped in rail + home strip.
- Palette command: "Switch pack" toggles nova/zombies.
- Commit `Phase 2.27 — Zombies tours and verification`.
