import { describe, expect, it } from "vitest";
import {
  ITEM_TYPES,
  PRIORITY_CONFIG,
  courseStanding,
  daysUntil,
  itemShare,
  neededScores,
  rankToday,
  riskFactor,
  urgency,
} from "./priority.js";

const NOW = new Date(2026, 9, 5, 9, 0).toISOString();
const inDays = (n, hour = 23) => new Date(2026, 9, 5 + n, hour, 59).toISOString();

let seq = 0;
function asg(overrides = {}) {
  seq += 1;
  return {
    uuid: `a${seq}`,
    title: `Item ${seq}`,
    kind: "assignment",
    dueDate: inDays(3),
    score: null,
    pointsPossible: null,
    url: null,
    componentUuid: null,
    ...overrides,
  };
}

function course(overrides = {}) {
  return {
    uuid: "c1",
    name: "OM 300",
    courseCode: "OM 300",
    targetGrade: 80,
    cardsTotal: 0,
    cardsDue: 0,
    components: [],
    assignments: [],
    ...overrides,
  };
}

const rank = (courses) => rankToday({ now: NOW, courses });

describe("daysUntil", () => {
  it("counts local calendar days, not 24h blocks", () => {
    expect(daysUntil(new Date(2026, 9, 5, 23, 59).toISOString(), NOW)).toBe(0);
    expect(daysUntil(new Date(2026, 9, 6, 0, 1).toISOString(), NOW)).toBe(1);
    expect(daysUntil(new Date(2026, 9, 4, 12).toISOString(), NOW)).toBe(-1);
  });

  it("returns null for missing or invalid dates", () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil("not a date", NOW)).toBeNull();
  });
});

describe("urgency", () => {
  it("decays with distance and is highest when overdue", () => {
    expect(urgency(0)).toBe(1);
    expect(urgency(2)).toBeCloseTo(0.5);
    expect(urgency(14)).toBeCloseTo(0.125);
    expect(urgency(-1)).toBe(PRIORITY_CONFIG.overdueUrgency);
    expect(urgency(1)).toBeGreaterThan(urgency(5));
  });
});

describe("risk", () => {
  it("is neutral without scores or when at/above target", () => {
    expect(riskFactor(courseStanding(course()))).toBe(1);
    const above = course({ components: [{ uuid: "x", weight: 1, score: 92 }] });
    expect(riskFactor(courseStanding(above))).toBe(1);
  });

  it("uses the gap when nothing is open, and is capped", () => {
    const under = course({ components: [{ uuid: "x", weight: 1, score: 70 }] });
    expect(riskFactor(courseStanding(under))).toBeCloseTo(1 + 10 * PRIORITY_CONFIG.riskPerPoint);
    const deep = course({ components: [{ uuid: "x", weight: 1, score: 10 }] });
    expect(riskFactor(courseStanding(deep))).toBe(PRIORITY_CONFIG.maxRisk);
  });
});

describe("needed score feeds risk", () => {
  it("rises late in the term at the same gap", () => {
    const early = course({ components: [{ uuid: "a", weight: 0.2, score: 75 }, { uuid: "b", weight: 0.8, score: null }] });
    const late = course({ components: [{ uuid: "a", weight: 0.8, score: 75 }, { uuid: "b", weight: 0.2, score: null }] });
    expect(courseStanding(early).gap).toBeCloseTo(courseStanding(late).gap);
    expect(riskFactor(courseStanding(late))).toBeGreaterThan(riskFactor(courseStanding(early)));
  });

  it("normalizes weights that don't sum to 100%", () => {
    const partial = course({ components: [{ uuid: "a", weight: 0.3, score: 70 }, { uuid: "b", weight: 0.6, score: null }] });
    expect(courseStanding(partial).neededAvg).toBeCloseTo((80 - 70 / 3) / (2 / 3));
  });
});

