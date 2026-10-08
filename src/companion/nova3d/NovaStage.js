import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import clipData from "./clips.json";
import modelUrl from "./nova.vrm?url";
import { createLegSwing, stepLegSwing } from "./legSwing.js";
import { headAnchor } from "./headAnchor.js";
import { resolveAt } from "./resolve.js";

const FRAME_MS = 1000 / 30;
/** While the window is in the background she keeps breathing, barely: about 6 frames a second. */
const BLUR_FRAME_MS = 1000 / 6;
/** Gaze: the eyes catch the cursor fast and drift back to neutral slowly (rates per second). */
const GAZE_CATCH = 12;
const GAZE_RELEASE = 1.6;
/** The eyes cover this much on their own before the head starts to turn (radians, ~8°). */
const EYE_RANGE = 0.14;
/** Head spring: lower is lazier. It trails the eyes by roughly 1/HEAD_OMEGA seconds. */
const HEAD_OMEGA = 7;
const HEAD_YAW_MAX = 0.45;
const HEAD_PITCH_MAX = 0.3;
/** Frame height as a multiple of the model's height; the headroom fits raised arms. */
const FRAME_SCALE = 1.14;
const FADE = 0.35;
/** Getting down onto the floor and back up takes longer than a normal blend. */
const LIE_FADE = 0.9;
/** Render above screen resolution so fine detail (hair, circuit lines) stays crisp; the canvas is small. */
const SUPERSAMPLE = 1.5;
const SUPERSAMPLE_MAX = 3;
/** Clips that loop as a base layer; everything else plays once and returns to the base. */
const LOOPING = new Set(["idle", "walk", "talk", "sit", "fall", "lieProp", "lieBack", "lieBelly", "lieSide"]);
/** Lying poses (single-frame clips, body along the x axis, head toward screen left). */
const LIE_CLIPS = { prop: "lieProp", back: "lieBack", belly: "lieBelly", side: "lieSide" };
const LIE_EXTENT_BONES = ["head", "hips", "leftHand", "rightHand", "leftFoot", "rightFoot", "leftToes", "rightToes"];
/** Bases that keep her hands clasped behind her back. */
const ARMS_BACK_BASES = new Set(["idle", "walk"]);
/** `rest` keys for the left and right chains of each limb pair. */
const ARM_CHAINS = ["left", "right"];
const LEG_CHAINS = ["leftLeg", "rightLeg"];
/** The cursor only draws her eyes when it's this close (CSS px from her center) and recently moved. */
const GLANCE_RADIUS = 420;
const GLANCE_MS = 3500;

const MOOD_FACE = {
  neutral: {},
  happy: { happy: 0.55 },
  excited: { happy: 0.9 },
  sad: { sad: 0.7 },
  stern: { angry: 0.55 },
  confused: { surprised: 0.35 },
  thinking: { relaxed: 0.25 },
  point: { happy: 0.25 },
  sleep: { relaxed: 0.4 },
};
const HELD_FACE = { angry: 0.45, surprised: 0.3, oh: 0.35 };
const FACE_KEYS = ["happy", "angry", "sad", "relaxed", "surprised"];
const MOUTH_KEYS = ["aa", "ih", "ou", "ee", "oh"];

/**
 * World-space directions (model facing +Z, her left = +X) for hands clasped behind the back,
 * applied relative to the chest so they follow the torso. Right side mirrors the left.
 */
const ARMS_BACK = {
  upper: new THREE.Vector3(0.16, -0.9, -0.36).normalize(),
  lower: new THREE.Vector3(-0.7, -0.68, 0.05).normalize(),
  hand: new THREE.Vector3(-0.4, -0.9, 0.1).normalize(),
};
const mirror = (v) => new THREE.Vector3(-v.x, v.y, v.z);
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
/** `dir` into an existing vector, for poses rebuilt every frame. */
const setDir = (out, x, y, z) => out.set(x, y, z).normalize();
const bothArms = (upper, lower, hand) => ({ left: [upper, lower, hand], right: [mirror(upper), mirror(lower), mirror(hand)] });
const vec3s = (n) => Array.from({ length: n }, () => new THREE.Vector3());
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
/** 0 → 1 → 0 over [a, b] with `ramp`-second edges. */
const bump = (t, a, b, ramp = 0.4) => smooth(a, a + ramp, t) * (1 - smooth(b - ramp, b, t));

/*
 * Per-frame scratch, one set per function so no call can clobber a caller's values.
 * Poses returned from the per-frame pose builders below are module-owned and only valid
 * until the next call of the same builder; applyLimbs reads them without keeping them.
 */
const _point = { reach: [], d: new THREE.Vector3(), lift: new THREE.Vector3() };
_point.reach.push(_point.d, _point.d, _point.lift);
const _held = { arms: { left: vec3s(3), right: vec3s(3) }, legs: { left: vec3s(3), right: vec3s(3) } };
const _seatLegs = { left: vec3s(3), right: vec3s(3) };
/** Pull arm: [upper, lower, lower]; the hand follows the forearm. */
const pullArm = () => {
  const [upper, lower] = vec3s(2);
  return [upper, lower, lower];
};
const _pull = { reach: new THREE.Vector3(), drawn: new THREE.Vector3(), out: { left: pullArm(), right: pullArm() } };
const _bend = { e: new THREE.Euler(), q: new THREE.Quaternion() };
const _limbs = {
  delta: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
  want: new THREE.Quaternion(),
  local: new THREE.Quaternion(),
  target: new THREE.Vector3(),
  restDir: new THREE.Vector3(),
};
const _head = { pos: new THREE.Vector3(), want: new THREE.Vector3(), e: new THREE.Euler(), q: new THREE.Quaternion() };
const _props = { head: new THREE.Vector3(), lh: new THREE.Vector3(), rh: new THREE.Vector3() };
const _seatHips = new THREE.Vector3();
const _headPx = new THREE.Vector3();
const _lieP = new THREE.Vector3();
const _sample = new THREE.Vector3();

const ARMS_BACK_LEFT = [ARMS_BACK.upper, ARMS_BACK.lower, ARMS_BACK.hand];
const ARMS_BACK_RIGHT = [mirror(ARMS_BACK.upper), mirror(ARMS_BACK.lower), mirror(ARMS_BACK.hand)];
const STRETCH_ARMS = bothArms(dir(0.28, 0.95, 0.08), dir(-0.5, 0.86, 0.05), dir(-0.7, 0.7, 0.05));
const FACEPALM_ARMS = {
  left: ARMS_BACK_LEFT,
  right: [dir(-0.3, -0.3, 0.9), dir(0.55, 0.82, 0.15), dir(0.45, 0.8, -0.35)],
};
const STARTLE_ARMS = bothArms(dir(0.6, -0.55, 0.45), dir(0.4, -0.05, 0.9), dir(0.3, 0.25, 0.9));
const POINT_DEFAULT_AT = { x: 1, y: 0 };
const POINT_RIGHT = { left: _point.reach, right: ARMS_BACK_RIGHT };
const POINT_LEFT = { left: ARMS_BACK_LEFT, right: _point.reach };

/**
 * Gestures with no Mixamo clip: an arm pose (same world-direction scheme as ARMS_BACK),
 * additive body bends in radians (VRM 1.0 axes: +x bends forward, +z tilts to her left)
 * and a face overlay, all driven by time `t` in seconds.
 */
