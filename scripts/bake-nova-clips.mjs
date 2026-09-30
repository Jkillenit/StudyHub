/**
 * Bakes Mixamo FBX clips (art/nova/anims/*.fbx, "Without Skin") into
 * src/companion/nova3d/clips.json, retargeted onto VRM humanoid bone names.
 *
 * Output is in VRM 1.0 normalized-bone space; the runtime flips x/z for VRM 0.x models.
 * Hips translation is stored relative to the Mixamo hips height so the runtime can scale
 * it to the model's own leg length.
 *
 *   node scripts/bake-nova-clips.mjs
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "art", "nova", "anims");
const OUT = path.join(ROOT, "src", "companion", "nova3d", "clips.json");
const FPS = 30;

/** Clips that play in place: horizontal hips drift is removed so the app controls travel. */
const IN_PLACE = new Set(["walk", "idle", "talk", "look", "bored", "taunt", "wave", "kiss", "yawn", "fall"]);

const RIG = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder",
  mixamorigLeftArm: "leftUpperArm",
  mixamorigLeftForeArm: "leftLowerArm",
  mixamorigLeftHand: "leftHand",
  mixamorigLeftHandThumb1: "leftThumbMetacarpal",
  mixamorigLeftHandThumb2: "leftThumbProximal",
  mixamorigLeftHandThumb3: "leftThumbDistal",
  mixamorigLeftHandIndex1: "leftIndexProximal",
  mixamorigLeftHandIndex2: "leftIndexIntermediate",
  mixamorigLeftHandIndex3: "leftIndexDistal",
  mixamorigLeftHandMiddle1: "leftMiddleProximal",
  mixamorigLeftHandMiddle2: "leftMiddleIntermediate",
  mixamorigLeftHandMiddle3: "leftMiddleDistal",
  mixamorigLeftHandRing1: "leftRingProximal",
  mixamorigLeftHandRing2: "leftRingIntermediate",
  mixamorigLeftHandRing3: "leftRingDistal",
  mixamorigLeftHandPinky1: "leftLittleProximal",
  mixamorigLeftHandPinky2: "leftLittleIntermediate",
  mixamorigLeftHandPinky3: "leftLittleDistal",
  mixamorigRightShoulder: "rightShoulder",
  mixamorigRightArm: "rightUpperArm",
  mixamorigRightForeArm: "rightLowerArm",
  mixamorigRightHand: "rightHand",
  mixamorigRightHandPinky1: "rightLittleProximal",
  mixamorigRightHandPinky2: "rightLittleIntermediate",
  mixamorigRightHandPinky3: "rightLittleDistal",
  mixamorigRightHandRing1: "rightRingProximal",
  mixamorigRightHandRing2: "rightRingIntermediate",
  mixamorigRightHandRing3: "rightRingDistal",
  mixamorigRightHandMiddle1: "rightMiddleProximal",
  mixamorigRightHandMiddle2: "rightMiddleIntermediate",
  mixamorigRightHandMiddle3: "rightMiddleDistal",
  mixamorigRightHandIndex1: "rightIndexProximal",
  mixamorigRightHandIndex2: "rightIndexIntermediate",
  mixamorigRightHandIndex3: "rightIndexDistal",
  mixamorigRightHandThumb1: "rightThumbMetacarpal",
  mixamorigRightHandThumb2: "rightThumbProximal",
  mixamorigRightHandThumb3: "rightThumbDistal",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

const round = (v, p) => Math.round(v * p) / p;
/** Quaternion components and scaled hips offsets packed as base64 Int16 (value * 32767 / range). */
const pack = (values, range = 1) =>
  Buffer.from(Int16Array.from(values, (v) => Math.max(-32767, Math.min(32767, Math.round((v / range) * 32767)))).buffer).toString("base64");
const HIPS_RANGE = 4;

function bake(name, buffer) {
  const asset = new FBXLoader().parse(buffer, "");
  const clip = asset.animations.find((a) => a.name === "mixamo.com") || asset.animations[0];
  if (!clip) throw new Error(`${name}: no animation`);
  asset.updateMatrixWorld(true);
  const hipsNode = asset.getObjectByName("mixamorigHips");
  const hipsHeight = hipsNode.position.y;
  const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const restInv = new THREE.Quaternion();
  const parentRest = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const bones = {};
  let hips = null;
  /** Hips travel per second in hips-heights; the runtime matches walk playback speed to it. */
  let travel = 0;

  for (const track of clip.tracks) {
    const [rigName, prop] = track.name.split(".");
    const bone = RIG[rigName];
    const node = asset.getObjectByName(rigName);
    if (!bone || !node) continue;
    const interp = track.createInterpolant();
    if (prop === "quaternion") {
      node.getWorldQuaternion(restInv).invert();
      node.parent.getWorldQuaternion(parentRest);
      const out = [];
      let moving = false;
      let first = null;
      for (let f = 0; f < frames; f += 1) {
        const v = interp.evaluate(Math.min(clip.duration, f / FPS));
        q.set(v[0], v[1], v[2], v[3]).premultiply(parentRest).multiply(restInv).normalize();
        const vals = [round(q.x, 1e4), round(q.y, 1e4), round(q.z, 1e4), round(q.w, 1e4)];
        if (!first) first = vals;
        else if (vals.some((x, i) => Math.abs(x - first[i]) > 2e-3)) moving = true;
        out.push(...vals);
      }
      bones[bone] = pack(moving ? out : first);
    } else if (prop === "position" && bone === "hips") {
      const out = [];
      let x0 = 0;
      let z0 = 0;
      for (let f = 0; f < frames; f += 1) {
        const v = interp.evaluate(Math.min(clip.duration, f / FPS));
        if (f === 0) {
          x0 = v[0];
          z0 = v[2];
        }
        if (f === frames - 1) travel = Math.hypot(v[0] - x0, v[2] - z0) / hipsHeight / clip.duration;
        const inPlace = IN_PLACE.has(name);
        out.push(
          round((inPlace ? 0 : v[0] - x0) / hipsHeight, 1e4),
          round(v[1] / hipsHeight, 1e4),
          round((inPlace ? 0 : v[2] - z0) / hipsHeight, 1e4)
        );
      }
      hips = pack(out, HIPS_RANGE);
    }
  }
  return { duration: round(clip.duration, 1e3), frames, travel: round(travel, 1e3), bones, hips };
}

const clips = {};
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith(".fbx")).sort()) {
  const name = path.basename(file, ".fbx");
  const buf = fs.readFileSync(path.join(SRC, file));
  clips[name] = bake(name, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  process.stdout.write(`${name}: ${clips[name].duration}s, travel ${clips[name].travel}/s, ${Object.keys(clips[name].bones).length} bones\n`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ fps: FPS, hipsRange: HIPS_RANGE, clips }));
process.stdout.write(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)\n`);
