import * as THREE from "three";
import { dayPart } from "../companion/idleDirector.js";
import { FIELD_COUNT, FIELD_EVENTS, fieldTuning, frameDue } from "./fieldEvents.js";

const VERT = /* glsl */ `
attribute vec2 aTarget;
attribute float aMix;
attribute float aBoost;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;
uniform float uPx;
uniform vec2 uMouse;
uniform vec3 uAttr;
uniform vec4 uLine;
uniform float uStream;
varying float vA;

// Divergence-free drift: the curl of a cheap analytic potential.
vec2 flow(vec2 p, float t) {
  float a = p.x * 1.7 + t;
  float b = p.y * 2.3 - t * 0.7;
  float c = p.x * 3.1 - p.y * 2.6 + t * 1.3;
  float dx = 1.7 * cos(a) * cos(b) + 1.55 * cos(c);
  float dy = -2.3 * sin(a) * sin(b) - 1.3 * cos(c);
  return vec2(dy, -dx);
}

void main() {
  float seed = position.z;
  float t = uTime * uSpeed;
  vec2 home = vec2(fract(position.x + t * (0.002 + seed * 0.004)), fract(position.y - t * 0.0015 * (seed - 0.5)));
  vec2 p = home * uRes + flow(home * 3.0, t * 0.15 + seed * 6.28) * 14.0;

  vec2 d = p - uMouse;
  float dl = length(d);
  if (dl < 120.0 && dl > 0.001) p += d / dl * pow(1.0 - dl / 120.0, 2.0) * 22.0;

  vec2 toA = uAttr.xy - p;
  p += toA * uAttr.z * 0.25 * smoothstep(520.0, 0.0, length(toA));

  float s = step(seed, 0.08) * uStream;
  p = mix(p, mix(uLine.xy, uLine.zw, fract(seed * 97.0 + uTime * 0.6)), s);
  p = mix(p, aTarget, aMix);

  vA = (0.35 + 0.65 * fract(seed * 13.7)) * (1.0 + aBoost * 4.0 + s * 3.0 + aMix * 7.0);
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = (1.4 + fract(seed * 7.3) * 1.6 + aMix * 0.6) * uPx;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uDim;
varying float vA;

void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = min(smoothstep(0.5, 0.0, r) * vA * uAlpha * (1.0 - uDim * 0.9), 1.0);
  gl_FragColor = vec4(uColor * a, a);
}
`;

const BASE_ALPHA = 0.14;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (p) => p * p * (3 - 2 * p);

function accentColor() {
  const css = getComputedStyle(document.documentElement).getPropertyValue("--sh-accent").trim() || "#86E1DE";
  return new THREE.Color().setStyle(css).convertLinearToSRGB();
}

/**
 * The ambient particle field on `canvas`: ~3k points in the accent color drifting on a curl flow,
 * pushed by the cursor and steered by studyhub-field-* events. Throws when WebGL is unavailable.
 */
