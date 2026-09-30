import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { EXAM_SCHEDULE, examReadyPercent, isCardDue as rendererIsCardDue, localDateString } from "../src/study/sm2.js";

const { FINAL_WINDOW_DAYS, READY_GRADE, examCardStats, isCardDue } = createRequire(import.meta.url)("./examCards.cjs");

const NOW = new Date(2026, 9, 5, 9, 0);
const day = (n) => localDateString(new Date(2026, 9, 5 + n, 12));
const examIn = (n) => new Date(2026, 9, 5 + n, 10, 0).toISOString();

describe("examCards parity with sm2.js", () => {
  it("shares the schedule constants", () => {
    expect(FINAL_WINDOW_DAYS).toBe(EXAM_SCHEDULE.finalWindowDays);
    expect(READY_GRADE).toBe(EXAM_SCHEDULE.readyGrade);
  });

  it("agrees on due for every review state and exam distance", () => {
    const cards = [{}, { next_review: day(0) }];
    for (const next of [-1, 1, 5, 30]) {
      for (const last of [null, -5, -2, -1, 0]) {
        cards.push({ next_review: day(next), lastReview: last == null ? null : day(last) });
      }
    }
    for (const exam of [null, -1, 0, 1, 2, 3, 10]) {
      const examDate = exam == null ? null : examIn(exam);
      for (const card of cards) {
        expect(isCardDue(card, examDate, NOW)).toBe(rendererIsCardDue(card, { examDate, now: NOW }));
      }
    }
  });
});

describe("examCardStats", () => {
  const cards = [
    { moduleId: "m1", next_review: day(30), lastReview: day(-10), lastGrade: 5 },
    { moduleId: "m1", next_review: day(0), lastReview: day(-3), lastGrade: 0 },
    { moduleId: "m2", next_review: day(30), lastReview: day(-10), lastGrade: 4 },
    { moduleId: null },
  ];

  it("counts the whole course with an empty scope", () => {
    const stats = examCardStats(cards, { dueDate: examIn(10), moduleIds: [] }, NOW);
    expect(stats).toEqual({ total: 4, due: 2, ready: examReadyPercent(cards) });
  });

  it("limits to the scoped modules and applies the final window", () => {
    expect(examCardStats(cards, { dueDate: examIn(10), moduleIds: ["m1"] }, NOW)).toEqual({ total: 2, due: 1, ready: 50 });
    expect(examCardStats(cards, { dueDate: examIn(1), moduleIds: ["m1"] }, NOW)).toEqual({ total: 2, due: 2, ready: 50 });
  });

  it("handles an exam with no cards", () => {
    expect(examCardStats([], { dueDate: examIn(3), moduleIds: [] }, NOW)).toEqual({ total: 0, due: 0, ready: 0 });
  });
});