describe("neededScores", () => {
  const components = [
    { uuid: "hw", name: "Homework", category: "homework", weight: 0.3, score: 76, pointsTotal: 0, itemCount: 0 },
    { uuid: "mid", name: "Midterm", category: "exam", weight: 0.3, score: null, pointsTotal: 0, itemCount: 0 },
    { uuid: "fin", name: "Final Exam", category: "exam", weight: 0.4, score: null, pointsTotal: 0, itemCount: 0 },
  ];

  it("finds the next major item and the final", () => {
    const c = course({
      components,
      assignments: [
        asg({ title: "HW 5", componentUuid: "hw", dueDate: inDays(1) }),
        asg({ title: "Midterm", kind: "exam", componentUuid: "mid", dueDate: inDays(5) }),
        asg({ title: "Final Exam", kind: "exam", componentUuid: "fin", dueDate: inDays(40) }),
      ],
    });
    const n = neededScores(c, { now: NOW });
    expect(n.current).toBeCloseTo(76);
    expect(n.next.title).toBe("Midterm");
    expect(n.next.needed).toBeCloseTo(76 + 4 / 0.3);
    expect(n.final.title).toBe("Final Exam");
    expect(n.final.needed).toBeCloseTo(86);
  });

  it("falls back to a final component with no dated assignment", () => {
    const n = neededScores(course({ components }), { now: NOW });
    expect(n.next).toBeNull();
    expect(n.final).toMatchObject({ uuid: null, title: "Final Exam" });
    expect(n.final.needed).toBeCloseTo(86);
  });

  it("doesn't project from a guessed weight or from no scores", () => {
    const guessed = neededScores(course({ components, assignments: [asg({ kind: "exam", title: "Exam 2", dueDate: inDays(3) })] }), { now: NOW });
    expect(guessed.next.title).toBe("Exam 2");
    expect(guessed.next.needed).toBeNull();

    const unscored = components.map((c) => ({ ...c, score: null }));
    expect(neededScores(course({ components: unscored }), { now: NOW }).final.needed).toBeNull();
  });

  it("puts the needed score on the Today item and the grade-risk reason", () => {
    const c = course({
      components,
      assignments: [asg({ title: "Midterm", kind: "exam", componentUuid: "mid", dueDate: inDays(5) })],
    });
    const items = rank([c]);
    const exam = items.find((i) => i.type === ITEM_TYPES.EXAM_PREP);
    expect(exam.needed).toBeCloseTo(89.33, 1);
    expect(exam.reason).toContain("need 89.3% to hold 80%");
    const risk = items.find((i) => i.type === ITEM_TYPES.GRADE_RISK);
    expect(risk.reason).toContain("need 89.3% on Midterm");
  });

  it("flags an unreachable target", () => {
    const c = course({
      targetGrade: 95,
      components: [{ uuid: "a", name: "Work", weight: 0.9, score: 80 }, { uuid: "b", name: "Last", weight: 0.1, score: null }],
    });
    const risk = rank([c]).find((i) => i.type === ITEM_TYPES.GRADE_RISK);
    expect(risk.reason).toContain("out of reach");
    expect(risk.needed).toBeGreaterThan(100);
  });
});

describe("itemShare", () => {
  const components = [
    { uuid: "hw", name: "Homework", weight: 0.2, pointsTotal: 100, itemCount: 10 },
    { uuid: "ex", name: "Exams", weight: 0.5, pointsTotal: 0, itemCount: 2 },
    { uuid: "fin", name: "Final", weight: 0.3, pointsTotal: 0, itemCount: 0 },
  ];
  const c = course({ components });

  it("splits a component by points when known", () => {
    expect(itemShare(asg({ componentUuid: "hw", pointsPossible: 10 }), c).share).toBeCloseTo(0.02);
  });

  it("splits evenly across items without points", () => {
    expect(itemShare(asg({ componentUuid: "ex" }), c).share).toBeCloseTo(0.25);
  });

  it("assumes a minimum item count per category when points are unknown", () => {
    const sparse = course({ components: [{ uuid: "hw", name: "Homework", category: "homework", weight: 0.3, pointsTotal: 0, itemCount: 2 }] });
    expect(itemShare(asg({ componentUuid: "hw" }), sparse).share).toBeCloseTo(1 / PRIORITY_CONFIG.minItemsPerComponent.homework);
  });

  it("rescales weights that sum to under 100%", () => {
    const under = course({ components: [
      { uuid: "a", name: "A", weight: 0.4, pointsTotal: 0, itemCount: 1 },
      { uuid: "b", name: "B", weight: 0.4, pointsTotal: 0, itemCount: 1 },
    ] });
    expect(itemShare(asg({ componentUuid: "b" }), under).share).toBeCloseTo(0.5);
  });

  it("uses the whole weight for a single-item component", () => {
    expect(itemShare(asg({ componentUuid: "fin" }), c).share).toBeCloseTo(0.3);
  });

  it("falls back to the kind default when unmatched", () => {
    const res = itemShare(asg({ kind: "quiz" }), c);
    expect(res).toEqual({ share: PRIORITY_CONFIG.defaultShare.quiz, known: false });
  });
});

