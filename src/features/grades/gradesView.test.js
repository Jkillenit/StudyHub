import { describe, expect, it } from "vitest";
import { buildGradesView, gradeTrend } from "./gradesView.js";

const NOW = new Date(2026, 8, 30, 9, 0).toISOString();
const at = (dayOffset) => new Date(2026, 8, 30 + dayOffset, 23, 59).toISOString();

const comp = (uuid, name, weight, score = null, category = "other") => ({ uuid, name, weight, category, score, pointsTotal: 0, itemCount: 0 });

function course(overrides = {}) {
  return { uuid: "c1", name: "MIS 430", courseCode: "MIS 430", targetGrade: 80, components: [], assignments: [], ...overrides };
}

const midterm = { uuid: "mid", title: "Midterm", kind: "exam", dueDate: at(5), score: null, pointsPossible: null, componentUuid: "m" };

const item = (componentUuid, score, points, gradedAt, extra = {}) => ({
  componentUuid,
  score,
  points_possible: points,
  graded_at: gradedAt,
  synced_at: "2026-09-29 12:00:00",
  excluded: false,
  ...extra,
});

describe("buildGradesView", () => {
  it("flags a course under target and says what the next exam needs", () => {
    const c = course({
      components: [comp("h", "Homework", 0.4, 75), comp("m", "Midterm", 0.3, null, "exam"), comp("f", "Final", 0.3, null, "exam")],
      assignments: [midterm],
    });
    const [row] = buildGradesView([c], { now: NOW });
    expect(row).toMatchObject({ courseId: "c1", name: "MIS 430", current: 75, letter: "C", atRisk: true });
    expect(row.nextStep).toBe("Need 91.7 on Midterm to reach B");
  });

  it("says when even a perfect score on the next item won't reach the target", () => {
    const c = course({
      components: [comp("h", "Homework", 0.4, 60), comp("m", "Midterm", 0.3, null, "exam"), comp("f", "Final", 0.3, null, "exam")],
      assignments: [midterm],
    });
    expect(buildGradesView([c], { now: NOW })[0].nextStep).toBe("Even 100 on Midterm won't reach B");
  });

  it("falls back to the average needed on open work when no item has a known weight", () => {
    const c = course({ components: [comp("h", "Homework", 0.5, 70), comp("p", "Project", 0.5)] });
    expect(buildGradesView([c], { now: NOW })[0].nextStep).toBe("Need 90 average on what's left to reach B");
  });

  it("reports on track at or above target", () => {
    const c = course({ components: [comp("h", "Homework", 0.5, 88), comp("m", "Midterm", 0.5, null, "exam")], assignments: [midterm] });
    const [row] = buildGradesView([c], { now: NOW });
    expect(row).toMatchObject({ current: 88, letter: "B", atRisk: false, nextStep: "On track for B" });
  });

  it("uses the course grading scale for letters", () => {
    const c = course({ components: [comp("h", "Homework", 1, 81)] });
    const scale = { A: 93, "A-": 90, "B+": 87, B: 83, "B-": 80, C: 70 };
    const [row] = buildGradesView([c], { now: NOW, scales: { c1: scale } });
    expect(row.letter).toBe("B-");
    expect(row.nextStep).toBe("On track for B-");
  });

  it("has no grade, letter, risk or next step before anything is graded", () => {
    const c = course({ components: [comp("h", "Homework", 0.5), comp("m", "Midterm", 0.5)], assignments: [midterm] });
    expect(buildGradesView([c], { now: NOW })[0]).toMatchObject({ current: null, letter: null, atRisk: false, nextStep: null, trend: [] });
  });

  it("lists at-risk courses first, then on track, then ungraded, by name within each", () => {
    const view = buildGradesView(
      [
        course({ uuid: "a", name: "ACC 201", components: [] }),
        course({ uuid: "b", name: "BUS 300", components: [comp("h", "Homework", 1, 95)] }),
        course({ uuid: "z", name: "ZOO 100", components: [comp("h", "Homework", 1, 70)] }),
        course({ uuid: "m", name: "MKT 310", components: [comp("h", "Homework", 1, 60)] }),
      ],
      { now: NOW }
    );
    expect(view.map((r) => r.courseId)).toEqual(["m", "z", "b", "a"]);
  });

  it("attaches each course's trend from its grade items", () => {
    const c = course({ components: [comp("h", "Homework", 0.5, 85), comp("q", "Quizzes", 0.5, 60)] });
    const items = [item("q", 6, 10, "2026-09-05T10:00:00Z"), item("h", 9, 10, "2026-09-10T10:00:00Z")];
    expect(buildGradesView([c], { now: NOW, gradeItems: { c1: items } })[0].trend).toEqual([60, 75]);
  });
});

describe("gradeTrend", () => {
  const components = [comp("h", "Homework", 0.5, 85), comp("q", "Quizzes", 0.5, 60)];

  it("is the running grade after each graded item in graded order", () => {
    const items = [
      item("h", 8, 10, "2026-09-20T10:00:00Z"),
      item("q", 6, 10, "2026-09-05T10:00:00Z"),
      item("h", 9, 10, "2026-09-10T10:00:00Z"),
    ];
    expect(gradeTrend(components, items)).toEqual([60, 75, 72.5]);
  });

  it("skips excluded, unmapped, ungraded and pointless items", () => {
    const items = [
      item("q", 6, 10, "2026-09-05T10:00:00Z"),
      item("h", 1, 10, "2026-09-06T10:00:00Z", { excluded: true }),
      item(null, 1, 10, "2026-09-07T10:00:00Z"),
      item("h", null, 10, "2026-09-08T10:00:00Z"),
      item("h", 5, 0, "2026-09-09T10:00:00Z"),
      item("gone", 5, 10, "2026-09-09T11:00:00Z"),
      item("h", 9, 10, "2026-09-10T10:00:00Z"),
    ];
    expect(gradeTrend(components, items)).toEqual([60, 75]);
  });

  it("orders by sync time when an item has no graded date", () => {
    const items = [item("h", 9, 10, null, { synced_at: "2026-09-12 08:00:00" }), item("q", 6, 10, "2026-09-05T10:00:00Z")];
    expect(gradeTrend(components, items)).toEqual([60, 75]);
  });

  it("holds manually scored components with no items constant", () => {
    const items = [item("q", 6, 10, "2026-09-05T10:00:00Z"), item("q", 10, 10, "2026-09-06T10:00:00Z")];
    expect(gradeTrend(components, items)).toEqual([72.5, 82.5]);
  });

  it("is empty without graded items", () => {
    expect(gradeTrend(components, [])).toEqual([]);
    expect(gradeTrend(components, undefined)).toEqual([]);
  });
});
