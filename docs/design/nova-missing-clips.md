# Nova: missing animations

Desktop Nova uses sprite sheets baked from the 3D runtime (`scripts/bake-nova-sprites.mjs`).
Poses without a Mixamo clip use a stand-in, mapped in `public/personas/nova/pack.json`
(`states`). To replace one: add the FBX to `art/nova/anims/`, run
`node scripts/bake-nova-clips.mjs`, add it to `BAKES` in `src/companion/nova3d/bake.js`,
run `npx electron scripts/bake-nova-sprites.mjs`, then point the state at the new clip.

| Pose | Used for | Stand-in now | Suggested Mixamo clip |
|------|----------|--------------|-----------------------|
| climb | Reaching a window top (D4) | Hologram flicker-teleport | Climbing Up Wall / Climbing Ladder |
| point | Pointing at a window or item | `point` (procedural) | Pointing / Pointing Forward |
| tap glass | Due in 30 min, distraction tap (D2, D3) | `talk` + 2D ripple | Knocking / Tapping |
| dust off | After a fall (D4) | `look` | Brushing off / Dusting Off |
| hold envelope | New grade (D2) | `idle` + 2D envelope prop | Holding Object / Carrying |
| hold sign | Announcement (D2) | `idle` + 2D sign prop | Holding Sign / Presenting |
| foot tap | Focus-mode distraction (D3) | `bored` | Impatient Foot Tap |
| celebrate | Good grade, finished session | `taunt` | Victory / Cheering / Happy Hand Gesture |
| run | Arriving with news (D2) | `walk`, faster | Running / Jog Forward |
| pick up / land hard | Dragged and dropped | `held` (procedural), `land` | Falling Idle, Hard Landing |
| stretch | Breaks (D3) | `stretch` (procedural) | Standing Stretch |
| doodle / read / card tricks | Desktop idle life (D6) | Not baked yet (needs 3D props) | Writing, Reading, Card shuffle |
| walk left | Walking left | `walk` mirrored in CSS | None needed |

Voice (D7) attaches audio by line id from `public/personas/nova/lines.json`, not by animation.
