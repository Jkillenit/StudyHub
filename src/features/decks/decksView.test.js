import { describe, expect, it } from "vitest";
import { buildDecksView } from "./decksView.js";

const TODAY = new Date(2026, 9, 5, 9, 0);
const examIn = (n) => new Date(2026, 9, 5 + n, 10, 0).toISOString();
const mastered = { repetitions: 4, easeFactor: 2.5 };
const cards = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, ...extra }));

const course = (id, n = 4, extra) => ({ id, name: id.toUpperCase(), cards: cards(n, extra) });

describe("buildDecksView", () => {
  it("totals due cards and estimates minutes, 30s per card by default, rounded up", () => {
    const view = buildDecksView({
      courses: [course("a"), course("b")],
      dueByCourse: { a: 3, b: 2 },
      exams: {},
      today: TODAY,
    });
    expect(view.totalDue).toBe(5);
    expect(view.minutes).toBe(3);
  });

  it("uses the student's own pace when given", () => {
    const view = buildDecksView({ courses: [course("a")], dueByCourse: { a: 10 }, exams: {}, avgSecondsPerCard: 12, today: TODAY });
    expect(view.minutes).toBe(2);
  });

  it("sorts groups by soonest exam, then most due; courses without exams last", () => {
    const view = buildDecksView({
      courses: [course("none"), course("late"), course("soon"), course("none2")],
      dueByCourse: { none: 1, late: 0, soon: 0, none2: 9 },
      exams: { late: [{ dueDate: examIn(10) }], soon: [{ dueDate: examIn(2) }] },
      today: TODAY,
    });
    expect(view.groups.map((g) => g.courseId)).toEqual(["soon", "late", "none2", "none"]);
  });

  it("labels the nearest upcoming exam and ignores past ones", () => {
    const view = buildDecksView({
      courses: [course("a")],
      dueByCourse: { a: 1 },
      exams: { a: [{ dueDate: examIn(-2) }, { dueDate: examIn(9) }, { dueDate: examIn(5) }] },
      today: TODAY,
    });
    expect(view.groups[0].examLabel).toBe("EXAM IN 5 D");
    expect(view.groups[0].rows[0].examDays).toBe(5);
  });

  it("says EXAM TODAY on exam day", () => {
    const view = buildDecksView({ courses: [course("a")], dueByCourse: { a: 1 }, exams: { a: [{ dueDate: examIn(0) }] }, today: TODAY });
    expect(view.groups[0].examLabel).toBe("EXAM TODAY");
  });

  it("works with no exams at all", () => {
    const view = buildDecksView({ courses: [course("a")], dueByCourse: { a: 2 }, today: TODAY });
    expect(view.groups[0]).toMatchObject({ courseId: "a", name: "A", examLabel: null });
    expect(view.groups[0].rows[0]).toMatchObject({ due: 2, total: 4, examDays: null });
  });

  it("computes mastery as the share of mastered cards", () => {
    const c = { id: "a", name: "A", cards: [...cards(1, mastered), ...cards(3)] };
    const view = buildDecksView({ courses: [c], dueByCourse: { a: 0 }, today: TODAY });
    expect(view.groups[0].rows[0].mastery).toBe(0.25);
  });

  it("picks the course with the most due as urgent; ties go to the soonest exam", () => {
    const view = buildDecksView({
      courses: [course("a"), course("b"), course("c")],
      dueByCourse: { a: 5, b: 5, c: 2 },
      exams: { a: [{ dueDate: examIn(8) }], b: [{ dueDate: examIn(3) }] },
      today: TODAY,
    });
    expect(view.urgentCourseId).toBe("b");
  });

  it("an exam beats no exam in an urgent tie", () => {
    const view = buildDecksView({
      courses: [course("a"), course("b")],
      dueByCourse: { a: 4, b: 4 },
      exams: { b: [{ dueDate: examIn(20) }] },
      today: TODAY,
    });
    expect(view.urgentCourseId).toBe("b");
  });

  it("has no urgent course and zero minutes when nothing is due", () => {
    const view = buildDecksView({ courses: [course("a")], dueByCourse: {}, today: TODAY });
    expect(view).toMatchObject({ totalDue: 0, minutes: 0, urgentCourseId: null });
    expect(view.groups[0].rows[0].due).toBe(0);
  });

  it("drops courses with no cards", () => {
    const view = buildDecksView({ courses: [course("a", 0)], dueByCourse: { a: 0 }, today: TODAY });
    expect(view.groups).toEqual([]);
  });
});