describe("rankToday", () => {
  it("filters by horizon and overdue window", () => {
    const items = rank([
      course({
        assignments: [
          asg({ title: "soon", dueDate: inDays(2) }),
          asg({ title: "far", dueDate: inDays(PRIORITY_CONFIG.horizonDays + 1) }),
          asg({ title: "late", dueDate: inDays(-2) }),
          asg({ title: "ancient", dueDate: inDays(-(PRIORITY_CONFIG.overdueWindowDays + 1)) }),
          asg({ title: "graded", dueDate: inDays(1), score: 9 }),
        ],
      }),
    ]);
    expect(items.map((i) => i.title).sort()).toEqual(["late", "soon"]);
  });

  it("turns exams into EXAM_PREP only, never ASSIGNMENT, and drops past exams", () => {
    const items = rank([
      course({
        assignments: [asg({ uuid: "mid", kind: "exam", title: "Midterm", dueDate: inDays(5) }), asg({ kind: "exam", dueDate: inDays(-1) })],
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(ITEM_TYPES.EXAM_PREP);
    expect(items[0].action).toEqual({ type: "review", courseUuid: "c1", examUuid: "mid", label: "START REVIEW" });
  });

  it("keeps quizzes as ASSIGNMENT items", () => {
    const items = rank([course({ assignments: [asg({ kind: "quiz", url: "https://x.blackboard.com/q" })] })]);
    expect(items[0].type).toBe(ITEM_TYPES.ASSIGNMENT);
    expect(items[0].action).toMatchObject({ type: "blackboard", url: "https://x.blackboard.com/q" });
  });

  it("ranks sooner over later at equal weight", () => {
    const items = rank([course({ assignments: [asg({ title: "later", dueDate: inDays(6) }), asg({ title: "sooner", dueDate: inDays(1) })] })]);
    expect(items.map((i) => i.title)).toEqual(["sooner", "later"]);
  });

  it("ranks heavier over lighter at equal date", () => {
    const components = [
      { uuid: "hw", name: "Homework", weight: 0.1, pointsTotal: 0, itemCount: 10 },
      { uuid: "pr", name: "Project", weight: 0.3, pointsTotal: 0, itemCount: 1 },
      { uuid: "ex", name: "Exams", weight: 0.6, pointsTotal: 0, itemCount: 2 },
    ];
    const items = rank([
      course({
        components,
        assignments: [asg({ title: "hw", componentUuid: "hw" }), asg({ title: "project", componentUuid: "pr" })],
      }),
    ]);
    expect(items.map((i) => i.title)).toEqual(["project", "hw"]);
    expect(items[0].reason).toContain("worth 30% of grade");
  });

  it("adds GRADE_RISK only when under target with weight still open", () => {
    const under = course({
      components: [
        { uuid: "a", name: "Homework", weight: 0.4, score: 70 },
        { uuid: "b", name: "Final", weight: 0.6, score: null },
      ],
    });
    const risk = rank([under]).find((i) => i.type === ITEM_TYPES.GRADE_RISK);
    expect(risk).toBeTruthy();
    expect(risk.action.type).toBe("grades");
    expect(risk.reason).toContain("10 pts under your 80% target");

    const finished = course({ components: [{ uuid: "a", name: "All", weight: 1, score: 70 }] });
    expect(rank([finished]).some((i) => i.type === ITEM_TYPES.GRADE_RISK)).toBe(false);
    expect(rank([{ ...under, targetGrade: 65 }]).some((i) => i.type === ITEM_TYPES.GRADE_RISK)).toBe(false);
  });

  it("reorders when a target changes", () => {
    const components = [
      { uuid: "hw", name: "Homework", weight: 0.5, score: 78, pointsTotal: 0, itemCount: 0 },
      { uuid: "q", name: "Quizzes", weight: 0.5, score: null, pointsTotal: 0, itemCount: 5 },
    ];
    const a = course({ uuid: "A", name: "A", components, assignments: [asg({ title: "A quiz", componentUuid: "q", dueDate: inDays(4) })] });
    const b = course({ uuid: "B", name: "B", components, assignments: [asg({ title: "B quiz", componentUuid: "q", dueDate: inDays(3) })] });

    const top = (courses) => rank(courses).filter((i) => i.type === ITEM_TYPES.ASSIGNMENT)[0].title;
    expect(top([{ ...a, targetGrade: 75 }, { ...b, targetGrade: 75 }])).toBe("B quiz");
    expect(top([{ ...a, targetGrade: 95 }, { ...b, targetGrade: 75 }])).toBe("A quiz");
  });

  it("gives every item a reason and an action", () => {
    const items = rank([
      course({
        cardsDue: 12,
        cardsTotal: 40,
        components: [{ uuid: "a", name: "HW", weight: 0.5, score: 60 }, { uuid: "b", name: "Final", weight: 0.5, score: null }],
        assignments: [asg(), asg({ kind: "exam", dueDate: inDays(1) })],
      }),
    ]);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.reason.length).toBeGreaterThan(0);
      expect(item.action?.label).toBeTruthy();
    }
    expect(items.find((i) => i.type === ITEM_TYPES.EXAM_PREP).reason).toContain("12 cards due");
  });

  it("uses exam-scoped card stats over the course-wide count", () => {
    const withStats = (examCards) =>
      rank([course({ cardsDue: 12, cardsTotal: 40, assignments: [asg({ kind: "exam", dueDate: inDays(4), examCards })] })])[0];
    const exam = withStats({ total: 20, due: 3, ready: 45 });
    expect(exam.reason).toContain("3 cards due");
    expect(exam.reason).toContain("45% exam ready");
    expect(exam.reason).not.toContain("12 cards");
    expect(exam.examReady).toBe(45);
    expect(withStats({ total: 20, due: 0, ready: 100 }).reason).not.toContain("due ·");
    const empty = withStats({ total: 0, due: 0, ready: 0 });
    expect(empty.reason).toContain("no flashcards yet");
    expect(empty.examReady).toBeNull();
  });

  it("handles empty input", () => {
    expect(rankToday({ courses: [] })).toEqual([]);
    expect(rankToday(null)).toEqual([]);
  });
});
