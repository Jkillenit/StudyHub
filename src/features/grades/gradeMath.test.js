import { describe, expect, it } from "vitest";
import { currentGrade, hasScore, neededAverage, remainingWeight } from "./gradeMath.js";

const comps = [
  { weight: 0.2, score: 90 },
  { weight: 0.3, score: 70 },
  { weight: 0.5, score: null },
];

describe("gradeMath", () => {
  it("detects scores", () => {
    expect(hasScore({ score: 0 })).toBe(true);
    expect(hasScore({ score: null })).toBe(false);
    expect(hasScore({})).toBe(false);
    expect(hasScore({ score: NaN })).toBe(false);
  });

  it("averages only scored components by weight", () => {
    expect(currentGrade(comps)).toBeCloseTo(78);
    expect(currentGrade([{ weight: 0.5, score: null }])).toBeNull();
    expect(currentGrade([])).toBeNull();
  });

  it("sums open weight", () => {
    expect(remainingWeight(comps)).toBeCloseTo(0.5);
  });

  it("computes the average needed on remaining work", () => {
    expect(neededAverage(comps, 80)).toBeCloseTo(82);
    expect(neededAverage([{ weight: 1, score: 80 }], 90)).toBeNull();
  });
});
