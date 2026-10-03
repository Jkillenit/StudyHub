import { describe, expect, it } from "vitest";
import {
  averageScore,
  currentGrade,
  gradeTone,
  hasScore,
  letterFor,
  neededAverage,
  neededOnItem,
  neededTone,
  normalized,
  remainingWeight,
  totalWeight,
} from "./gradeMath.js";

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

  it("computes the score needed on one item", () => {
    expect(neededOnItem(76, 80, 0.3)).toBeCloseTo(89.33, 1);
    expect(neededOnItem(85, 80, 0.25)).toBeCloseTo(65);
    expect(neededOnItem(null, 80, 0.3)).toBe(80);
    expect(neededOnItem(76, 80, 0)).toBeNull();
  });

  it("computes the average needed on remaining work", () => {
    expect(neededAverage(comps, 80)).toBeCloseTo(82);
    expect(neededAverage([{ weight: 1, score: 80 }], 90)).toBeNull();
  });
});

describe("weights that don't sum to 100%", () => {
  const partial = [
    { weight: 0.4, score: 70 },
    { weight: 0.4, score: null },
  ];

  it("totalWeight sums weights", () => {
    expect(totalWeight(partial)).toBeCloseTo(0.8);
    expect(totalWeight([])).toBe(0);
  });

  it("normalized rescales to 1 and leaves zero totals alone", () => {
    expect(normalized(partial).map((c) => c.weight)).toEqual([0.5, 0.5]);
    const zero = [{ weight: 0, score: null }];
    expect(normalized(zero)).toBe(zero);
  });

  it("neededAverage on normalized weights matches Today (40/40 → 90, 60/60 → 90)", () => {
    expect(neededAverage(normalized(partial), 80)).toBeCloseTo(90);
    const over = [{ weight: 0.6, score: 70 }, { weight: 0.6, score: null }];
    expect(neededAverage(normalized(over), 80)).toBeCloseTo(90);
  });
});

describe("letterFor", () => {
  it("uses the given scale, default when missing, F below all", () => {
    expect(letterFor(85, { A: 93, B: 83, C: 73 })).toBe("B");
    expect(letterFor(85, null)).toBe("B");
    expect(letterFor(85, {})).toBe("B");
    expect(letterFor(40, null)).toBe("F");
    expect(letterFor(null, null)).toBeNull();
  });
});

describe("tones", () => {
  it("gradeTone", () => {
    expect(gradeTone(null)).toBe("none");
    expect(gradeTone(92)).toBe("ok");
    expect(gradeTone(80)).toBe("ok");
    expect(gradeTone(75)).toBe("warn");
    expect(gradeTone(50)).toBe("danger");
  });

  it("neededTone", () => {
    expect(neededTone(60)).toBe("ok");
    expect(neededTone(85)).toBe("ok");
    expect(neededTone(90)).toBe("warn");
    expect(neededTone(99)).toBe("danger");
  });
});

describe("averageScore", () => {
  it("averages to one decimal, null when empty", () => {
    expect(averageScore([{ score: 90 }, { score: 85 }, { score: 80 }])).toBe(85);
    expect(averageScore([{ score: 90 }, { score: 85.15 }])).toBe(87.6);
    expect(averageScore([])).toBeNull();
  });
});
