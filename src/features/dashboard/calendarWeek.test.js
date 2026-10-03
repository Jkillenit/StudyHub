import { describe, expect, it } from "vitest";
import { dayKey, groupByDay, itemEdge, monthGrid, rangeFor, shiftWeek, weekDays, weekStart } from "./calendarWeek.js";

const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

describe("weekStart", () => {
  it("returns the Monday on or before the date, at midnight", () => {
    // Sat Oct 3 2026 → Mon Sep 28
    const s = weekStart(local(2026, 10, 3, 16));
    expect(dayKey(s)).toBe("2026-09-28");
    expect(s.getHours()).toBe(0);
  });
  it("keeps a Monday as its own week start", () => {
    expect(dayKey(weekStart(local(2026, 9, 28, 8)))).toBe("2026-09-28");
  });
  it("puts Sunday at the end of the week, not the start", () => {
    expect(dayKey(weekStart(local(2026, 10, 4)))).toBe("2026-09-28");
  });
});

describe("weekDays / shiftWeek", () => {
  it("lists Mon–Sun", () => {
    const days = weekDays(weekStart(local(2026, 10, 3)));
    expect(days.map(dayKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(days.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
  it("moves a week back and forward across month and year boundaries", () => {
    const start = weekStart(local(2026, 10, 3));
    expect(dayKey(shiftWeek(start, -1))).toBe("2026-09-21");
    expect(dayKey(shiftWeek(start, 1))).toBe("2026-10-05");
    expect(dayKey(shiftWeek(weekStart(local(2026, 12, 30)), 1))).toBe("2027-01-04");
  });
  it("survives a DST change (Nov 1 2026 in the US)", () => {
    const next = shiftWeek(weekStart(local(2026, 10, 28)), 1);
    expect(dayKey(next)).toBe("2026-11-02");
    expect(next.getHours()).toBe(0);
  });
});

describe("monthGrid", () => {
  it("is six Monday-first weeks covering the month", () => {
    const days = monthGrid(local(2026, 10, 1));
    expect(days).toHaveLength(42);
    expect(dayKey(days[0])).toBe("2026-09-28");
    expect(days[0].getDay()).toBe(1);
    expect(days.map(dayKey)).toContain("2026-10-31");
  });
  it("starts on the 1st when the 1st is a Monday", () => {
    expect(dayKey(monthGrid(local(2026, 6, 15))[0])).toBe("2026-06-01");
  });
});

describe("rangeFor", () => {
  it("spans the visible days, end exclusive", () => {
    const days = weekDays(weekStart(local(2026, 10, 3)));
    const { from, to } = rangeFor(days);
    expect(dayKey(from)).toBe("2026-09-28");
    expect(dayKey(to)).toBe("2026-10-05");
  });
});

describe("groupByDay", () => {
  it("groups by local due day and sorts by time", () => {
    const items = [
      { uuid: "b", due_date: local(2026, 10, 1, 17).toISOString() },
      { uuid: "a", due_date: local(2026, 10, 1, 9).toISOString() },
      { uuid: "c", due_date: local(2026, 10, 2, 9).toISOString() },
      { uuid: "x", due_date: null },
    ];
    const map = groupByDay(items);
    expect(map.get("2026-10-01").map((a) => a.uuid)).toEqual(["a", "b"]);
    expect(map.get("2026-10-02").map((a) => a.uuid)).toEqual(["c"]);
    expect(map.size).toBe(2);
  });
});

describe("itemEdge", () => {
  it("is magenta for exams, aqua otherwise, done wins", () => {
    expect(itemEdge({ kind: "exam" })).toBe("exam");
    expect(itemEdge({ kind: "quiz" })).toBe("due");
    expect(itemEdge({ kind: "assignment" })).toBe("due");
    expect(itemEdge({ kind: "exam", completed: 1 })).toBe("done");
  });
});
