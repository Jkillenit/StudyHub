import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { gradeSubmitted } = createRequire(import.meta.url)("./bbSync.cjs");

describe("gradeSubmitted", () => {
  it("reads a submission from any grade shape", () => {
    expect(gradeSubmitted(null)).toBe(false);
    expect(gradeSubmitted({ status: "Graded", score: 9 })).toBe(true);
    expect(gradeSubmitted({ status: "NeedsGrading" })).toBe(true);
    expect(gradeSubmitted({ displayGrade: { text: "Needs Grading" }, attemptsCount: 1 })).toBe(true);
    expect(gradeSubmitted({ lastAttemptId: "_55_1" })).toBe(true);
    expect(gradeSubmitted({ status: "InProgress", attemptsCount: 0 })).toBe(false);
    expect(gradeSubmitted({ exempt: true })).toBe(false);
  });
});
