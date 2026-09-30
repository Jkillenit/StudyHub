import { describe, expect, it } from "vitest";
import { HIP_AMP, KNEE_GAIN, KNEE_LAG_S, PHASE_OFFSET, SWING_HZ, createLegSwing, stepLegSwing } from "./legSwing.js";

/** Small deterministic PRNG so every run is the same. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DT = 1 / 30;

function run(seconds, opts = {}, seed = 7) {
  const s = createLegSwing(seeded(seed));
  const frames = [];
  for (let i = 0; i < seconds / DT; i += 1) frames.push({ ...stepLegSwing(s, DT, opts), hz: s.hz, t: s.t });
  return { s, frames };
}

describe("leg swing", () => {
  it("keeps the pace between 0.6 and 1.1 swings per second and re-rolls it", () => {
    const { frames } = run(120, { variations: false });
    for (const f of frames) {
      expect(f.hz).toBeGreaterThanOrEqual(SWING_HZ[0] - 1e-9);
      expect(f.hz).toBeLessThanOrEqual(SWING_HZ[1] + 1e-9);
    }
    const distinct = new Set(frames.map((f) => f.hz.toFixed(2)));
    expect(distinct.size).toBeGreaterThan(5);
  });

  it("stays inside a 10 to 20 degree hip swing, and actually reaches it", () => {
    const { frames } = run(30, { variations: false });
    const steady = frames.slice(frames.length / 2);
    const peak = Math.max(...steady.map((f) => Math.abs(f.left.hip)));
    expect(peak).toBeLessThanOrEqual(HIP_AMP[1] + 1e-6);
    expect(peak).toBeGreaterThan(HIP_AMP[0] * 0.9);
  });

  it("runs the right leg about 0.6 of a cycle behind the left", () => {
    const s = createLegSwing(seeded(3));
    for (let i = 0; i < 300; i += 1) stepLegSwing(s, DT, { variations: false });
    s.reach.right = s.reach.left;
    s.amp.right = s.amp.left;
    const out = stepLegSwing(s, 0, { variations: false });
    const a = s.amp.left * s.reach.left;
    expect(out.left.hip).toBeCloseTo(a * Math.sin(2 * Math.PI * s.phase), 6);
    expect(out.right.hip).toBeCloseTo(a * Math.sin(2 * Math.PI * (s.phase - PHASE_OFFSET)), 6);
  });

  it("gives the two legs different reaches so they aren't mirrored", () => {
    const { s } = run(1, { variations: false }, 11);
    expect(Math.abs(s.reach.left - s.reach.right)).toBeGreaterThan(1e-3);
  });

  it("lags the knee behind the hip with extra reach", () => {
    const s = createLegSwing(seeded(5));
    for (let i = 0; i < 300; i += 1) stepLegSwing(s, DT, { variations: false });
    const out = stepLegSwing(s, 0, { variations: false });
    const a = s.amp.left * s.reach.left;
    const lag = s.hz * KNEE_LAG_S;
    expect(out.left.knee).toBeCloseTo(a * KNEE_GAIN * Math.sin(2 * Math.PI * (s.phase - lag)), 6);
  });

  it("eases in from a still hang instead of snapping", () => {
    const { frames } = run(3, { variations: false });
    expect(Math.abs(frames[0].left.hip)).toBeLessThan(0.02);
    const firstSecond = frames.slice(0, 30).map((f) => Math.abs(f.left.hip));
    const lastSecond = frames.slice(-30).map((f) => Math.abs(f.left.hip));
    expect(Math.max(...firstSecond)).toBeLessThan(Math.max(...lastSecond));
  });

  it("never jumps between frames, through pace changes and every variation", () => {
    /* At a fine timestep smooth motion moves very little per frame; a snap wouldn't shrink. */
    const s = createLegSwing(seeded(7));
    const frames = [];
    for (let i = 0; i < 600 * 240; i += 1) frames.push(stepLegSwing(s, 1 / 240, { energy: 1.4 }));
    let worst = 0;
    for (let i = 1; i < frames.length; i += 1) {
      for (const side of ["left", "right"]) {
        for (const joint of ["hip", "knee", "ankle"]) {
          worst = Math.max(worst, Math.abs(frames[i][side][joint] - frames[i - 1][side][joint]));
        }
      }
      worst = Math.max(worst, Math.abs(frames[i].cross - frames[i - 1].cross));
    }
    expect(worst).toBeLessThan(0.04);
  });

  it("mixes in variations: one leg stopping, crossed ankles, a kick and a pause", () => {
    const s = createLegSwing(seeded(9));
    const seen = new Set();
    for (let i = 0; i < (20 * 60) / DT; i += 1) {
      stepLegSwing(s, DT);
      if (s.variation) seen.add(s.variation);
    }
    expect([...seen].sort()).toEqual(["cross", "kick", "oneStops", "pause"]);
  });

  it("eases to a still hang when she stops sitting or motion is reduced", () => {
    const s = createLegSwing(seeded(2));
    for (let i = 0; i < 300; i += 1) stepLegSwing(s, DT);
    let out;
    for (let i = 0; i < 150; i += 1) out = stepLegSwing(s, DT, { active: false });
    expect(Math.abs(out.left.hip)).toBeLessThan(0.01);
    expect(Math.abs(out.right.knee)).toBeLessThan(0.01);
    expect(out.cross).toBeLessThan(0.02);
  });

  it("swings faster when excited and slower late at night", () => {
    const cycles = (energy) => {
      const s = createLegSwing(seeded(4));
      let total = 0;
      for (let i = 0; i < 60 / DT; i += 1) {
        total += s.hz * Math.min(1.6, Math.max(0.45, energy)) * DT;
        stepLegSwing(s, DT, { energy, variations: false });
      }
      return total;
    };
    expect(cycles(1.4)).toBeGreaterThan(cycles(1));
    expect(cycles(0.7)).toBeLessThan(cycles(1));
  });
});
