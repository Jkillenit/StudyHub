import { describe, expect, it } from "vitest";
import { deriveMemory, hourLabel, memoryMap, sessionMinutes, streaks, studyTimes, topCourse, topics } from "./derive.js";

const at = (day, h, m = 0) => new Date(2026, 8, day, h, m).toISOString();
const session = (day, h, minutes = 20, extra = {}) => ({
  started_at: at(day, h),
  ended_at: new Date(new Date(2026, 8, day, h).getTime() + minutes * 60000).toISOString(),
  cards_reviewed: 10,
  correct: 8,
  ...extra,
});

describe("topCourse", () => {
  it("names the most-studied course once there are three sessions", () => {
    const cs = { course_uuid: "c1", course_code: "CS 101" };
    expect(topCourse([session(1, 20, 20, cs), session(2, 20, 20, cs)])).toBeNull();
    const top = topCourse([session(1, 20, 20, cs), session(2, 20, 20, cs), session(3, 20, 20, cs), session(4, 20)]);
    expect(top).toMatchObject({ courseUuid: "c1", sessions: 3 });
  });
});

describe("studyTimes", () => {
  it("needs five sessions", () => {
    expect(studyTimes([session(1, 22), session(2, 22)])).toBeNull();
  });

  it("treats after-midnight starts as late evening", () => {
    const t = studyTimes([session(1, 22), session(2, 23), session(3, 1), session(4, 0), session(5, 22)]);
    expect(t.after).toBe(22);
    expect(t.typical).toBeGreaterThanOrEqual(23);
    expect(hourLabel(t.after)).toBe("10pm");
  });
});

describe("sessionMinutes", () => {
  it("is the median, ignoring blips and capping marathons", () => {
    const list = [session(1, 9, 10), session(2, 9, 20), session(3, 9, 25), session(4, 9, 600), session(5, 9, 30), session(6, 9, 0.1)];
    expect(sessionMinutes(list)).toBe(25);
  });
});

describe("streaks", () => {
  const now = new Date(2026, 8, 10, 12);
  it("counts the current run through yesterday and the best ever", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-08", "2026-09-09"];
    expect(streaks(days, now)).toEqual({ current: 2, best: 4 });
  });

  it("drops the current streak after a missed day", () => {
    expect(streaks(["2026-09-07", "2026-09-08"], now).current).toBe(0);
  });
});

describe("topics", () => {
  it("picks the most-missed module as weak and a clean one as strong", () => {
    const rows = [
      { module_uuid: "m6", title: "Chapter 6", course_uuid: "c1", course_code: "OM 300", reviews: 20, misses: 9 },
      { module_uuid: "m2", title: "Chapter 2", course_uuid: "c1", course_code: "OM 300", reviews: 20, misses: 1 },
      { module_uuid: "m3", title: "Chapter 3", course_uuid: "c1", course_code: "OM 300", reviews: 20, misses: 5 },
    ];
    const { weak, strong } = topics(rows);
    expect(weak).toMatchObject({ topic: "Chapter 6", missPct: 45 });
    expect(strong).toMatchObject({ topic: "Chapter 2" });
  });

  it("claims nothing when no module is clearly weak", () => {
    expect(topics([{ module_uuid: "a", title: "A", reviews: 10, misses: 2 }]).weak).toBeNull();
  });
});

describe("deriveMemory", () => {
  const course = (current, target = 80) => ({
    uuid: "c1",
    name: "MIS 430",
    courseCode: "MIS 430",
    targetGrade: target,
    components: [{ uuid: "k", name: "Exams", weight: 100, score: current }],
    assignments: [],
  });
  const now = new Date(2026, 8, 30, 20);

  it("reports a comeback when a course crosses back over target", () => {
    const memory = memoryMap([{ key: "standing:c1", value: { below: true, current: 76, target: 80 } }]);
    const { entries, news } = deriveMemory({ facts: { sessions: [] }, today: { courses: [course(82)] }, memory, now });
    expect(news.find((n) => n.type === "comeback")).toMatchObject({ course: "MIS 430", current: 82, target: 80 });
    expect(entries.find((e) => e.key === "standing:c1").value.below).toBe(false);
    expect(news.some((n) => n.type === "milestone" && n.id === "first_comeback")).toBe(true);
  });

  it("never writes muted facts", () => {
    const memory = memoryMap([{ key: "weak_topic", value: null, muted: true }]);
    const facts = { sessions: [], topics: [{ module_uuid: "m", title: "Ch 6", reviews: 10, misses: 8 }] };
    const { entries } = deriveMemory({ facts, today: { courses: [] }, memory, now });
    expect(entries.some((e) => e.key === "weak_topic")).toBe(false);
  });

  it("fires each milestone once", () => {
    const facts = { sessions: [], totals: { cards: 120 } };
    const first = deriveMemory({ facts, today: { courses: [] }, memory: {}, now });
    expect(first.news).toContainEqual(expect.objectContaining({ type: "milestone", id: "cards100" }));
    const memory = memoryMap(first.entries.map((e) => ({ ...e })));
    const second = deriveMemory({ facts, today: { courses: [] }, memory, now });
    expect(second.news.some((n) => n.id === "cards100")).toBe(false);
  });

  it("lists courses under target", () => {
    const { entries } = deriveMemory({ facts: { sessions: [] }, today: { courses: [course(74)] }, memory: {}, now });
    expect(entries.find((e) => e.key === "below_target").value.courses[0]).toMatchObject({ course: "MIS 430", current: 74 });
  });
});
