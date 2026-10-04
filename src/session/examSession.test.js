import { describe, expect, it } from "vitest";
import { EXAM_READY_TARGET, cardsInScope, examEnd, examNextStep, examOpening, isExamReady, pickExamCards } from "./examSession.js";

const card = (id, { moduleId = "m1", due = false, grade = null } = {}) => ({ uuid: id, moduleId, due, lastGrade: grade });
const many = (prefix, n, opts) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, opts));
const isDue = (c) => c.due;
const course = { moduleIds: [] };

describe("cardsInScope", () => {
  it("keeps the exam's modules, everything for an empty scope", () => {
    const cards = [card("a", { moduleId: "m1" }), card("b", { moduleId: "m2" })];
    expect(cardsInScope(cards, ["m2"]).map((c) => c.uuid)).toEqual(["b"]);
    expect(cardsInScope(cards, [])).toEqual(cards);
    expect(cardsInScope(cards, undefined)).toEqual(cards);
    expect(cardsInScope(null, ["m1"])).toEqual([]);
  });
});

describe("isExamReady", () => {
  it("is ready from the ready grade up, never when unrated", () => {
    expect(isExamReady(card("a", { grade: 3 }))).toBe(true);
    expect(isExamReady(card("a", { grade: 2 }))).toBe(false);
    expect(isExamReady(card("a"))).toBe(false);
  });
});

describe("pickExamCards", () => {
  it("only picks cards in the exam's scope", () => {
    const cards = [...many("a", 12, { moduleId: "m1", due: true }), ...many("b", 12, { moduleId: "m2", due: true })];
    const picked = pickExamCards(cards, { moduleIds: ["m1"] }, { isDue });
    expect(picked).toHaveLength(12);
    expect(picked.every((id) => id.startsWith("a"))).toBe(true);
  });

  it("treats an empty module list as the whole course", () => {
    const cards = [...many("a", 6, { moduleId: "m1", due: true }), ...many("b", 6, { moduleId: "m2", due: true })];
    expect(pickExamCards(cards, course, { isDue })).toHaveLength(12);
  });

  it("caps due cards at max and adds nothing else", () => {
    const cards = [...many("d", 25, { due: true }), ...many("n", 5)];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
    expect(picked.every((id) => id.startsWith("d"))).toBe(true);
  });

  it("tops up to min with not-ready cards: never rated first, then lowest grade", () => {
    const cards = [
      ...many("d", 3, { due: true, grade: 4 }),
      card("g2", { grade: 2 }),
      card("new1"),
      card("g0", { grade: 0 }),
      card("new2"),
      card("g1", { grade: 1 }),
      ...many("r", 4, { grade: 4 }),
      card("g1b", { grade: 1 }),
      card("g2b", { grade: 2 }),
    ];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(10);
    expect(new Set(picked.slice(0, 3))).toEqual(new Set(["d0", "d1", "d2"]));
    expect(picked.slice(3)).toEqual(["new1", "new2", "g0", "g1", "g1b", "g2", "g2b"]);
  });

  it("stops topping up at min", () => {
    const cards = [...many("d", 2, { due: true }), ...many("n", 12, { grade: 1 })];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(10);
    expect(picked.slice(2)).toEqual(["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7"]);
  });

  it("leaves ready cards out when the scope runs out of not-ready ones", () => {
    const cards = [...many("d", 2, { due: true }), card("low", { grade: 1 }), ...many("r", 10, { grade: 5 })];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked).toHaveLength(3);
    expect(picked[2]).toBe("low");
  });

  it("runs a scope smaller than min whole, due first", () => {
    const cards = [card("r", { grade: 5 }), card("d", { due: true }), card("n")];
    const picked = pickExamCards(cards, course, { isDue });
    expect(picked[0]).toBe("d");
    expect(new Set(picked)).toEqual(new Set(["r", "d", "n"]));
  });

  it("returns [] for an empty scope", () => {
    expect(pickExamCards([card("a", { moduleId: "m1" })], { moduleIds: ["m9"] }, { isDue })).toEqual([]);
    expect(pickExamCards([], course, { isDue })).toEqual([]);
  });
});

describe("examOpening", () => {
  const base = { title: "Midterm", total: 40, due: 12, readyPct: 46 };

  it("picks the day variant", () => {
    expect(examOpening({ ...base, daysUntil: 0 }).key).toBe("examOpenToday");
    expect(examOpening({ ...base, daysUntil: 1 }).key).toBe("examOpenTomorrow");
    expect(examOpening({ ...base, daysUntil: 5 }).key).toBe("examOpen");
  });

  it("passes the facts through as vars", () => {
    expect(examOpening({ ...base, daysUntil: 5 }).vars).toEqual({ title: "Midterm", days: 5, total: 40, due: 12, ready: 46 });
  });
});

describe("examEnd", () => {
  it("is ready at the target, up when ready rose, flat otherwise", () => {
    expect(examEnd({ title: "Midterm", before: 70, after: 85 })).toEqual({ key: "examEndReady", vars: { title: "Midterm", before: 70, after: 85 } });
    expect(examEnd({ title: "Midterm", before: 70, after: EXAM_READY_TARGET }).key).toBe("examEndReady");
    expect(examEnd({ title: "Midterm", before: 46, after: 58 }).key).toBe("examEndUp");
    expect(examEnd({ title: "Midterm", before: 50, after: 50 }).key).toBe("examEndFlat");
    expect(examEnd({ title: "Midterm", before: 60, after: 55 }).key).toBe("examEndFlat");
  });
});

describe("examNextStep", () => {
  it("says exam-ready at the target", () => {
    expect(examNextStep({ readyPct: 85, daysUntil: 5, notReady: 6, secondsPerCard: 8 })).toEqual({
      kind: "ready",
      text: "Exam-ready. One light pass the day before.",
    });
  });

  it("says exam today on exam day, even when ready", () => {
    expect(examNextStep({ readyPct: 40, daysUntil: 0, notReady: 30, secondsPerCard: 8 })).toEqual({
      kind: "today",
      text: "Exam today. Quick pass on misses only.",
    });
    expect(examNextStep({ readyPct: 90, daysUntil: 0, notReady: 2, secondsPerCard: 8 }).kind).toBe("today");
  });

  it("splits not-ready cards over the days left at the session's pace", () => {
    expect(examNextStep({ readyPct: 46, daysUntil: 3, notReady: 30, secondsPerCard: 12 })).toEqual({
      kind: "next",
      cards: 10,
      minutes: 2,
      text: "Next: tomorrow, ~10 cards (2 min)",
    });
  });

  it("clamps to 5-20 cards and falls back to 10 s per card", () => {
    expect(examNextStep({ readyPct: 70, daysUntil: 10, notReady: 3, secondsPerCard: null })).toMatchObject({ cards: 5, minutes: 1 });
    expect(examNextStep({ readyPct: 10, daysUntil: 2, notReady: 100, secondsPerCard: 0 })).toMatchObject({ cards: 20, minutes: 4 });
  });
});
