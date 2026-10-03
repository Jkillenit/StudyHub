import { describe, expect, it } from "vitest";
import { MEDAL_MIN } from "./shield.js";
import { earnedPowerUps } from "./powerups.js";

const ids = (stats) => earnedPowerUps(stats).map((p) => p.id);
const base = { answered: 10, correct: 7, best: 2, wentDown: false, closedRound: null };

describe("earnedPowerUps", () => {
  it("drops MAX AMMO when a round closes", () => {
    expect(ids({ ...base, wentDown: true, closedRound: 3 })).toEqual(["max-ammo"]);
  });

  it("drops INSTA-KILL for a perfect run", () => {
    expect(ids({ ...base, correct: 10, best: 4 })).toContain("insta-kill");
  });

  it("drops CARPENTER when shields never went down", () => {
    expect(ids(base)).toEqual(["carpenter"]);
  });

  it("drops DOUBLE POINTS at the streak medal threshold", () => {
    expect(ids({ ...base, wentDown: true, best: 5 })).toEqual(["double-points"]);
    expect(ids({ ...base, wentDown: true, best: 4 })).toEqual([]);
  });

  it("drops NUKE when shields went down but the run still finished at 80% or better", () => {
    expect(ids({ ...base, answered: 15, correct: 12, wentDown: true })).toEqual(["nuke"]);
    expect(ids({ ...base, answered: 15, correct: 11, wentDown: true })).toEqual([]);
    expect(ids({ ...base, answered: 15, correct: 12, wentDown: false })).not.toContain("nuke");
  });

  it("puts MAX AMMO first and caps the drop at 3", () => {
    const out = earnedPowerUps({ answered: 10, correct: 10, best: 10, wentDown: false, closedRound: 2 });
    expect(out.map((p) => p.id)).toEqual(["max-ammo", "insta-kill", "carpenter"]);
  });

  it("orders the rest INSTA-KILL, CARPENTER, DOUBLE POINTS", () => {
    expect(ids({ answered: 10, correct: 10, best: 10, wentDown: false, closedRound: null })).toEqual(["insta-kill", "carpenter", "double-points"]);
  });

  it("gates everything except MAX AMMO behind MEDAL_MIN answers", () => {
    const short = { answered: MEDAL_MIN - 1, correct: MEDAL_MIN - 1, best: MEDAL_MIN - 1, wentDown: false };
    expect(ids({ ...short, closedRound: null })).toEqual([]);
    expect(ids({ ...short, closedRound: 1 })).toEqual(["max-ammo"]);
  });

  it("gives each power-up a label and a short glyph", () => {
    const out = earnedPowerUps({ answered: 10, correct: 10, best: 10, wentDown: false, closedRound: 1 });
    expect(out[0]).toEqual({ id: "max-ammo", label: "MAX AMMO", short: "MAX" });
    for (const p of out) expect(p.short.length).toBeLessThanOrEqual(4);
  });
});
