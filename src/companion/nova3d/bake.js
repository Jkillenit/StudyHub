/**
 * Dev-only page driven by scripts/bake-nova-sprites.mjs. Steps NovaStage on a fixed clock and
 * packs each pose into a transparent sprite sheet. Not part of the app build.
 */
import "../../studyhub-bootstrap.css";
import clipData from "./clips.json";
import { NovaStage } from "./NovaStage.js";

const FPS = 15;
const FRAME = 240;
const SUPERSAMPLE = 2;
const MAX_COLS = 12;
const WARMUP_S = 2.5;
const MAX_GESTURE_S = 6;
const WALK_SPEED = 90;
/** Must match NovaStage's SEAT_FRAC: seated frames put the hips this far above the floor line. */
const SEAT_FRAC = 0.27;
/** Must match NovaStage's FRAME_SCALE: frame height as a multiple of her body height. */
const FRAME_SCALE = 1.14;

const dur = (name) => clipData.clips[name]?.duration || 2;

/** Loops hold a stage state; gestures play once from idle. Names are the persona pack's clip ids. */
const BAKES = [
  { name: "idle", loop: true, seconds: dur("idle") },
  { name: "walk", loop: true, setup: { gait: "walk", facing: 1, speed: WALK_SPEED }, seconds: dur("walk") },
  { name: "talk", loop: true, setup: { talkUntil: 1e15 }, seconds: dur("talk") },
  { name: "sit", loop: true, setup: { seat: "playful", still: true }, seconds: 2 },
  { name: "legSwing", loop: true, setup: { seat: "playful" }, seconds: 3 },
  { name: "sitCold", loop: true, setup: { seat: "cold", facing: 1 }, seconds: 2 },
  { name: "doze", loop: true, setup: { asleep: true }, seconds: 4 },
  { name: "lieSide", loop: true, setup: { lie: "side", asleep: true }, seconds: 4 },
  { name: "lieBelly", loop: true, setup: { lie: "belly" }, seconds: 3 },
  { name: "fall", loop: true, setup: { gait: "fall" }, seconds: dur("fall") },
  { name: "held", loop: true, setup: { held: true }, seconds: 2 },
  ...["wave", "yawn", "kiss", "taunt", "look", "bored", "land", "lean"].map((name) => ({ name, gesture: name })),
  ...["stretch", "facepalm", "wink", "startle"].map((name) => ({ name, gesture: name })),
  { name: "point", gesture: "point", at: { x: 140, y: -40 } },
];

const RESET = { gait: null, facing: 1, talkUntil: 0, seat: null, still: false, asleep: false, lie: null, held: false, speed: WALK_SPEED };

async function bake() {
  const canvas = document.createElement("canvas");
  const stage = new NovaStage(canvas);
  await stage.load();
  stage.stop();
  stage.clock.getDelta = () => 1 / FPS;
  stage.setSize(FRAME);
  stage.renderer.setPixelRatio(SUPERSAMPLE);
  stage.renderer.setSize(FRAME, FRAME, false);

  const step = (seconds) => {
    for (let i = 0; i < Math.round(seconds * FPS); i += 1) stage.tick();
  };

  const out = { fps: FPS, frameW: FRAME, frameH: FRAME, anchor: { x: 0.5, y: 0.99 }, frameScale: FRAME_SCALE, walkSpeed: WALK_SPEED, clips: {}, sheets: {} };
  for (const spec of BAKES) {
    stage.cancelGesture();
    stage.set({ ...RESET, ...(spec.setup || {}) });
    step(WARMUP_S);
    const frames = [];
    const grab = () => {
      stage.tick();
      const f = document.createElement("canvas");
      f.width = FRAME;
      f.height = FRAME;
      f.getContext("2d").drawImage(canvas, 0, 0, FRAME, FRAME);
      frames.push(f);
    };
    if (spec.gesture) {
      let done = false;
      stage.play(spec.gesture, { at: spec.at || null }).then(() => {
        done = true;
      });
      while (!done && frames.length < MAX_GESTURE_S * FPS) {
        grab();
        await Promise.resolve();
      }
    } else {
      const n = Math.max(1, Math.round(spec.seconds * FPS));
      for (let i = 0; i < n; i += 1) grab();
    }
    const cols = Math.min(MAX_COLS, frames.length);
    const rows = Math.ceil(frames.length / cols);
    const sheet = document.createElement("canvas");
    sheet.width = cols * FRAME;
    sheet.height = rows * FRAME;
    const ctx = sheet.getContext("2d");
    frames.forEach((f, i) => ctx.drawImage(f, (i % cols) * FRAME, Math.floor(i / cols) * FRAME));
    const seated = !!(spec.setup?.seat || spec.setup?.asleep) && !spec.setup?.lie;
    out.clips[spec.name] = {
      file: `${spec.name}.png`,
      frames: frames.length,
      cols,
      loop: !!spec.loop,
      anchorY: seated ? +(out.anchor.y - SEAT_FRAC).toFixed(3) : out.anchor.y,
    };
    out.sheets[spec.name] = sheet.toDataURL("image/png");
  }
  stage.dispose();
  return out;
}

window.bake = bake;
window.bakeReady = true;
