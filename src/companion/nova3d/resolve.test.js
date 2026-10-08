import { describe, expect, it } from "vitest";
import { resolveAt } from "./resolve.js";

describe("resolveAt", () => {
  const tween = { from: 0, to: 1, start: 1000, ms: 600 };

  it("holds the start value before the tween and the end value after it", () => {
    expect(resolveAt(tween, 900)).toBe(0);
    expect(resolveAt(tween, 1600)).toBe(1);
    expect(resolveAt(tween, 5000)).toBe(1);
  });

  it("eases through the midpoint", () => {
    expect(resolveAt(tween, 1300)).toBeCloseTo(0.5);
    expect(resolveAt(tween, 1150)).toBeLessThan(0.25);
  });

  it("runs backwards for a dissolve and jumps straight to the end with no duration", () => {
    expect(resolveAt({ from: 1, to: 0, start: 0, ms: 500 }, 250)).toBeCloseTo(0.5);
    expect(resolveAt({ from: 1, to: 0, start: 0, ms: 0 }, 0)).toBe(0);
  });
});
