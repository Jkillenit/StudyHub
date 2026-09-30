/**
 * Seated leg swing, as angles for NovaStage to apply on top of the sitting pose.
 * Pure: no three.js, no DOM; `random` is injectable so tests are deterministic.
 *
 * Each leg swings from the hip on a sine wave. The pace is re-rolled every few cycles and
 * blended in so it never jumps; the right leg runs PHASE_OFFSET of a cycle behind the left
 * with a slightly different reach, so they're never mirror images. The knee replays the
 * hip's motion KNEE_LAG_S later with more reach, so the lower leg trails and whips, and the
 * foot relaxes at the end of each swing. Now and then a variation takes over (one leg stops,
 * ankles cross, a double kick, a full pause). Everything eases in and out.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const SWING_HZ = [0.6, 1.1];
export const REROLL_CYCLES = [3, 6];
export const PHASE_OFFSET = 0.6;
export const HIP_AMP = [10 * DEG, 20 * DEG];
export const KNEE_LAG_S = 0.12;
export const KNEE_GAIN = 1.5;
export const ANKLE_RELAX = 0.14;
/** How fast the pace glides to a new target (Hz per second). */
const HZ_GLIDE = 0.35;
/** Envelope rates (per second): swinging eases in and out, never snaps. */
const AMP_RATE = 1.6;
const CROSS_RATE = 1.8;
export const VARIATION_GAP_S = [4, 10];
const VARIATIONS = {
  oneStops: { weight: 3, duration: [2, 4] },
  cross: { weight: 2, duration: [3, 5] },
  kick: { weight: 2, duration: [1.3, 1.3] },
  pause: { weight: 2, duration: [2, 4] },
};
const KICK_AMP = 34 * DEG;

const pick = (random, [a, b]) => a + random() * (b - a);
const approach = (cur, want, rate, dt) => cur + (want - cur) * (1 - Math.exp(-rate * dt));

export function createLegSwing(random = Math.random) {
  const hz = pick(random, SWING_HZ);
  return {
    random,
    t: 0,
    phase: random(),
    hz,
    hzTarget: hz,
    cyclesToReroll: pick(random, REROLL_CYCLES),
    reach: { left: pick(random, HIP_AMP), right: pick(random, HIP_AMP) },
    amp: { left: 0, right: 0 },
    cross: 0,
    kickT: -1,
    variation: null,
    variationLeft: 0,
    stoppedLeg: "left",
    nextVariation: pick(random, VARIATION_GAP_S),
  };
}

function chooseVariation(s, energy) {
  const weights = Object.entries(VARIATIONS).map(([name, v]) => [name, v.weight * (name === "pause" && energy < 0.85 ? 2.5 : 1)]);
  let roll = s.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of weights) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return weights[weights.length - 1][0];
}

/** Double kick then settle: both legs swing forward hard twice over the kick's 1.3s. */
function kickShape(t) {
  if (t < 0 || t > 1.3) return 0;
  return Math.abs(Math.sin((t / 0.65) * Math.PI)) * Math.exp(-t * 1.2);
}

/**
 * Advance by `dt` seconds. `active` false (not sitting, or reduced motion) eases both legs to
 * a still hang. `energy` scales the pace: >1 excited, <1 lazy late at night.
 * `variations: false` keeps the plain swing (for tests).
 */
export function stepLegSwing(s, dt, { active = true, energy = 1, variations = true } = {}) {
  s.t += dt;
  const pace = Math.min(1.6, Math.max(0.45, energy));

  s.hz = approach(s.hz, s.hzTarget, HZ_GLIDE * 3, dt);
  const dPhase = s.hz * pace * dt;
  s.phase = (s.phase + dPhase) % 1;
  s.cyclesToReroll -= dPhase;
  if (s.cyclesToReroll <= 0) {
    s.hzTarget = pick(s.random, SWING_HZ);
    s.cyclesToReroll = pick(s.random, REROLL_CYCLES);
  }

  let want = { left: active ? 1 : 0, right: active ? 1 : 0 };
  let crossWant = 0;
  if (active && variations) {
    if (s.variation) {
      s.variationLeft -= dt;
      if (s.variationLeft <= 0) {
        s.variation = null;
        s.nextVariation = pick(s.random, VARIATION_GAP_S) / pace;
      }
    } else {
      s.nextVariation -= dt;
      if (s.nextVariation <= 0) {
        s.variation = chooseVariation(s, energy);
        s.variationLeft = pick(s.random, VARIATIONS[s.variation].duration);
        s.stoppedLeg = s.random() < 0.5 ? "left" : "right";
        if (s.variation === "kick") s.kickT = 0;
      }
    }
    if (s.variation === "oneStops") want[s.stoppedLeg] = 0;
    else if (s.variation === "cross" || s.variation === "pause") want = { left: 0, right: 0 };
    else if (s.variation === "kick") want = { left: 0.25, right: 0.25 };
    if (s.variation === "cross") crossWant = 1;
  } else if (!active) {
    s.variation = null;
    s.kickT = -1;
  }

  s.amp.left = approach(s.amp.left, want.left, AMP_RATE, dt);
  s.amp.right = approach(s.amp.right, want.right, AMP_RATE, dt);
  s.cross = approach(s.cross, crossWant, CROSS_RATE, dt);
  const kick = s.kickT >= 0 ? kickShape(s.kickT) * KICK_AMP : 0;
  if (s.kickT >= 0) {
    s.kickT += dt;
    if (s.kickT > 1.3) s.kickT = -1;
  }

  const lag = s.hz * pace * KNEE_LAG_S;
  const leg = (side, offset) => {
    const a = s.amp[side] * s.reach[side];
    const p = s.phase - offset;
    const hip = a * Math.sin(TAU * p) + kick * 0.5;
    const knee = a * KNEE_GAIN * Math.sin(TAU * (p - lag)) + kick;
    const end = Math.sin(TAU * (p - lag * 2));
    const ankle = ANKLE_RELAX * s.amp[side] * end * end;
    return { hip, knee, ankle };
  };
  return { left: leg("left", 0), right: leg("right", PHASE_OFFSET), cross: s.cross };
}