export function createField(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
  const px = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(px);
  renderer.setClearColor(0x000000, 0);

  const n = FIELD_COUNT;
  const home = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    home[i * 3] = Math.random();
    home[i * 3 + 1] = Math.random();
    home[i * 3 + 2] = Math.random();
  }
  const target = new Float32Array(n * 2);
  const mixA = new Float32Array(n);
  const boost = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(home, 3));
  const aTarget = new THREE.BufferAttribute(target, 2).setUsage(THREE.DynamicDrawUsage);
  const aMix = new THREE.BufferAttribute(mixA, 1).setUsage(THREE.DynamicDrawUsage);
  const aBoost = new THREE.BufferAttribute(boost, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aTarget", aTarget);
  geo.setAttribute("aMix", aMix);
  geo.setAttribute("aBoost", aBoost);

  const u = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: Math.random() * 100 },
    uSpeed: { value: 1 },
    uPx: { value: px },
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uAttr: { value: new THREE.Vector3(0, 0, 0) },
    uLine: { value: new THREE.Vector4(0, 0, 0, 0) },
    uStream: { value: 0 },
    uColor: { value: accentColor() },
    uAlpha: { value: BASE_ALPHA },
    uDim: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: u,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.Camera();

  const tune = () => {
    const { density, speed } = fieldTuning(dayPart());
    geo.setDrawRange(0, Math.round(n * density));
    u.uSpeed.value = speed;
  };
  tune();

  const size = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    u.uRes.value.set(w, h);
  };
  size();

  // CPU-side tweens on the target/mix/boost buffers: gathers, releases and emits.
  const gathered = new Uint8Array(n);
  let gather = null;
  let emits = [];
  let emitCursor = 0;
  let dimTo = 0;
  let streamTo = 0;
  let attrTo = 0;

  const draw = () => renderer.render(scene, camera);

  const step = (now) => {
    let dirty = false;
    if (gather) {
      const { idx, start, dur, from, to, done } = gather;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const delay = home[i * 3 + 2] * 0.35 * dur;
        const p = ease(clamp01((now - start - delay) / (dur * 0.65)));
        mixA[i] = from + (to - from) * p;
      }
      dirty = true;
      if (now - start >= dur) {
        if (to === 0) for (const i of idx) gathered[i] = 0;
        gather = null;
        done?.();
      }
    }
    if (emits.length) {
      emits = emits.filter((e) => {
        let live = false;
        for (let k = 0; k < e.idx.length; k++) {
          const i = e.idx[k];
          const p = clamp01((now - e.start - home[i * 3 + 2] * 300) / e.dur);
          const q = ease(p);
          target[i * 2] = e.sx[k] + (e.tx[k] - e.sx[k]) * q;
          target[i * 2 + 1] = e.sy[k] + (e.ty[k] - e.sy[k]) * q;
          mixA[i] = p < 1 ? 1 : 0;
          boost[i] = p < 1 ? Math.min(p / 0.15, 1) * (1 - Math.max(0, (p - 0.85) / 0.15)) : 0;
          if (p < 1) live = true;
        }
        return live;
      });
      dirty = true;
    }
    if (dirty) {
      aTarget.needsUpdate = true;
      aMix.needsUpdate = true;
      aBoost.needsUpdate = true;
    }
    u.uDim.value += (dimTo - u.uDim.value) * 0.08;
    u.uStream.value += (streamTo - u.uStream.value) * 0.08;
    u.uAttr.value.z += (attrTo - u.uAttr.value.z) * 0.05;
  };

  // Render loop: 30fps gate, paused while hidden or unfocused, retuned to the time of day each minute.
  let raf = 0;
  let last = 0;
  let prev = 0;
  let lastTune = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!frameDue(now, last)) return;
    if (prev) u.uTime.value += Math.min(now - prev, 100) / 1000;
    prev = now;
    last = now;
    if (now - lastTune > 60000) {
      lastTune = now;
      tune();
    }
    step(now);
    draw();
  };
  const running = () => !document.hidden && document.hasFocus();
  const start = () => {
    if (reduced || raf || !running()) return;
    prev = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (running() ? start() : stop());

  const finishInstantly = () => {
    if (gather) {
      for (const i of gather.idx) mixA[i] = gather.to;
      if (gather.to === 0) for (const i of gather.idx) gathered[i] = 0;
      const { done } = gather;
      gather = null;
      aMix.needsUpdate = true;
      done?.();
    }
  };

  const on = {
    [FIELD_EVENTS.targets]: ({ points: pts = [], duration = 900 } = {}) => {
      if (reduced || !raf || !pts.length) {
        window.dispatchEvent(new CustomEvent(FIELD_EVENTS.gathered));
        return;
      }
      finishInstantly();
      const drawn = geo.drawRange.count;
      const count = Math.min(pts.length, drawn);
      const idx = new Int32Array(count);
      const stride = drawn / count;
      for (let k = 0; k < count; k++) {
        const i = Math.floor(k * stride);
        idx[k] = i;
        gathered[i] = 1;
        target[i * 2] = pts[k][0];
        target[i * 2 + 1] = pts[k][1];
        boost[i] = 0;
      }
      aTarget.needsUpdate = true;
      gather = {
        idx,
        start: performance.now(),
        dur: duration,
        from: 0,
        to: 1,
        done: () => window.dispatchEvent(new CustomEvent(FIELD_EVENTS.gathered)),
      };
    },
    [FIELD_EVENTS.release]: () => {
      finishInstantly();
      const list = [];
      for (let i = 0; i < n; i++) if (gathered[i]) list.push(i);
      if (!list.length) return;
      const idx = Int32Array.from(list);
      if (reduced) {
        for (const i of idx) {
          mixA[i] = 0;
          gathered[i] = 0;
        }
        aMix.needsUpdate = true;
        draw();
        return;
      }
      gather = { idx, start: performance.now(), dur: 900, from: 1, to: 0 };
    },
    [FIELD_EVENTS.emit]: ({ rect, to, count = 60 } = {}) => {
      if (reduced || !rect || !to) return;
      const drawn = geo.drawRange.count;
      const idx = [];
      for (let tries = 0; idx.length < count && tries < drawn; tries++) {
        emitCursor = (emitCursor + 7) % drawn;
        if (!gathered[emitCursor] && mixA[emitCursor] === 0) idx.push(emitCursor);
      }
      const m = idx.length;
      const e = { idx, start: performance.now(), dur: 800, sx: new Float32Array(m), sy: new Float32Array(m), tx: new Float32Array(m), ty: new Float32Array(m) };
      for (let k = 0; k < m; k++) {
        e.sx[k] = rect.left + Math.random() * rect.width;
        e.sy[k] = rect.top + Math.random() * rect.height;
        e.tx[k] = to.x + (Math.random() - 0.5) * 12;
        e.ty[k] = to.y + (Math.random() - 0.5) * 12;
      }
      emits.push(e);
    },
    [FIELD_EVENTS.attractor]: ({ x, y } = {}) => {
      if (typeof x === "number") u.uAttr.value.set(x, y, u.uAttr.value.z);
    },
    [FIELD_EVENTS.state]: ({ state, from, to } = {}) => {
      attrTo = state === "thinking" ? 1 : 0;
      streamTo = state === "pointing" && from && to ? 1 : 0;
      if (streamTo) u.uLine.value.set(from.x, from.y, to.x, to.y);
      if (reduced) {
        u.uAttr.value.z = 0;
        u.uStream.value = 0;
      }
    },
    [FIELD_EVENTS.dim]: ({ amount = 0 } = {}) => {
      dimTo = clamp01(amount);
      if (reduced) {
        u.uDim.value = dimTo;
        draw();
      }
    },
  };
  const listeners = Object.entries(on).map(([name, fn]) => {
    const h = (e) => fn(e.detail);
    window.addEventListener(name, h);
    return [name, h];
  });

  const onMove = (e) => u.uMouse.value.set(e.clientX, e.clientY);
  const onLeave = () => u.uMouse.value.set(-9999, -9999);
  const onResize = () => {
    size();
    if (reduced) draw();
  };
  if (!reduced) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("blur", onVisibility);

  draw();
  start();

  return {
    recolor() {
      u.uColor.value.copy(accentColor());
      if (reduced || !raf) draw();
    },
    dispose() {
      stop();
      for (const [name, h] of listeners) window.removeEventListener(name, h);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    },
  };
}
