# B1b — Nova context staging (C.7) — design

**Date:** 2026-10-08 · **Build path step:** B1 (B1a shipped as Phase 2.30; this is B1b)
**Goal:** Nova's bubble sits by her head, she stands on tour targets, and she leans on panel sides.

## Decisions (user-approved 2026-10-08)

- In scope: head-anchored bubble, standing on tour targets, held lean on panel sides.
- Dropped: standing on the quiz/session panel (sessions have their own Nova lane since the UI overhaul).
- Lean has two triggers: an idle activity and a resting pose at her saved spot.
- Tour targets: stand on top only when it fits, otherwise stand beside as today.
- Not while housed: no lean inside the Today home window.

## 1. Head-anchored bubble

3D body only. The portrait sprite keeps today's box anchoring.

- `NovaStage` projects the `head` bone to canvas pixels after each render, adds the seat drop
  (`SEAT_FRAC * seatW` of the frame) and the lying mirror flip, and writes `--nv-head-x` /
  `--nv-head-y` (px, relative to the `.sc-scout` box) through a callback set by `Nova3D`.
  Writes only when either value moves ≥ 2px. No React state per frame.
- Pure helper `headAnchor({ ndcX, ndcY, frameW, frameH, boxSize, seatShift, flipped })` →
  `{ x, y }` in `src/companion/nova3d/headAnchor.js`, with a vitest.
- `.sc-bubble--above` / `--below` and the `--left` / `--right` offsets read the vars, with
  fallbacks equal to today's box edges (sprite, model loading, failed load).
- `SpeechBubble`'s viewport clamp stays as is (runs on content change). The bubble may track
  her head while open; the 2px threshold keeps it from jittering.

## 2. Standing on tour targets

- `standOnTarget(rect, size)` in `safeZones.js`: returns `{ x, y, plat }` when the target is at
  least `MIN_PLATFORM_W` (120px) wide, the `size`-tall box above it is inside the viewport, and
  that box is clear of other content (same check as `pointBeside`, target excluded). Else null.
- `useNovaTour.goStep` tries it first, falls back to `pointBeside`. On success, `platRef` is set
  to `{ el, top, left, right }` of the target so the existing live-platform tracking keeps her
  on it through scroll and reflow.
- On the target she points down at it (`pointAt(rect)`); bubble `h` is the side with more room,
  `v` is `above` unless she is within one bubble height of the top.
- Sprite mode (no platforms) keeps `pointBeside`.

## 3. Leaning on panel sides

**Pose.** `NovaStage` state gains `lean: "left" | "right" | null` (the side the wall is on).
A held procedural pose like the seat poses: spine/chest tilt toward the wall, head tilt away,
arms crossed, a small root x-shift so her shoulder meets the edge. Eased by `leanW` (same rate
as `seatW`). Under reduced motion the pose holds with no breathing sway. `Nova3D` passes the
prop through.

**Spot.** `findLeanSpot(pos, size, current, { maxDist })` in `safeZones.js`, built on the
`findPeekSpot` logic: a panel edge covering most of her height on her current platform. She
stands just outside the edge (shoulder on it), facing away. Returns `{ x, y, el, side }` or null.
Peek and lean share a private helper for the edge search instead of duplicating it.

**Idle trigger.** New `lean` stage in `useNovaIdleLife`, alongside `peek` (same pick weight as
peek): walk to the spot, set `lean`, hold 20–40s, clear, walk back.

**Resting trigger.** When she is idle at her saved spot, not housed, on a platform, and
`findLeanSpot(..., { maxDist: size / 3 })` finds an edge, she shifts the few px and leans until
she next moves.

**Cancel.** Any input that moves her, a drag, a mode change, or a new activity clears `lean`.
A bubble does not; she keeps leaning and her head turns to talk.

## Out of scope

Standing on the quiz/session panel, leaning while housed, new baked clips (the pose is
procedural), lean in sprite mode.

## Testing

- vitest: `headAnchor` (standing, seated, flipped), `standOnTarget` (fits, too narrow, blocked,
  off-screen), `findLeanSpot` (edge found, panel too short, too far) with mocked rects.
- `npx vitest run`, `npm run build`.
- `webapp-testing` screenshots against the Vite dev server: a tour step standing on a target,
  a bubble while seated, an idle lean.
