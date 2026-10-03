import { describe, expect, it } from "vitest";
import { RATINGS, daysUntilExam, examForCard, examReadyPercent, getDueCards, intervalLabel, isCardDue, localDateString, previewIntervals, sm2 } from "./sm2.js";

const NOW = new Date(2026, 9, 5, 9, 0);
const day = (n) => localDateString(new Date(2026, 9, 5 + n, 12));
const examIn = (n) => new Date(2026, 9, 5 + n, 10, 0).toISOString();

const mature = { easeFactor: 2.5, intervalDays: 20, repetitions: 4 };

describe("daysUntilExam", () => {
  it("counts local calendar days for ISO datetimes and bare dates", () => {
    expect(daysUntilExam(examIn(0), NOW)).toBe(0);
    expect(daysUntilExam(examIn(3), NOW)).toBe(3);
    expect(daysUntilExam(day(3), NOW)).toBe(3);
    expect(daysUntilExam(examIn(-1), NOW)).toBe(-1);
    expect(daysUntilExam(null, NOW)).toBeNull();
  });
});

describe("sm2 exam cap", () => {
  it("is plain SM-2 without an exam", () => {
    const r = sm2(mature, 5, { now: NOW });
    expect(r.intervalDays).toBe(50);
    expect(r.nextReview).toBe(day(50));
  });

  it("caps the interval at days until the exam minus one", () => {
    const r = sm2(mature, 5, { examDate: examIn(10), now: NOW });
    expect(r.intervalDays).toBe(9);
    expect(r.nextReview).toBe(day(9));
  });

  it("never schedules less than a day out, even the day before", () => {
    expect(sm2(mature, 5, { examDate: examIn(1), now: NOW }).intervalDays).toBe(1);
    expect(sm2(mature, 5, { examDate: examIn(2), now: NOW }).intervalDays).toBe(1);
  });

  it("leaves short intervals alone", () => {
    expect(sm2({ repetitions: 0 }, 5, { examDate: examIn(10), now: NOW }).intervalDays).toBe(1);
    expect(sm2(mature, 0, { examDate: examIn(10), now: NOW }).intervalDays).toBe(1);
  });

  it("goes back to plain SM-2 on exam day and after", () => {
    expect(sm2(mature, 5, { examDate: examIn(0), now: NOW }).intervalDays).toBe(50);
    expect(sm2(mature, 5, { examDate: examIn(-3), now: NOW }).intervalDays).toBe(50);
  });

  it("does not change ease or repetitions", () => {
    const plain = sm2(mature, 4, { now: NOW });
    const capped = sm2(mature, 4, { examDate: examIn(5), now: NOW });
    expect(capped.easeFactor).toBe(plain.easeFactor);
    expect(capped.repetitions).toBe(plain.repetitions);
  });
});

describe("isCardDue final window", () => {
  const scheduledLater = { next_review: day(30), lastReview: day(-10) };

  it("uses the next review date outside the window", () => {
    expect(isCardDue(scheduledLater, { now: NOW })).toBe(false);
    expect(isCardDue(scheduledLater, { examDate: examIn(3), now: NOW })).toBe(false);
    expect(isCardDue({ next_review: day(0) }, { now: NOW })).toBe(true);
    expect(isCardDue({}, { now: NOW })).toBe(true);
  });

  it("makes cards not reviewed since the window opened due inside it", () => {
    expect(isCardDue(scheduledLater, { examDate: examIn(2), now: NOW })).toBe(true);
    expect(isCardDue(scheduledLater, { examDate: examIn(1), now: NOW })).toBe(true);
    expect(isCardDue(scheduledLater, { examDate: examIn(0), now: NOW })).toBe(true);
  });

  it("counts a review since the window opened as covered", () => {
    const reviewedYesterday = { next_review: day(30), lastReview: day(-1) };
    expect(isCardDue(reviewedYesterday, { examDate: examIn(1), now: NOW })).toBe(false);
    expect(isCardDue(reviewedYesterday, { examDate: examIn(0), now: NOW })).toBe(false);
    const reviewedBeforeWindow = { next_review: day(30), lastReview: day(-3) };
    expect(isCardDue(reviewedBeforeWindow, { examDate: examIn(0), now: NOW })).toBe(true);
  });

  it("ignores past exams", () => {
    expect(isCardDue(scheduledLater, { examDate: examIn(-1), now: NOW })).toBe(false);
  });

  it("getDueCards applies each card's own exam", () => {
    const cards = [
      { id: "a", moduleId: "m1", ...scheduledLater },
      { id: "b", moduleId: "m2", ...scheduledLater },
    ];
    const examFor = (c) => (c.moduleId === "m1" ? examIn(1) : null);
    expect(getDueCards(cards, { examFor, now: NOW }).map((c) => c.id)).toEqual(["a"]);
    expect(getDueCards(cards, { now: NOW })).toEqual([]);
  });
});

describe("examForCard", () => {
  const exams = [
    { uuid: "final", dueDate: examIn(20), moduleIds: [] },
    { uuid: "mid", dueDate: examIn(5), moduleIds: ["m1"] },
    { uuid: "past", dueDate: examIn(-2), moduleIds: [] },
  ];

  it("picks the nearest upcoming exam whose scope covers the card", () => {
    expect(examForCard({ moduleId: "m1" }, exams, NOW).uuid).toBe("mid");
    expect(examForCard({ moduleId: "m2" }, exams, NOW).uuid).toBe("final");
    expect(examForCard({ moduleId: null }, exams, NOW).uuid).toBe("final");
  });

  it("returns null with no upcoming exam", () => {
    expect(examForCard({ moduleId: "m1" }, [exams[2]], NOW)).toBeNull();
    expect(examForCard({ moduleId: "m1" }, [], NOW)).toBeNull();
  });
});

describe("examReadyPercent", () => {
  it("is the share of cards whose latest rating is 3 or higher", () => {
    expect(examReadyPercent([{ lastGrade: 5 }, { lastGrade: 3 }, { lastGrade: 0 }, {}])).toBe(50);
    expect(examReadyPercent([])).toBe(0);
  });
});

describe("previewIntervals", () => {
  const card = { repetitions: 2, intervalDays: 6, easeFactor: 2.5 };

  it("maps the four ratings to SM-2 grades", () => {
    expect(RATINGS.map((r) => [r.label, r.grade, r.key])).toEqual([
      ["Again", 1, "1"],
      ["Hard", 3, "2"],
      ["Good", 4, "3"],
      ["Easy", 5, "4"],
    ]);
  });

  it("shows each rating's next interval", () => {
    expect(previewIntervals(card, { now: NOW }).map((p) => p.label)).toEqual(["1 day", "15 days", "15 days", "15 days"]);
  });

  it("marks intervals capped by an exam", () => {
    const p = previewIntervals(card, { examDate: "2026-10-10", now: NOW });
    expect(p.map((x) => x.label)).toEqual(["1 day", "4 days · before exam", "4 days · before exam", "4 days · before exam"]);
    expect(p[0].beforeExam).toBe(false);
  });

  it("labels singular and plural days", () => {
    expect(intervalLabel(1)).toBe("1 day");
    expect(intervalLabel(6)).toBe("6 days");
    expect(intervalLabel(3, true)).toBe("3 days · before exam");
  });
});