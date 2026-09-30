import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { diffCourse, dueSoon, parseCost } = createRequire(import.meta.url)("./bbWatcher.cjs");

const NOW = Date.parse("2026-10-01T12:00:00Z");
const payload = {
  announcements: [{ id: "a1", title: "Exam moved", postedAt: "2026-10-01T09:00:00Z" }],
  gradeItems: [
    { id: "g1", name: "Quiz 1", score: 8, pointsPossible: 10 },
    { id: "g2", name: "Quiz 2", score: null, pointsPossible: 10 },
  ],
  assignments: [{ id: "x1", title: "HW 1", dueDate: "2026-10-03T23:59:00Z" }],
};
const apply = (writes, known = new Map()) => new Map([...known, ...writes]);

describe("diffCourse", () => {
  it("seeds silently on a course's first check", () => {
    const { events, writes } = diffCourse({ courseUuid: "c", payload, known: new Map(), seeded: false, now: NOW });
    expect(events).toEqual([]);
    expect(writes.map(([k]) => k).sort()).toEqual(["ann:c:a1", "asg:c:x1", "due:c:x1", "grade:c:g1"]);
  });

  it("reports nothing when nothing changed", () => {
    const known = apply(diffCourse({ courseUuid: "c", payload, known: new Map(), seeded: false, now: NOW }).writes);
    expect(diffCourse({ courseUuid: "c", payload, known, seeded: true, now: NOW })).toEqual({ events: [], writes: [] });
  });

  it("reports new grades, changed grades, new items and moved due dates", () => {
    const known = apply(diffCourse({ courseUuid: "c", payload, known: new Map(), seeded: false, now: NOW }).writes);
    const next = {
      announcements: [...payload.announcements, { id: "a2", title: "Office hours", postedAt: "2026-10-01T11:00:00Z" }],
      gradeItems: [
        { id: "g1", name: "Quiz 1", score: 9, pointsPossible: 10 },
        { id: "g2", name: "Quiz 2", score: 7, pointsPossible: 10 },
      ],
      assignments: [
        { id: "x1", title: "HW 1", dueDate: "2026-10-05T23:59:00Z" },
        { id: "x2", title: "HW 2", dueDate: "2026-10-08T23:59:00Z" },
      ],
    };
    const { events } = diffCourse({ courseUuid: "c", payload: next, known, seeded: true, now: NOW });
    expect(events.map((e) => [e.kind, e.bbId, e.changed ?? null])).toEqual([
      ["announcement", "a2", null],
      ["grade", "g1", true],
      ["grade", "g2", false],
      ["dueChanged", "x1", null],
      ["assignment", "x2", null],
    ]);
  });

  it("records but doesn't announce stale announcements", () => {
    const known = new Map([["seed:c:", "1"]]);
    const old = { announcements: [{ id: "a9", title: "Old", postedAt: "2026-09-01T00:00:00Z" }] };
    const { events, writes } = diffCourse({ courseUuid: "c", payload: old, known, seeded: true, now: NOW });
    expect(events).toEqual([]);
    expect(writes).toEqual([["ann:c:a9", "1"]]);
  });
});

describe("dueSoon", () => {
  const row = (uuid, mins) => ({ uuid, title: uuid, course_uuid: "c", due_date: new Date(NOW + mins * 60000).toISOString() });

  it("flags assignments due in about 30 minutes, once per due date", () => {
    const rows = [row("soon", 30), row("later", 90), row("past", -5), { uuid: "dateonly", due_date: "2026-10-01" }];
    expect(dueSoon(rows, new Map(), NOW).map((e) => e.uuid)).toEqual(["soon"]);
    expect(dueSoon(rows, new Map([["due30:soon", rows[0].due_date]]), NOW)).toEqual([]);
  });
});

describe("parseCost", () => {
  it("reads the Windows connection cost", () => {
    expect(parseCost("Unrestricted|False|False\r\n")).toBe("ok");
    expect(parseCost("Fixed|False|False")).toBe("metered");
    expect(parseCost("Variable|False|False")).toBe("metered");
    expect(parseCost("Unrestricted|True|False")).toBe("metered");
    expect(parseCost("none")).toBe("offline");
  });
});
