import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { posAt, fallMs, GRAVITY } = createRequire(import.meta.url)("./novaState.cjs");

describe("posAt", () => {
  it("walks toward x1 at speed and stops there", () => {
    const m = { kind: "walk", x0: 100, x1: 40, y0: 900, speed: 20, t0: 0 };
    expect(posAt(m, 1000)).toEqual({ x: 80, y: 900 });
    expect(posAt(m, 60000)).toEqual({ x: 40, y: 900 });
  });

  it("falls under gravity and lands on y1", () => {
    const m = { kind: "fall", x0: 10, y0: 0, y1: 500, t0: 0 };
    expect(posAt(m, 100).y).toBeCloseTo(0.5 * GRAVITY * 0.01);
    expect(posAt(m, fallMs(0, 500) + 50).y).toBe(500);
  });

  it("stands still before t0 and while standing", () => {
    expect(posAt({ kind: "walk", x0: 5, x1: 50, y0: 1, speed: 10, t0: 1000 }, 0)).toEqual({ x: 5, y: 1 });
    expect(posAt({ kind: "stand", x0: 7, y0: 8, t0: 0 }, 99999)).toEqual({ x: 7, y: 8 });
  });
});