const PROC = {
  stretch: {
    duration: 3.4,
    arms: () => STRETCH_ARMS,
    body: (t) => {
      const sway = Math.sin(smooth(0.8, 2.8, t) * Math.PI * 2) * 0.16;
      return { spine: [-0.06, 0, sway * 0.5], chest: [-0.1, 0, sway], head: [-0.12, 0, sway * 0.6] };
    },
    face: (t) => ({ blink: 0.85 * bump(t, 0.5, 3.0), aa: 0.3 * bump(t, 0.9, 2.6) }),
  },
  /** Point at `at` (screen px from her chest, y down); the free hand stays behind her back. */
  point: {
    duration: 2.8,
    arms: (t, p) => {
      const at = p.at || POINT_DEFAULT_AT;
      const d = setDir(_point.d, at.x, -at.y, Math.hypot(at.x, at.y) * 0.35);
      setDir(_point.lift, d.x, d.y + 0.12, d.z);
      return at.x >= 0 ? POINT_RIGHT : POINT_LEFT;
    },
    body: (t, p) => {
      const side = (p.at?.x ?? 1) >= 0 ? 1 : -1;
      return { chest: [0, side * 0.12, side * 0.05], head: [0.04, side * 0.2, 0] };
    },
    face: () => ({ happy: 0.3 }),
  },
  /** Right hand to her forehead, head down, a slow disappointed shake. */
  facepalm: {
    duration: 2.6,
    arms: () => FACEPALM_ARMS,
    body: (t) => {
      const shake = Math.sin(smooth(0.6, 2.2, t) * Math.PI * 4) * 0.12;
      return { spine: [0.06, 0, 0], neck: [0.2, shake * 0.5, 0], head: [0.28, shake, 0] };
    },
    face: (t) => ({ blink: 0.9 * bump(t, 0.3, 2.3), angry: 0.35, sad: 0.3 }),
  },
  wink: {
    duration: 1.2,
    body: (t) => ({ head: [0, 0, 0.14 * bump(t, 0.1, 1.1, 0.25)] }),
    face: (t) => {
      const w = bump(t, 0.05, 1.15, 0.2);
      return { calm: w, blinkLeft: bump(t, 0.2, 0.9, 0.15), ih: 0.3 * w };
    },
  },
  /** A yawn she can do sitting down: head back, mouth wide, no arms. */
  sitYawn: {
    duration: 3.2,
    body: (t) => {
      const b = bump(t, 0.4, 2.8, 0.7);
      return { chest: [-0.12 * b, 0, 0], neck: [-0.15 * b, 0, 0], head: [-0.25 * b, 0, 0.08 * b] };
    },
    face: (t) => ({ aa: 0.95 * bump(t, 0.6, 2.6, 0.5), blink: 0.8 * bump(t, 0.7, 2.5, 0.4) }),
  },
  /** Woken with a jolt: arms flare, head snaps back, eyes wide. Fast in, slower out. */
  startle: {
    duration: 1.3,
    ramp: [0.1, 0.7],
    arms: () => STARTLE_ARMS,
    body: (t) => {
      const j = bump(t, 0, 1.1, 0.12);
      return { spine: [-0.08 * j, 0, 0], chest: [-0.1 * j, 0, 0], head: [-0.16 * j, 0, 0.05 * j] };
    },
    face: (t) => ({ surprised: 0.85 * bump(t, 0, 1.2, 0.1), oh: 0.5 * bump(t, 0.05, 0.9, 0.1) }),
  },
};

/** Holding a deck in front of her chest, forearms forward, hands close together. */
const CARDS_ARMS = bothArms(dir(0.2, -0.85, 0.35), dir(-0.45, 0.2, 0.87), dir(-0.35, 0.3, 0.88));

/**
 * Held by the cursor: legs hang and kick, arms flail out, alternating sides. Same
 * world-direction scheme; legs are [upperLeg, lowerLeg, foot].
 */
const HELD = {
  arms: (t) => {
    const w = Math.sin(t * 7);
    const { left, right } = _held.arms;
    setDir(left[0], 0.9, 0.2 + 0.25 * w, 0.2);
    setDir(left[1], 0.6, 0.65 + 0.2 * w, 0.35);
    setDir(left[2], 0.4, 0.85, 0.3);
    setDir(right[0], -0.9, 0.2 - 0.25 * w, 0.2);
    setDir(right[1], -0.6, 0.65 - 0.2 * w, 0.35);
    setDir(right[2], -0.4, 0.85, 0.3);
    return _held.arms;
  },
  legs: (t) => {
    const k = Math.sin(t * 8);
    const { left, right } = _held.legs;
    setDir(left[0], 0.1 + 0.1 * k, -1, 0.12 + 0.2 * k);
    setDir(left[1], 0.02 - 0.2 * k, -1, -0.1 - 0.45 * k);
    setDir(left[2], 0, -0.75, 0.66);
    setDir(right[0], -0.1 + 0.1 * k, -1, 0.12 - 0.2 * k);
    setDir(right[1], -0.02 - 0.2 * k, -1, -0.1 + 0.45 * k);
    setDir(right[2], 0, -0.75, 0.66);
    return _held.legs;
  },
};

/** Sitting on a platform edge with the hips on the line; the canvas drops by this much of the frame so the legs hang below it. */
const SEAT_FRAC = 0.27;
/** Playful seat: thighs forward over the edge, hands planted beside the hips. The legs come from legSwing. */
const SEAT_PLAYFUL = {
  arms: bothArms(dir(0.32, -0.92, -0.2), dir(0.08, -1, 0.12), dir(0, -0.85, 0.5)),
};
/**
 * Leaning on a panel side: arms crossed, torso tilted into the wall, head tipped back the other way.
 * LEAN_TILT is the spine roll toward the wall for `lean: "right"`; "left" mirrors it.
 */
const LEAN_TILT = -0.12;
const LEAN_ARMS = bothArms(dir(0.25, -0.8, 0.45), dir(-0.85, 0.35, 0.45), dir(-0.9, 0.3, 0.3));

/** Tip the direction (x, y, z) forward (toward +z, the way she faces) by `a` radians around the x axis, into `out`. */
function forward(out, x, y, z, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return out.set(x, y * c + z * s, -y * s + z * c).normalize();
}

/** Seated leg directions from legSwing angles, written into `out`. `sign` is +1 for her left leg, -1 for her right. */
function seatLeg(j, cross, sign, out) {
  const thigh = out[0];
  const shin = out[1];
  const foot = out[2];
  forward(thigh, 0.1 * sign, -0.2, 1, j.hip * 0.5);
  forward(shin, 0.02 * sign, -1, 0.2, j.hip + j.knee);
  shin.x -= sign * 0.3 * cross;
  shin.z += (sign > 0 ? 0.12 : 0) * cross;
  forward(foot, 0, -0.55, 0.85, j.hip + j.knee + j.ankle);
  foot.x -= sign * 0.25 * cross;
  thigh.normalize();
  shin.normalize();
  foot.normalize();
  return out;
}

/** Face overlays for clip gestures, keyed by clip name; `t` is the clip time. */
const CLIP_FACE = {
  yawn: (t) => ({ aa: 0.95 * bump(t, 1.1, 4.6, 0.6), blink: 0.8 * bump(t, 1.3, 4.4, 0.5) }),
  bored: (t) => ({ relaxed: 0.5 * bump(t, 0.5, 9.5) }),
};

const VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform float uTime;
uniform float uGlitch;
uniform float uHeight;
uniform float uRestH;
uniform float uZombie;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec3 vRest;
varying vec3 vRestN;
void main() {
  vUv = uv;
  vRest = position / uRestH;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  vRestN = objectNormal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vH = wp.y / uHeight;
  float slice = floor(vH * 22.0) + floor(uTime * 14.0);
  float hit = step(0.78, fract(sin(slice * 12.9898) * 43758.5453));
  mvPosition.x += uGlitch * hit * (fract(sin(slice * 78.233) * 9631.17) - 0.5) * uHeight * mix(0.04, 0.09, uZombie);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uHasMap;
uniform float uCut;
uniform float uDepthOnly;
uniform float uTime;
uniform float uGlow;
uniform float uFade;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uZombie;
uniform float uFlicker;
uniform vec3 uEyeColor;
uniform float uEye;
uniform float uWear;
uniform float uResolve;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec3 vRest;
varying vec3 vRestN;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
/* Circuit traces on a grid: random horizontal runs 3 cells long and vertical runs 4 long, with a pad where they cross. Fades out before it aliases. */
float circuit(vec2 p) {
  vec2 c = floor(p);
  vec2 f = fract(p) - 0.5;
  float aa = max(fwidth(p.x) + fwidth(p.y), 1e-4);
  float w = 0.05 + aa * 0.5;
  float hOn = step(0.62, hash3(vec3(floor(c.x / 3.0), c.y, 3.0)));
  float vOn = step(0.72, hash3(vec3(c.x, floor(c.y / 4.0), 5.0)));
  float hl = (1.0 - smoothstep(w - aa, w, abs(f.y))) * hOn;
  float vl = (1.0 - smoothstep(w - aa, w, abs(f.x))) * vOn;
  float r = length(f);
  float pad = (1.0 - smoothstep(0.2 - aa, 0.2, r)) * smoothstep(0.1 - aa, 0.1, r) * hOn * vOn;
  return max(max(hl, vl), pad) * (1.0 - smoothstep(0.3, 0.6, aa));
}
void main() {
  vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  if (tex.a < uCut) discard;
  /* Gathering out of the particle field: noise weighted by rest height, so she resolves feet first with a bright edge. */
  float rd = mix(vnoise(vRest * 18.0), clamp(vRest.y, 0.0, 1.0), 0.6);
  float rcut = uResolve * 1.12 - 0.06;
  if (rd > rcut) discard;
  float redge = 1.0 - smoothstep(0.0, 0.06, rcut - rd);
  /* Zombies pack wear, in rest-pose space (height 1, T-pose arms along x) so it sticks to her as she moves. */
  float burn = 0.0;
  float bare = 0.0;
  if (uZombie > 0.5 && uWear > 0.5) {
    vec3 r = vRest;
    float w = 0.0;
    if (uWear < 1.5) {
      /* Suit torn off raggedly at mid-shin and mid-forearm; the limb below shows through faded. */
      float jag = vnoise(vec3(r.x * 55.0, r.y * 9.0, r.z * 55.0)) * 0.05;
      float hem = max(0.17 + jag - r.y, abs(r.x) - 0.33 + jag);
      bare = step(0.0, hem);
      burn = smoothstep(0.012, 0.0, abs(hem));
      if (r.y < 0.78 || abs(r.x) > 0.13) w = 0.36 + 0.14 * bare;
    } else {
      w = 0.8 * smoothstep(0.885, 0.84, r.y);
    }
    float n = vnoise(r * 16.0) * 0.65 + vnoise(r * 70.0) * 0.35;
    float cut = w * 0.6;
    if (n < cut) discard;
    if (w > 0.0) burn = max(burn, smoothstep(cut + 0.08, cut, n));
  }
  if (uDepthOnly > 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  float fres = pow(1.0 - clamp(abs(normalize(vN).z), 0.0, 1.0), 2.0);
  float scan = 0.8 + 0.2 * step(0.5, fract(gl_FragCoord.y * 0.33));
  float band = smoothstep(0.045, 0.0, abs(vH - (fract(uTime * 0.21) * 1.4 - 0.2)));
  float flick = 0.93 + 0.07 * step(0.12, fract(sin(floor(uTime * 9.0) * 91.7) * 311.3));
  vec3 col = uColor * (0.3 + 1.1 * lum) + uHot * fres * (0.45 + 0.2 * uGlow) + uHot * band * 0.3;
  float a = clamp((0.6 + 0.3 * lum + fres * 0.55 + band * 0.2) * scan * flick * uFade, 0.0, 1.0);
  a *= min(1.0, tex.a * 1.5);
  if (uZombie > 0.5) {
    if (uEye > 0.5) {
      col = uEyeColor * (uEye > 1.5 ? 0.9 : 1.3 + 0.8 * lum);
      a = clamp(tex.a * 1.5, 0.0, 1.0) * uFade;
    } else {
      float grime = smoothstep(0.4, 0.75, vnoise(vRest * 7.0 + 3.1));
      float streak = smoothstep(0.5, 0.85, vnoise(vec3(vRest.x * 34.0, vRest.y * 3.0, vRest.z * 34.0)));
      col *= 1.0 - (0.6 * grime + 0.4 * streak) * (uWear > 0.5 ? 1.0 : 0.45);
      col *= 1.0 - 0.45 * bare;
      a *= 1.0 - 0.55 * bare;
      col = mix(col, uEyeColor * 1.3, burn * 0.85);
      a = max(a, burn * 0.9 * uFade);
    }
    col *= uFlicker;
    a *= mix(1.0, uFlicker, 0.6);
  } else {
    /* Lit in view space by a soft key (upper left) and fill (right); wrap terms keep the shadows open like light through skin. */
    vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    float ndv = clamp(N.z, 0.0, 1.0);
    vec3 keyL = normalize(vec3(-0.45, 0.55, 0.7));
    vec3 fillL = normalize(vec3(0.6, -0.1, 0.8));
    float key = clamp((dot(N, keyL) + 0.5) / 1.5, 0.0, 1.0);
    float fill = clamp((dot(N, fillL) + 0.3) / 1.3, 0.0, 1.0);
    float sss = smoothstep(-0.6, 1.0, dot(N, keyL));
    float fres = pow(1.0 - ndv, 2.0);
    float rim = pow(1.0 - ndv, 4.5);
    float spec = pow(clamp(dot(N, normalize(keyL + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 64.0);
    vec3 an = abs(normalize(vRestN));
    vec2 cp = an.z > max(an.x, an.y) ? vRest.xy : an.x > an.y ? vRest.zy : vRest.xz;
    float hair = step(1.5, uWear);
    float skin = (1.0 - hair) * (uEye > 0.5 ? 0.0 : 1.0);
    float trace = circuit(cp * 110.0) * skin * smoothstep(0.35, 0.65, vnoise(vRest * 9.0));
    float detail = mix(0.25, 1.0, lum) * mix(1.0, 0.4, hair);
    col = uColor * (0.03 + 0.85 * key * key * detail + 0.1 * fill * detail);
    col += uColor * sss * 0.25 * (1.0 - rim);
    col = mix(col, uHot, pow(key, 8.0) * detail * 0.35);
    col += mix(uColor, uHot, 0.6) * rim * (1.1 + 0.3 * uGlow);
    col += uHot * spec * mix(0.45, 0.4, hair) * detail;
    col += mix(uColor, uHot, 0.5) * trace * 0.32;
    col += uHot * band * 0.08;
    if (uEye > 0.5) col = uColor * (0.05 + lum * lum * (uEye > 1.5 ? 0.7 : 1.5));
    float nscan = 0.96 + 0.04 * step(0.5, fract(gl_FragCoord.y * 0.33));
    float nflick = 0.98 + 0.02 * step(0.12, fract(sin(floor(uTime * 9.0) * 91.7) * 311.3));
    /* See-through facing the camera, solid at grazing angles. */
    a = clamp((0.5 + 0.12 * lum + 0.6 * fres + 0.2 * trace + 0.3 * spec) * nscan * nflick * uFade, 0.0, 1.0);
    a *= min(1.0, tex.a * 1.5);
    /* The whites can sort after the iris; keep them faint so the iris reads through. */
    if (uEye > 1.5) a *= 0.3;
    else if (uEye > 0.5) a = min(1.0, tex.a * 1.5) * 0.9 * uFade;
  }
  col = mix(col, (uZombie > 0.5 ? uEyeColor : uHot) * 1.6, redge);
  a = max(a, redge * uFade);
  gl_FragColor = vec4(col * a, a);
}
`;

function cssColor(name, fallbackName) {
  const s = getComputedStyle(document.documentElement);
  const raw = s.getPropertyValue(name).trim() || s.getPropertyValue(fallbackName).trim();
  const c = new THREE.Color();
  try {
    c.setStyle(raw);
  } catch {
    c.setRGB(0.4, 0.9, 1);
  }
  return c;
}

function decode(b64, range = 1) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer);
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i += 1) out[i] = (ints[i] / 32767) * range;
  return out;
}

function buildClip(name, data, vrm, hipsHeight) {
  const v0 = vrm.meta?.metaVersion === "0";
  const times = Float32Array.from({ length: data.frames }, (_, i) => i / clipData.fps);
  const tracks = [];
  for (const [bone, b64] of Object.entries(data.bones)) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);
    if (!node) continue;
    const vals = decode(b64);
    if (v0) for (let i = 0; i < vals.length; i += 2) vals[i] = -vals[i];
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, vals.length === 4 ? [0] : times, vals));
  }
  const hips = vrm.humanoid.getNormalizedBoneNode("hips");
  if (data.hips && hips) {
    const vals = decode(data.hips, clipData.hipsRange);
    for (let i = 0; i < vals.length; i += 1) vals[i] *= (v0 && i % 3 !== 1 ? -1 : 1) * hipsHeight;
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, vals));
  }
  return new THREE.AnimationClip(name, data.duration, tracks);
}

let webglOk = null;

export function webglAvailable() {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webglOk = !!gl;
  } catch {
    webglOk = false;
  }
  return webglOk;
}

/**
 * Nova's 3D body: a VRM model with a hologram shader, Mixamo clips as the base motion and
 * procedural layers on top (arms behind the back, turning, cursor tracking, blinking,
 * expressions, talking). Plain three.js; the React wrapper feeds it state through `set`.
 */
export class NovaStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.camera.position.set(0, 0, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.clock = new THREE.Clock(false);
    this.state = { gait: null, speed: 90, facing: 1, mood: "neutral", talkUntil: 0, rampant: false, glow: 1, asleep: false, attend: false, held: false, seat: null, lie: null, still: false, energy: 1, glitchUntil: 0, visible: true, activity: null, drowsy: false, staticNoise: false, lean: null };
    this.forced = null;
    this.focusWorld = null;
    this.focusVec = new THREE.Vector3();
    this.penRef = null;
    this.drawAt = { x: 1, y: 0 };
    this.drawW = 0;
    this.cardsW = 0;
    this.bookW = 0;
    this.deckW = 0;
    this.legSwing = createLegSwing();
    this.gaze = new THREE.Vector3(0, 1, 2.5);
    this.headVel = { yaw: 0, pitch: 0 };
    this.focused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    this.onFocus = () => {
      this.focused = true;
    };
    this.onBlur = () => {
      this.focused = false;
      this.lookAway();
    };
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("blur", this.onBlur);
    this.uniforms = {
      uTime: { value: 0 },
      uGlitch: { value: 0 },
      uHeight: { value: 1.6 },
      uGlow: { value: 1 },
      uFade: { value: 1 },
      uColor: { value: new THREE.Color() },
      uHot: { value: new THREE.Color() },
      uRestH: { value: 1 },
      uZombie: { value: 0 },
      uFlicker: { value: 1 },
      uEyeColor: { value: new THREE.Color() },
      uResolve: { value: 1 },
    };
    this.resolve = { from: 1, to: 1, start: 0, ms: 0 };
    this.flicker = { at: -Infinity, next: 0 };
    this.onPack = () => this.refreshColors();
    window.addEventListener("studyhub-pack-changed", this.onPack);
    this.yaw = 0;
    this.look = { x: 0, y: 0, at: 0 };
    this.proc = null;
    this.armsBack = 1;
    this.heldW = 0;
    this.seatW = 0;
    this.playW = 0;
    this.lieW = 0;
    this.leanW = 0;
    this.leanSide = 1;
    this.lieX = 0;
    this.t = 0;
    this.face = {};
    this.mouth = { key: "aa", v: 0, next: 0 };
    this.blink = { next: 1.5, t: -1 };
    this.base = null;
    this.oneShot = null;
    this.actions = {};
    this.raf = 0;
    this.last = 0;
    this.sizePx = 180;
    /** Called with the head's box px ({ x, y }) when it moves 2px or more; null-safe. */
    this.onHead = null;
    this.headPx = null;
    this.refreshColors();
  }

  refreshColors() {
    this.uniforms.uColor.value.copy(cssColor(this.state.rampant ? "--sh-danger" : "--sh-accent", "--sh-accent"));
    this.uniforms.uHot.value.copy(cssColor("--sh-text", "--sh-accent"));
    this.uniforms.uZombie.value = document.documentElement.dataset.pack === "zombies" ? 1 : 0;
    this.uniforms.uEyeColor.value.copy(cssColor(this.uniforms.uZombie.value ? "--sh-accent-2" : "--sh-accent", "--sh-accent"));
    for (const set of Object.values(this.propMats || {})) {
      set.fill.color.copy(this.uniforms.uColor.value);
      set.dim.color.copy(this.uniforms.uColor.value);
      set.line.color.copy(this.uniforms.uHot.value);
    }
  }

  /**
   * Hologram props: an open book (read lying on her stomach) and a small deck of cards
   * (shuffled and fanned while she sits). Placed in world space every frame from her bones.
   */
  buildProps() {
    const H = this.height;
    const mats = () => {
      const common = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
      return {
        fill: new THREE.MeshBasicMaterial({ ...common, color: this.uniforms.uColor.value, opacity: 0.3, side: THREE.DoubleSide }),
        line: new THREE.LineBasicMaterial({ ...common, color: this.uniforms.uHot.value, opacity: 0.85 }),
        dim: new THREE.LineBasicMaterial({ ...common, color: this.uniforms.uColor.value, opacity: 0.6 }),
      };
    };
    this.propMats = { book: mats(), deck: mats() };
    this.propGeos = [];
    const keep = (g) => {
      this.propGeos.push(g);
      return g;
    };

    const pw = H * 0.085;
    const ph = H * 0.12;
    const pageGeo = keep(new THREE.PlaneGeometry(pw, ph).translate(pw / 2, 0, 0));
    const pageEdges = keep(new THREE.EdgesGeometry(pageGeo));
    const rows = [];
    for (let i = 0; i < 6; i += 1) {
      const y = ph * (0.32 - i * 0.12);
      rows.push(pw * 0.15, y, 0, pw * (i === 5 ? 0.55 : 0.85), y, 0);
    }
    const textGeo = keep(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(rows, 3)));
    const m = this.propMats.book;
    const page = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(pageGeo, m.fill), new THREE.LineSegments(pageEdges, m.line), new THREE.LineSegments(textGeo, m.dim));
      return g;
    };
    this.bookOpen = 0.28;
    const book = new THREE.Group();
    const left = page();
    left.rotation.y = Math.PI - this.bookOpen;
    const right = page();
    right.rotation.y = this.bookOpen;
    this.bookFlip = page();
    book.add(left, right, this.bookFlip);

    const cw = H * 0.045;
    const ch = H * 0.064;
    const cardGeo = keep(new THREE.PlaneGeometry(cw, ch).translate(0, ch / 2, 0));
    const cardEdges = keep(new THREE.EdgesGeometry(cardGeo));
    const d = this.propMats.deck;
    const deck = new THREE.Group();
    this.deckCards = Array.from({ length: 7 }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(cardGeo, d.fill), new THREE.LineSegments(cardEdges, d.line));
      deck.add(g);
      return g;
    });

    this.props = new THREE.Group();
    this.props.add(book, deck);
    this.book = book;
    this.deck = deck;
    book.visible = false;
    deck.visible = false;
    this.scene.add(this.props);
  }

  placeProps(dt) {
    const s = this.state;
    const ease = (cur, want, rate) => cur + (want - cur) * Math.min(1, dt * rate);
    this.bookW = ease(this.bookW, s.activity === "read" && this.lying === "belly" && this.lieW > 0.6 ? 1 : 0, 3);
    this.deckW = ease(this.deckW, s.activity === "cards" && this.cardsW > 0.6 ? 1 : 0, 3);
    this.focusWorld = null;
    const h = this.vrm.humanoid;
    const at = (name, out) => h.getNormalizedBoneNode(name)?.getWorldPosition(out);
    const setOpacity = (set, w) => {
      set.fill.opacity = 0.3 * w;
      set.line.opacity = 0.85 * w;
      set.dim.opacity = 0.6 * w;
    };

    this.book.visible = this.bookW > 0.01;
    if (this.book.visible) {
      setOpacity(this.propMats.book, this.bookW);
      const head = at("head", _props.head);
      const lh = at("leftHand", _props.lh) || head;
      const rh = at("rightHand", _props.rh) || head;
      const x = Math.min(head.x, lh.x, rh.x) - this.height * 0.07;
      const y = Math.max(this.rest.floorY + this.height * 0.03, Math.min(lh.y, rh.y));
      this.book.position.set(x, y, head.z + 0.05);
      this.book.rotation.set(-0.7, 0, 0);
      const cyc = this.t % 5.5;
      const f = smooth(4.4, 5.3, cyc);
      this.bookFlip.rotation.y = this.bookOpen + (Math.PI - 2 * this.bookOpen) * f;
      this.bookFlip.visible = f > 0.001 && f < 0.999;
      this.focusWorld = this.focusVec.copy(this.book.position);
    }

    this.deck.visible = this.deckW > 0.01;
    if (this.deck.visible) {
      setOpacity(this.propMats.deck, this.deckW);
      const lh = at("leftHand", _props.lh);
      const rh = at("rightHand", _props.rh);
      if (lh && rh) {
        const mid = lh.add(rh).multiplyScalar(0.5);
        this.deck.position.set(mid.x, mid.y - this.height * 0.01, mid.z + 0.03);
      }
      const t = this.t % 6.6;
      const fan = smooth(3.2, 3.8, t) * (1 - smooth(5.8, 6.4, t));
      const shuffle = 1 - smooth(2.8, 3.3, t);
      const n = this.deckCards.length;
      this.deckCards.forEach((card, i) => {
        const ph = this.t * 5 + i * 0.9;
        card.position.set(Math.sin(ph) * this.height * 0.025 * shuffle, Math.abs(Math.cos(ph)) * this.height * 0.008 * shuffle, i * 0.002);
        card.rotation.z = (i - (n - 1) / 2) * 0.2 * fan + Math.sin(ph) * 0.15 * shuffle;
      });
      this.focusWorld = this.focusVec.copy(this.deck.position);
    }
  }

  /** Pen position for drawing, read every frame: a ref holding `{ x, y }` in viewport px, or null. */
  setPen(ref) {
    this.penRef = ref;
  }

  /** Tween how much of her body has resolved out of the particle field (0 = none) over `ms`; resolves when done. */
  resolveTo(to, ms = 0) {
    const now = performance.now();
    this.resolve = { from: resolveAt(this.resolve, now), to, start: now, ms };
    this.uniforms.uResolve.value = resolveAt(this.resolve, now);
    return new Promise((done) => window.setTimeout(done, ms));
  }

  /**
   * Up to `n` points on her body in client px, for the particle field to gather to. Vertices are
   * picked once at random (by vertex count across her meshes) and skinned to the current pose.
   */
  sampleScreenPoints(n = 2000) {
    if (!this.vrm || this.disposed) return [];
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    if (this.samples?.length !== n) {
      const meshes = this.meshes.map((m) => m.mesh);
      const total = meshes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0);
      this.samples = Array.from({ length: n }, () => {
        let k = Math.floor(Math.random() * total);
        for (const mesh of meshes) {
          const count = mesh.geometry.attributes.position.count;
          if (k < count) return { mesh, i: k };
          k -= count;
        }
        return { mesh: meshes[0], i: 0 };
      });
    }
    const flipped = !!this.lying && this.state.facing < 0;
    const out = [];
    for (const { mesh, i } of this.samples) {
      const p = mesh.localToWorld(mesh.getVertexPosition(i, _sample)).project(this.camera);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const fx = (p.x + 1) / 2;
      out.push({ x: r.left + (flipped ? 1 - fx : fx) * r.width, y: r.top + ((1 - p.y) / 2) * r.height });
    }
    return out;
  }

  /** Look at a point (px from the canvas center) for `ms`, cursor or not. */
  glanceAt(dx, dy, ms = 2500) {
    this.forced = { x: dx, y: dy, until: performance.now() + ms };
  }

  async load() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(modelUrl);
    const vrm = gltf.userData.vrm;
    if (!vrm?.humanoid) throw new Error("not a VRM humanoid");
    if (this.disposed) {
      VRMUtils.deepDispose(gltf.scene);
      return;
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => {
      o.frustumCulled = false;
    });
    this.vrm = vrm;
    this.root.add(vrm.scene);

    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.height = box.max.y - box.min.y;
    this.uniforms.uHeight.value = this.height;
    const H = this.height * FRAME_SCALE;
    Object.assign(this.camera, { left: -H / 2, right: H / 2, top: H - H * 0.01 + box.min.y, bottom: -H * 0.01 + box.min.y });
    this.camera.updateProjectionMatrix();
    this.frameH = H;

    this.applyHologram();

    const hips = vrm.humanoid.getNormalizedBoneNode("hips");
    this.hipsHeight = Math.abs(hips.getWorldPosition(new THREE.Vector3()).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y);
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    for (const [name, data] of Object.entries(clipData.clips)) {
      const action = this.mixer.clipAction(buildClip(name, data, vrm, this.hipsHeight));
      if (!LOOPING.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[name] = action;
    }
    this.mixer.addEventListener("finished", (e) => this.onFinished(e.action));
    this.animPose = Object.keys(clipData.clips.idle.bones)
      .map((name) => vrm.humanoid.getNormalizedBoneNode(name))
      .filter(Boolean)
      .map((node) => ({ node, q: node.quaternion.clone() }));
    this.captureRest();
    this.buildProps();

    this.lookTarget = new THREE.Object3D();
    this.scene.add(this.lookTarget);
    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookTarget;
      vrm.lookAt.autoUpdate = true;
    }
    this.setBase("idle", 0);
    this.clock.start();
    this.start();
  }

  applyHologram() {
    const colorMats = new Map();
    const depthMats = new Map();
    this.meshes = [];
    let restH = 0;
    this.vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      restH = Math.max(restH, o.geometry.boundingBox.max.y);
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const color = [];
      const depth = [];
      for (const m of src) {
        if (m.map) {
          m.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          m.map.needsUpdate = true;
        }
        if (!colorMats.has(m)) {
          const outline = !!m.isOutline;
          const layered = !!m.transparent && !m.alphaTest;
          const name = m.name || "";
          const eye = /_eye/i.test(name) ? 1 : 0;
          const wear = /_hair|_lashes/i.test(name) ? 2 : /_body/i.test(name) ? 1 : 0;
          const make = (depthOnly) =>
            new THREE.ShaderMaterial({
              uniforms: {
                ...this.uniforms,
                map: { value: m.map || null },
                uHasMap: { value: m.map ? 1 : 0 },
                uCut: { value: m.alphaTest || (layered ? 0.02 : 0.5) },
                uDepthOnly: { value: depthOnly ? 1 : 0 },
                uEye: { value: eye },
                uWear: { value: wear },
              },
              vertexShader: VERT,
              fragmentShader: FRAG,
              transparent: true,
              premultipliedAlpha: true,
              side: m.side ?? THREE.FrontSide,
              depthWrite: depthOnly,
              depthFunc: depthOnly ? THREE.LessEqualDepth : THREE.LessEqualDepth,
              colorWrite: !depthOnly,
              visible: !outline && !(depthOnly && layered),
            });
          colorMats.set(m, make(false));
          depthMats.set(m, make(true));
        }
        color.push(colorMats.get(m));
        depth.push(depthMats.get(m));
      }
      this.meshes.push({ mesh: o, color: Array.isArray(o.material) ? color : color[0], depth: Array.isArray(o.material) ? depth : depth[0] });
    });
    this.uniforms.uRestH.value = restH || 1;
  }

  /** Zombies pack: every few seconds the projection stutters for a moment. Steady under reduced motion. */
  stepFlicker(now) {
    if (!this.uniforms.uZombie.value || this.state.still) return 1;
    const f = this.flicker;
    if (!f.next) f.next = now + 3500;
    if (now >= f.next) {
      f.at = now;
      f.next = now + 3500 + Math.random() * 5000;
    }
    const t = now - f.at;
    if (t < 50) return 0.35;
    if (t < 110) return 1;
    if (t < 200) return 0.55;
    return 1;
  }

  /** Rest-pose world data for the arm bones, used by the arms-behind-back layer. */
  captureRest() {
    const h = this.vrm.humanoid;
    this.vrm.scene.updateMatrixWorld(true);
    const rest = (name, childName) => {
      const node = h.getNormalizedBoneNode(name);
      const child = h.getNormalizedBoneNode(childName);
      if (!node || !child) return null;
      const a = node.getWorldPosition(new THREE.Vector3());
      const b = child.getWorldPosition(new THREE.Vector3());
      return { node, dir: b.sub(a).normalize(), q: node.getWorldQuaternion(new THREE.Quaternion()) };
    };
    const chest = h.getNormalizedBoneNode("upperChest") || h.getNormalizedBoneNode("chest");
    const hips = h.getNormalizedBoneNode("hips");
    this.rest = {
      chest,
      chestQInv: chest.getWorldQuaternion(new THREE.Quaternion()).invert(),
      hips,
      hipsQInv: hips.getWorldQuaternion(new THREE.Quaternion()).invert(),
      floorY: new THREE.Box3().setFromObject(this.vrm.scene).min.y,
      left: [rest("leftUpperArm", "leftLowerArm"), rest("leftLowerArm", "leftHand"), rest("leftHand", "leftMiddleProximal")],
      right: [rest("rightUpperArm", "rightLowerArm"), rest("rightLowerArm", "rightHand"), rest("rightHand", "rightMiddleProximal")],
      leftLeg: [rest("leftUpperLeg", "leftLowerLeg"), rest("leftLowerLeg", "leftFoot"), rest("leftFoot", "leftToes")],
      rightLeg: [rest("rightUpperLeg", "rightLowerLeg"), rest("rightLowerLeg", "rightFoot"), rest("rightFoot", "rightToes")],
    };
    this.pose = bothArms(ARMS_BACK.upper, ARMS_BACK.lower, ARMS_BACK.hand);
  }

  setSize(px) {
    this.headPx = null;
    this.sizePx = px;
    this.renderer.setPixelRatio(Math.min(SUPERSAMPLE_MAX, (window.devicePixelRatio || 1) * SUPERSAMPLE));
    this.renderer.setSize(px, px, false);
  }

  set(patch) {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    if (patch.rampant !== undefined && patch.rampant !== prev.rampant) this.refreshColors();
    const startsTalking = patch.talkUntil > performance.now() && patch.talkUntil !== prev.talkUntil;
    if (startsTalking && this.gestureIsIdle()) this.cancelGesture();
    if (this.mixer) this.syncBase();
    if (patch.visible === false) this.stop();
    else if (patch.visible === true) this.start();
  }

  /** Pointer position relative to the canvas center, in CSS px. */
  lookAt(dx, dy) {
    this.look = { x: dx, y: dy, at: performance.now() };
  }

  /** The cursor left the window (or the window lost focus): drift back to a neutral gaze. */
  lookAway() {
    this.look = { ...this.look, at: 0 };
  }

  gestureIsIdle() {
    return !!(this.oneShot?.idle || this.proc?.idle);
  }

  cancelGesture() {
    if (this.oneShot) this.finishOneShot(false);
    if (this.proc) this.finishProc(false);
  }

  wantedBase() {
    const s = this.state;
    if (s.held) return "idle";
    if (s.gait === "fall") return "fall";
    if (s.gait === "walk") return "walk";
    if (LIE_CLIPS[s.lie] && this.actions[LIE_CLIPS[s.lie]]) return LIE_CLIPS[s.lie];
    if (s.asleep || s.seat) return "sit";
    if (s.talkUntil > performance.now()) return "talk";
    return "idle";
  }

  syncBase() {
    const want = this.wantedBase();
    if ((want === "walk" || want === "fall" || this.state.held) && (this.oneShot || this.proc)) this.cancelGesture();
    if (want !== this.base) this.setBase(want, want.startsWith("lie") || this.base?.startsWith("lie") ? LIE_FADE : FADE);
  }

  setBase(name, fade = FADE) {
    const next = this.actions[name];
    if (!next) return;
    const prev = this.base ? this.actions[this.base] : null;
    this.base = name;
    if (this.oneShot) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
  }

  /**
   * One-shot gesture (yawn, wave, kiss, land, or a procedural one like stretch). Resolves
   * when it hands back to the base. `idle` gestures give way as soon as she starts talking.
   */
  play(name, { idle = false, at = null } = {}) {
    if (!this.mixer) return Promise.resolve(false);
    if (name === "cancel") {
      this.cancelGesture();
      return Promise.resolve(false);
    }
    if (PROC[name]) {
      this.cancelGesture();
      return new Promise((resolve) => {
        this.proc = { name, def: PROC[name], t: 0, idle, at, resolve };
      });
    }
    const action = this.actions[name];
    if (!action) return Promise.resolve(false);
    this.cancelGesture();
    const base = this.actions[this.base];
    action.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    base?.fadeOut(0.25);
    return new Promise((resolve) => {
      this.oneShot = { name, action, idle, resolve };
    });
  }

  finishProc(done) {
    const p = this.proc;
    this.proc = null;
    p?.resolve(done);
  }

  /** Procedural gesture weight: eases in and out at the ends. */
  procWeight() {
    const p = this.proc;
    const [rin, rout] = p.def.ramp || [0.55, 0.6];
    return smooth(0, rin, p.t) * (1 - smooth(p.def.duration - rout, p.def.duration, p.t));
  }

  /** Additive local rotation (VRM 1.0 axes) on a normalized bone. */
  bend(bone, [x, y, z], weight) {
    const node = this.vrm.humanoid.getNormalizedBoneNode(bone);
    if (!node) return;
    const v0 = this.vrm.meta?.metaVersion === "0";
    const e = _bend.e.set((v0 ? -x : x) * weight, y * weight, (v0 ? -z : z) * weight, "XYZ");
    node.quaternion.multiply(_bend.q.setFromEuler(e));
  }

  onFinished(action) {
    if (this.oneShot?.action === action) this.finishOneShot(true);
  }

  finishOneShot(done) {
    const shot = this.oneShot;
    this.oneShot = null;
    if (!shot) return;
    const base = this.actions[this.base];
    shot.action.fadeOut(FADE);
    base?.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    shot.resolve(done);
  }

  start() {
    if (this.raf || !this.vrm || !this.state.visible) return;
    this.last = 0;
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (this.last && t - this.last < (this.focused ? FRAME_MS : BLUR_FRAME_MS) - 2) return;
      this.last = t;
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick() {
    const dt = Math.min(0.1, this.clock.getDelta());
    const now = performance.now();
    const s = this.state;
    this.uniforms.uTime.value += dt;
    this.syncBase();

    const walk = this.actions.walk;
    if (walk && clipData.clips.walk?.travel) {
      const pxPerUnit = this.sizePx / this.frameH;
      const natural = clipData.clips.walk.travel * this.hipsHeight * pxPerUnit;
      walk.timeScale = THREE.MathUtils.clamp((s.speed || 90) / natural, 0.5, 1.8);
    }
    /*
     * The mixer only writes a bone when its animated value changes, so on a still pose (the
     * single-frame lying clips) last frame's procedural bends would stay and pile up. Start
     * every frame from the clean animated pose.
     */
    for (const b of this.animPose) b.node.quaternion.copy(b.q);
    this.mixer.update(dt);
    for (const b of this.animPose) b.q.copy(b.node.quaternion);

    const talking = s.talkUntil > now;
    const lying = this.base?.startsWith("lie") ? s.lie : null;
    const seated = !lying && !!(s.seat || s.asleep) && !s.held && !s.gait && !this.oneShot;
    const cold = seated && !s.asleep && s.seat === "cold";
    let targetYaw = s.facing * 0.28;
    if (lying) targetYaw = 0;
    else if (s.gait === "walk") targetYaw = s.facing * (Math.PI / 2 - 0.3);
    else if (talking || s.attend || s.held) targetYaw = 0;
    else if (cold) targetYaw = s.facing * 0.5;
    else if (seated) targetYaw = s.facing * 0.12;
    const dy = targetYaw - this.yaw;
    this.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 6);
    this.root.rotation.y = this.yaw;

    this.t += dt;
    const ease = (cur, want, rate) => cur + (want - cur) * Math.min(1, dt * rate);
    this.heldW = ease(this.heldW, s.held ? 1 : 0, 8);
    this.seatW = ease(this.seatW, seated ? 1 : 0, 4);
    this.playW = ease(this.playW, seated && !s.asleep && (s.seat === "playful" || s.seat === "cards") ? 1 : 0, 4);
    this.cardsW = ease(this.cardsW, seated && !s.asleep && s.seat === "cards" ? 1 : 0, 4);
    this.lieW = ease(this.lieW, lying ? 1 : 0, 4);
    const leaning = !!s.lean && !lying && !seated && !s.gait && !s.held && !this.oneShot;
    this.leanW = ease(this.leanW, leaning ? 1 : 0, 4);
    if (leaning) this.leanSide = s.lean === "right" ? 1 : -1;
    const pen = s.activity === "draw" && !lying && !seated && !s.gait ? this.penRef?.current : null;
    this.drawW = ease(this.drawW, pen ? 1 : 0, 6);

    const wantBack = !this.oneShot && !s.held && ARMS_BACK_BASES.has(this.base) ? 1 : 0;
    this.armsBack += (wantBack - this.armsBack) * Math.min(1, dt * 5);
    if (this.armsBack > 0.01) this.applyArmPose(this.pose, this.armsBack);
    if (this.heldW > 0.01) {
      this.applyArmPose(HELD.arms(this.t), this.heldW);
      this.applyLegPose(HELD.legs(this.t), this.heldW);
      this.bend("head", [-0.22, 0, 0], this.heldW);
    }
    const swing = stepLegSwing(this.legSwing, dt, { active: this.playW > 0.5 && !s.still, energy: s.energy || 1 });
    if (this.playW > 0.01) {
      this.applyArmPose(SEAT_PLAYFUL.arms, this.playW);
      seatLeg(swing.left, swing.cross, 1, _seatLegs.left);
      seatLeg(swing.right, swing.cross, -1, _seatLegs.right);
      this.applyLegPose(_seatLegs, this.playW);
      if (!s.still) this.bend("head", [0, 0, Math.sin(this.t * 1.3) * 0.08], this.playW * (1 - this.cardsW));
    }
    if (this.cardsW > 0.01) this.applyArmPose(CARDS_ARMS, this.cardsW);
    if (this.leanW > 0.01) {
      const tilt = LEAN_TILT * (this.leanSide || 1);
      this.applyArmPose(LEAN_ARMS, this.leanW);
      this.bend("spine", [0, 0, tilt], this.leanW);
      this.bend("chest", [0, 0, tilt * 0.7], this.leanW);
      this.bend("head", [0, 0, -tilt], this.leanW);
    }
    if (pen) {
      const r = this.canvas.getBoundingClientRect();
      this.drawAt = { x: pen.x - (r.left + r.width / 2), y: pen.y - (r.top + r.height * 0.3) };
      this.forced = { x: pen.x - (r.left + r.width / 2), y: pen.y - (r.top + r.height / 2), until: now + 400 };
    }
    if (this.drawW > 0.01) this.applyArmPose(PROC.point.arms(0, { at: this.drawAt }), this.drawW);
    this.pullW = ease(this.pullW || 0, s.activity === "pull" && !lying && !seated && !s.gait ? 1 : 0, 5);
    if (this.pullW > 0.01) this.applyArmPose(this.pullPose(s.facing), this.pullW);
    if (cold) this.bend("head", [0.06, s.facing * 0.45, 0], this.seatW);
    if (seated && s.asleep) {
      this.bend("neck", [0.3, 0, 0.1], this.seatW);
      this.bend("head", [0.35, 0, 0.14], this.seatW);
    }
    this.lying = lying;
    if (lying && !s.still) this.lieLife(lying, s.asleep);
    if (lying && s.drowsy && !s.asleep) this.bend("head", [0.14 * this.nod(), 0, 0], this.lieW);
    this.placeSeat();
    this.centerLie(lying, dt);

    let overlay = null;
    if (this.proc) {
      const p = this.proc;
      p.t += dt;
      const w = this.procWeight();
      if (p.def.arms) this.applyArmPose(p.def.arms(p.t, p), w);
      if (p.def.body) for (const [bone, angles] of Object.entries(p.def.body(p.t, p))) this.bend(bone, angles, w);
      overlay = p.def.face?.(p.t) || null;
      if (p.t >= p.def.duration) this.finishProc(true);
    } else if (this.oneShot && CLIP_FACE[this.oneShot.name]) {
      overlay = CLIP_FACE[this.oneShot.name](this.oneShot.action.time);
    } else if (s.held) {
      overlay = HELD_FACE;
    }
    this.applyHeadLook(dt, s);
    this.applyFace(dt, now, s, talking, overlay);

    let glitching = s.rampant ? (Math.sin(now / 900) > 0.93 ? 1 : 0.15) : 0;
    if (s.staticNoise) glitching = Math.max(glitching, Math.sin(now / 700) > 0.97 ? 0.5 : 0.07);
    this.uniforms.uGlitch.value = Math.max(glitching, s.glitchUntil > now ? 1 : 0);
    this.uniforms.uGlow.value = s.glow;
    this.uniforms.uFlicker.value = this.stepFlicker(now);
    this.uniforms.uResolve.value = resolveAt(this.resolve, now);
    this.uniforms.uFade.value += ((s.asleep ? 0.6 : s.drowsy ? 0.8 : 1) - this.uniforms.uFade.value) * Math.min(1, dt * 3);

    this.vrm.update(dt);
    this.placeProps(dt);
    this.emitHead();
    this.render();
  }

  /** Syncing: both hands reach toward the portal on her facing side and draw the data in, hand over hand. */
  pullPose(facing) {
    const f = facing < 0 ? -1 : 1;
    const reach = setDir(_pull.reach, f * 0.8, 0.12, 0.55);
    const drawn = setDir(_pull.drawn, f * 0.3, -0.25, 0.9);
    const arm = (out, phase) => {
      const k = (1 + Math.sin(this.t * 3.2 + phase)) / 2;
      out[1].copy(reach).lerp(drawn, k).normalize();
      out[0].copy(reach).lerp(drawn, k * 0.4).normalize();
    };
    arm(_pull.out.left, 0);
    arm(_pull.out.right, Math.PI);
    return _pull.out;
  }

  /** Drowsy: 0 most of the time, easing up to 1 as her head drops and her eyes close, every few seconds. */
  nod() {
    return Math.pow(Math.max(0, Math.sin(this.t * 0.7)), 4);
  }

  /**
   * Bone reads below go through getWorldPosition, which refreshes their own ancestor chain.
   * The one matrix read elsewhere without a refresh is VRMLookAt's raw head bone (in
   * `vrm.update`), so refresh that chain too, at the same point a whole-model update did.
   */
  syncLookAtHead() {
    this.vrm.humanoid.getRawBoneNode("head")?.updateWorldMatrix(true, false);
  }

  /**
   * Seated: drop the canvas by SEAT_FRAC of the frame and lower the body so the hips sit on
   * the platform line, with the legs hanging below it. Both follow `seatW` so they stay in step.
   */
  placeSeat() {
    const w = this.seatW < 0.002 ? 0 : this.seatW;
    this.root.position.y = 0;
    if (w) {
      this.syncLookAtHead();
      const hipsY = this.rest.hips.getWorldPosition(_seatHips).y;
      this.root.position.y = (this.rest.floorY + SEAT_FRAC * this.frameH - hipsY) * w;
    }
    const parts = [];
    if (w) parts.push(`translateY(${(SEAT_FRAC * w * 100).toFixed(2)}%)`);
    if (this.lying && this.state.facing < 0) parts.push("scaleX(-1)");
    const shift = parts.join(" ");
    if (this.canvas.style.transform !== shift) this.canvas.style.transform = shift;
  }

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

  /** Lying: slow breathing through the chest, and the feet kick lazily on her stomach. */
  lieLife(pose, asleep) {
    const w = this.lieW;
    const breath = Math.sin(this.t * (asleep ? 1.3 : 1.8)) * (asleep ? 0.035 : 0.025);
    this.bend("chest", [breath, 0, 0], w);
    this.bend("upperChest", [breath * 0.6, 0, 0], w);
    if (pose === "belly" && !asleep) {
      const k = Math.sin(this.t * 2.2);
      this.bend("leftLowerLeg", [0.3 * k, 0, 0], w);
      this.bend("rightLowerLeg", [-0.3 * Math.sin(this.t * 2.2 + 0.6 * Math.PI * 2), 0, 0], w);
      this.bend("head", [0, 0, Math.sin(this.t * 0.9) * 0.05], w);
    }
  }

  /**
   * The lying clips put the hips at the origin with the head and feet off to either side.
   * Slide the body so the whole figure sits centered in her frame.
   */
  centerLie(pose, dt) {
    let want = 0;
    if (pose) {
      const h = this.vrm.humanoid;
      this.syncLookAtHead();
      let lo = Infinity;
      let hi = -Infinity;
      for (const name of LIE_EXTENT_BONES) {
        const node = h.getNormalizedBoneNode(name);
        if (!node) continue;
        const x = node.getWorldPosition(_lieP).x - this.root.position.x;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      if (Number.isFinite(lo)) {
        const headPad = this.height * (this.state.activity === "read" ? 0.2 : 0.06);
        want = -((lo - headPad + hi) / 2);
      }
    }
    this.lieX += (want - this.lieX) * Math.min(1, dt * 4);
    this.root.position.x = Math.abs(this.lieX) < 1e-4 ? 0 : this.lieX;
  }

  /** Blend the arms toward a pose of world directions (relative to the chest) by `weight`. */
  applyArmPose(pose, weight) {
    const r = this.rest;
    this.applyLimbs(pose, weight, r.chest, r.chestQInv, ARM_CHAINS);
  }

  /** Same for the legs, relative to the hips. */
  applyLegPose(pose, weight) {
    const r = this.rest;
    this.applyLimbs(pose, weight, r.hips, r.hipsQInv, LEG_CHAINS);
  }

  /** Each bone's parent.getWorldQuaternion refreshes the chain above it, so no explicit matrix update is needed here. */
  applyLimbs(pose, weight, anchor, anchorRestQInv, chains) {
    const r = this.rest;
    const { parent: parentQ, want, local } = _limbs;
    const bodyDelta = anchor.getWorldQuaternion(_limbs.delta).multiply(anchorRestQInv);
    for (let s = 0; s < 2; s += 1) {
      const bones = r[chains[s]];
      const dirs = pose[s === 0 ? "left" : "right"];
      for (let i = 0; i < bones.length; i += 1) {
        const bone = bones[i];
        if (!bone) continue;
        const target = _limbs.target.copy(dirs[i]).applyQuaternion(bodyDelta);
        const restDir = _limbs.restDir.copy(bone.dir).applyQuaternion(bodyDelta);
        want.setFromUnitVectors(restDir, target).multiply(bodyDelta).multiply(bone.q);
        bone.node.parent.getWorldQuaternion(parentQ);
        local.copy(parentQ.invert().multiply(want));
        bone.node.quaternion.slerp(local, weight);
      }
    }
  }

  applyHeadLook(dt, s) {
    const head = this.vrm.humanoid.getNormalizedBoneNode("head");
    if (!head) return;
    const ppu = this.sizePx / this.frameH;
    const headPos = head.getWorldPosition(_head.pos);
    const cy = (this.camera.top + this.camera.bottom) / 2;
    const now = performance.now();
    const forced = this.forced && now < this.forced.until ? this.forced : null;
    const l = forced ? { ...forced, at: now } : this.look;
    const glancing = l.at && now - l.at < GLANCE_MS && (forced || Math.hypot(l.x, l.y) < GLANCE_RADIUS);
    const onCursor = !!this.focusWorld || glancing || (s.attend && l.at);
    const want = _head.want;
    if (this.focusWorld) want.copy(this.focusWorld);
    else if (onCursor) want.set(l.x / ppu, cy - l.y / ppu, 2.5);
    else want.set(headPos.x + Math.sin(this.yaw) * 2.5, headPos.y, Math.cos(this.yaw) * 2.5);
    /* Eyes: the gaze point catches the cursor quickly and eases back to neutral slowly. */
    this.gaze.lerp(want, 1 - Math.exp(-(onCursor ? GAZE_CATCH : GAZE_RELEASE) * dt));
    this.lookTarget.position.copy(this.gaze);
    const g = this.gaze;

    /* Head: only turns for what the eyes can't cover, and trails them on a soft spring. */
    const free = !this.lying && s.gait !== "walk" && !s.asleep && s.seat !== "cold" && !this.oneShot && !this.proc;
    const beyondEyes = (a) => Math.sign(a) * Math.max(0, Math.abs(a) - EYE_RANGE);
    const yawToGaze = Math.atan2(g.x - headPos.x, g.z - headPos.z) - this.yaw;
    const pitchToGaze = -Math.atan2(g.y - headPos.y, Math.hypot(g.x - headPos.x, g.z - headPos.z));
    const wantYaw = free ? THREE.MathUtils.clamp(beyondEyes(yawToGaze), -HEAD_YAW_MAX, HEAD_YAW_MAX) : 0;
    const wantPitch = free ? THREE.MathUtils.clamp(beyondEyes(pitchToGaze) * 0.8, -HEAD_PITCH_MAX, HEAD_PITCH_MAX) : 0;
    const spring = (cur, target, key) => {
      const v = this.headVel[key] + (HEAD_OMEGA * HEAD_OMEGA * (target - cur) - 2 * HEAD_OMEGA * this.headVel[key]) * dt;
      this.headVel[key] = v;
      return cur + v * dt;
    };
    this.headYaw = spring(this.headYaw || 0, wantYaw, "yaw");
    this.headPitch = spring(this.headPitch || 0, wantPitch, "pitch");
    const v0 = this.vrm.meta?.metaVersion === "0";
    const e = _head.e.set(v0 ? -this.headPitch : this.headPitch, this.headYaw, 0, "YXZ");
    head.quaternion.multiply(_head.q.setFromEuler(e));
  }

  applyFace(dt, now, s, talking, overlay) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const target = MOOD_FACE[s.rampant ? "stern" : s.mood] || {};
    const o = overlay || {};
    const keep = 1 - (o.calm || 0);
    for (const k of FACE_KEYS) {
      const cur = this.face[k] || 0;
      const next = cur + ((target[k] || 0) - cur) * Math.min(1, dt * 6);
      this.face[k] = next;
      if (em.getExpression(k)) em.setValue(k, Math.max(next * keep, o[k] || 0));
    }
    const m = this.mouth;
    if (talking && now > m.next) {
      m.key = MOUTH_KEYS[Math.floor(Math.random() * MOUTH_KEYS.length)];
      m.target = 0.25 + Math.random() * 0.6;
      m.next = now + 70 + Math.random() * 90;
    }
    m.v += ((talking ? m.target || 0 : 0) - m.v) * Math.min(1, dt * 18);
    for (const k of MOUTH_KEYS) em.setValue(k, Math.max(k === m.key ? m.v : 0, o[k] || 0));

    const b = this.blink;
    let blink = 0;
    if (s.asleep) {
      blink = 1;
    } else if (s.drowsy) {
      blink = 0.45 + 0.5 * this.nod();
    } else {
      b.next -= dt;
      if (b.next <= 0 && b.t < 0) b.t = 0;
      if (b.t >= 0) {
        b.t += dt;
        blink = Math.sin(Math.min(1, b.t / 0.16) * Math.PI);
        if (b.t >= 0.16) {
          b.t = -1;
          b.next = 1.8 + Math.random() * 4;
        }
      }
    }
    em.setValue("blink", Math.max(blink, o.blink || 0));
    if (em.getExpression("blinkLeft")) em.setValue("blinkLeft", o.blinkLeft || 0);
  }

  render() {
    const r = this.renderer;
    r.clear();
    const props = this.props?.visible;
    if (this.props) this.props.visible = false;
    for (const m of this.meshes) m.mesh.material = m.depth;
    r.render(this.scene, this.camera);
    if (this.props) this.props.visible = props;
    for (const m of this.meshes) m.mesh.material = m.color;
    r.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("studyhub-pack-changed", this.onPack);
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    for (const m of this.meshes || []) {
      for (const mat of [m.color, m.depth].flat()) mat.dispose();
    }
    for (const g of this.propGeos || []) g.dispose();
    for (const set of Object.values(this.propMats || {})) for (const mat of Object.values(set)) mat.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
