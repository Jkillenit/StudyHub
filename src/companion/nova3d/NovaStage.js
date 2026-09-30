import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import clipData from "./clips.json";
import modelUrl from "./nova.vrm?url";

const FRAME_MS = 1000 / 30;
/** Frame height as a multiple of the model's height; the headroom fits raised arms. */
const FRAME_SCALE = 1.14;
const FADE = 0.35;
/** Render above screen resolution so fine detail (hair, circuit lines) stays crisp; the canvas is small. */
const SUPERSAMPLE = 1.5;
const SUPERSAMPLE_MAX = 3;
/** Clips that loop as a base layer; everything else plays once and returns to the base. */
const LOOPING = new Set(["idle", "walk", "talk", "sit", "fall", "look", "bored"]);
/** Bases that keep her hands clasped behind her back. */
const ARMS_BACK_BASES = new Set(["idle", "walk"]);

const MOOD_FACE = {
  neutral: {},
  happy: { happy: 0.55 },
  excited: { happy: 0.9 },
  sad: { sad: 0.7 },
  stern: { angry: 0.55 },
  confused: { Surprised: 0.35 },
  thinking: { relaxed: 0.25 },
  point: { happy: 0.25 },
  sleep: { relaxed: 0.4 },
};
const FACE_KEYS = ["happy", "angry", "sad", "relaxed", "Surprised"];
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

const VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform float uTime;
uniform float uGlitch;
uniform float uHeight;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
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
  mvPosition.x += uGlitch * hit * (fract(sin(slice * 78.233) * 9631.17) - 0.5) * uHeight * 0.09;
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
varying vec2 vUv;
varying vec3 vN;
varying float vH;
void main() {
  vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  if (tex.a < uCut) discard;
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

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
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
    this.state = { gait: null, speed: 90, facing: 1, mood: "neutral", talkUntil: 0, rampant: false, glow: 1, asleep: false, glitchUntil: 0, visible: true };
    this.uniforms = {
      uTime: { value: 0 },
      uGlitch: { value: 0 },
      uHeight: { value: 1.6 },
      uGlow: { value: 1 },
      uFade: { value: 1 },
      uColor: { value: new THREE.Color() },
      uHot: { value: new THREE.Color() },
    };
    this.yaw = 0;
    this.look = { x: 0, y: 0, active: false };
    this.armsBack = 1;
    this.face = {};
    this.mouth = { key: "aa", v: 0, next: 0 };
    this.blink = { next: 1.5, t: -1 };
    this.base = null;
    this.oneShot = null;
    this.actions = {};
    this.raf = 0;
    this.last = 0;
    this.sizePx = 180;
    this.refreshColors();
  }

  refreshColors() {
    this.uniforms.uColor.value.copy(cssColor(this.state.rampant ? "--sh-red" : "--sh-cyan", "--sh-green"));
    this.uniforms.uHot.value.copy(cssColor("--sh-text-primary", "--sh-cyan"));
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
    this.captureRest();

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
    this.vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
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
          const make = (depthOnly) =>
            new THREE.ShaderMaterial({
              uniforms: {
                ...this.uniforms,
                map: { value: m.map || null },
                uHasMap: { value: m.map ? 1 : 0 },
                uCut: { value: m.alphaTest || (layered ? 0.02 : 0.5) },
                uDepthOnly: { value: depthOnly ? 1 : 0 },
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
    this.rest = {
      chest,
      chestQ: chest.getWorldQuaternion(new THREE.Quaternion()),
      rootQ: this.root.getWorldQuaternion(new THREE.Quaternion()),
      left: [rest("leftUpperArm", "leftLowerArm"), rest("leftLowerArm", "leftHand"), rest("leftHand", "leftMiddleProximal")],
      right: [rest("rightUpperArm", "rightLowerArm"), rest("rightLowerArm", "rightHand"), rest("rightHand", "rightMiddleProximal")],
    };
    this.pose = {
      left: [ARMS_BACK.upper, ARMS_BACK.lower, ARMS_BACK.hand],
      right: [mirror(ARMS_BACK.upper), mirror(ARMS_BACK.lower), mirror(ARMS_BACK.hand)],
    };
  }

  setSize(px) {
    this.sizePx = px;
    this.renderer.setPixelRatio(Math.min(SUPERSAMPLE_MAX, (window.devicePixelRatio || 1) * SUPERSAMPLE));
    this.renderer.setSize(px, px, false);
  }

  set(patch) {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    if (patch.rampant !== undefined && patch.rampant !== prev.rampant) this.refreshColors();
    if (this.mixer) this.syncBase();
    if (patch.visible === false) this.stop();
    else if (patch.visible === true) this.start();
  }

  /** Pointer position relative to the canvas center, in CSS px. */
  lookAt(dx, dy) {
    this.look = { x: dx, y: dy, active: true };
  }

  wantedBase() {
    const s = this.state;
    if (s.gait === "fall") return "fall";
    if (s.gait === "walk") return "walk";
    if (s.asleep) return "sit";
    if (s.talkUntil > performance.now()) return "talk";
    return "idle";
  }

  syncBase() {
    const want = this.wantedBase();
    if (want !== this.base) this.setBase(want);
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

  /** One-shot gesture (yawn, wave, kiss, land...). Resolves when it hands back to the base. */
  play(name) {
    const action = this.actions[name];
    if (!action || !this.mixer) return Promise.resolve(false);
    if (this.oneShot) this.finishOneShot(false);
    const base = this.actions[this.base];
    action.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    base?.fadeOut(0.25);
    return new Promise((resolve) => {
      this.oneShot = { name, action, resolve };
    });
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
      if (this.last && t - this.last < FRAME_MS - 2) return;
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
    this.mixer.update(dt);

    const talking = s.talkUntil > now;
    let targetYaw = s.facing * 0.28;
    if (s.gait === "walk") targetYaw = s.facing * (Math.PI / 2 - 0.3);
    else if (talking) targetYaw = s.facing * 0.1;
    const dy = targetYaw - this.yaw;
    this.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 6);
    this.root.rotation.y = this.yaw;

    const wantBack = !this.oneShot && ARMS_BACK_BASES.has(this.base) ? 1 : 0;
    this.armsBack += (wantBack - this.armsBack) * Math.min(1, dt * 5);
    if (this.armsBack > 0.01) this.applyArmsBack(this.armsBack);
    this.applyHeadLook(dt, s);
    this.applyFace(dt, now, s, talking);

    const glitching = s.rampant ? (Math.sin(now / 900) > 0.93 ? 1 : 0.15) : 0;
    this.uniforms.uGlitch.value = Math.max(glitching, s.glitchUntil > now ? 1 : 0);
    this.uniforms.uGlow.value = s.glow;
    this.uniforms.uFade.value += ((s.asleep ? 0.6 : 1) - this.uniforms.uFade.value) * Math.min(1, dt * 3);

    this.vrm.update(dt);
    this.render();
  }

  applyArmsBack(weight) {
    const r = this.rest;
    const chestNow = r.chest.getWorldQuaternion(new THREE.Quaternion());
    const bodyDelta = chestNow.multiply(r.chestQ.clone().invert());
    const parentQ = new THREE.Quaternion();
    const want = new THREE.Quaternion();
    const local = new THREE.Quaternion();
    for (const side of ["left", "right"]) {
      r[side].forEach((bone, i) => {
        if (!bone) return;
        const dir = this.pose[side][i].clone().applyQuaternion(bodyDelta);
        const restDir = bone.dir.clone().applyQuaternion(bodyDelta);
        want.setFromUnitVectors(restDir, dir).multiply(bodyDelta).multiply(bone.q);
        bone.node.parent.getWorldQuaternion(parentQ);
        local.copy(parentQ.invert().multiply(want));
        bone.node.quaternion.slerp(local, weight);
        bone.node.updateMatrixWorld(true);
      });
    }
  }

  applyHeadLook(dt, s) {
    const head = this.vrm.humanoid.getNormalizedBoneNode("head");
    if (!head) return;
    const ppu = this.sizePx / this.frameH;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const cy = (this.camera.top + this.camera.bottom) / 2;
    const t = this.lookTarget.position;
    if (this.look.active) t.set(this.look.x / ppu, cy - this.look.y / ppu, 2.5);
    else t.set(headPos.x + Math.sin(this.yaw) * 2.5, headPos.y, Math.cos(this.yaw) * 2.5);
    const free = s.gait !== "walk" && !s.asleep && !this.oneShot;
    const wantYaw = free ? THREE.MathUtils.clamp(Math.atan2(t.x - headPos.x, t.z - headPos.z) - this.yaw, -0.6, 0.6) * 0.7 : 0;
    const wantPitch = free
      ? THREE.MathUtils.clamp(-Math.atan2(t.y - headPos.y, Math.hypot(t.x - headPos.x, t.z - headPos.z)), -0.4, 0.4) * 0.6
      : 0;
    const k = Math.min(1, dt * 5);
    this.headYaw = (this.headYaw || 0) + (wantYaw - (this.headYaw || 0)) * k;
    this.headPitch = (this.headPitch || 0) + (wantPitch - (this.headPitch || 0)) * k;
    const v0 = this.vrm.meta?.metaVersion === "0";
    const e = new THREE.Euler(v0 ? -this.headPitch : this.headPitch, this.headYaw, 0, "YXZ");
    head.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
  }

  applyFace(dt, now, s, talking) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const target = MOOD_FACE[s.rampant ? "stern" : s.mood] || {};
    for (const k of FACE_KEYS) {
      const cur = this.face[k] || 0;
      const next = cur + ((target[k] || 0) - cur) * Math.min(1, dt * 6);
      this.face[k] = next;
      if (em.getExpression(k)) em.setValue(k, next);
    }
    const m = this.mouth;
    if (talking && now > m.next) {
      m.key = MOUTH_KEYS[Math.floor(Math.random() * MOUTH_KEYS.length)];
      m.target = 0.25 + Math.random() * 0.6;
      m.next = now + 70 + Math.random() * 90;
    }
    m.v += ((talking ? m.target || 0 : 0) - m.v) * Math.min(1, dt * 18);
    for (const k of MOUTH_KEYS) em.setValue(k, k === m.key ? m.v : 0);

    const b = this.blink;
    let blink = 0;
    if (s.asleep) {
      blink = 1;
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
    em.setValue("blink", blink);
  }

  render() {
    const r = this.renderer;
    r.clear();
    for (const m of this.meshes) m.mesh.material = m.depth;
    r.render(this.scene, this.camera);
    for (const m of this.meshes) m.mesh.material = m.color;
    r.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    for (const m of this.meshes || []) {
      for (const mat of [m.color, m.depth].flat()) mat.dispose();
    }
    this.renderer.dispose();
  }
}
