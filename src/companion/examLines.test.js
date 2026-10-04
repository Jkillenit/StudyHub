import { describe, expect, it } from "vitest";
import { character } from "./character.js";
import { ZOMBIES_LINES } from "./packs/zombiesLines.js";
import { fill } from "../nova/voice.js";
import { examEnd, examOpening } from "../session/examSession.js";

const KEYS = [
  ...[0, 1, 5].map((daysUntil) => examOpening({ title: "T", daysUntil, total: 1, due: 1, readyPct: 1 }).key),
  ...[[10, 90], [40, 50], [50, 50]].map(([before, after]) => examEnd({ title: "T", before, after }).key),
  "examNoCards",
];
const LONG = { title: "Operations Management Midterm", days: 12, total: 240, due: 120, ready: 100, before: 100, after: 100 };

describe("exam session lines", () => {
  it("covers all seven keys", () => {
    expect(new Set(KEYS).size).toBe(7);
  });

  it("every key has Nova and Zombies lines", () => {
    for (const k of KEYS) {
      expect(character.lines[k], k).toBeTruthy();
      expect(ZOMBIES_LINES[k], k).toBeTruthy();
    }
  });

  it("takes every number from vars and fits the bubble once filled", () => {
    for (const k of KEYS) {
      for (const t of [...character.lines[k], ...ZOMBIES_LINES[k]]) {
        expect(/\d/.test(t), t).toBe(false);
        expect(fill(t, LONG).length, t).toBeLessThanOrEqual(character.maxBubbleChars);
      }
    }
  });
});
