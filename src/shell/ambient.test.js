import { describe, expect, it } from "vitest";
import { AMBIENT_LINES, ambientAlpha, ambientY } from "./ambient.js";

describe("ambient geometry", () => {
  it("keeps every line near its own band", () => {
    const w = 1440, h = 900;
    for (let i = 0; i < AMBIENT_LINES; i++) {
      const band = (h * (i + 0.5)) / AMBIENT_LINES;
      for (let x = 0; x <= w; x += 90) {
        for (const t of [0, 7.3, 120]) {
          expect(Math.abs(ambientY(i, AMBIENT_LINES, x, w, h, t) - band)).toBeLessThanOrEqual(h * 0.08 + 1e-9);
        }
      }
    }
  });

  it("is deterministic and actually moves", () => {
    expect(ambientY(3, 12, 400, 1000, 800, 2)).toBe(ambientY(3, 12, 400, 1000, 800, 2));
    expect(ambientY(3, 12, 400, 1000, 800, 2)).not.toBe(ambientY(3, 12, 400, 1000, 800, 5));
  });

  it("stays faint", () => {
    for (let i = 0; i < AMBIENT_LINES; i++) {
      for (const t of [0, 1, 2.5, 10, 99]) {
        const a = ambientAlpha(i, t);
        expect(a).toBeGreaterThanOrEqual(0.04);
        expect(a).toBeLessThanOrEqual(0.06);
      }
    }
  });
});
