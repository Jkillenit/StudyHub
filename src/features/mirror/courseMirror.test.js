import { describe, expect, it } from "vitest";
import { mirrorBadges, upcomingExams } from "./courseMirror.js";

const NOW = new Date(2026, 9, 5, 9);
const due = (d) => new Date(2026, 9, d, 12).toISOString();

describe("mirrorBadges", () => {
  it("counts unread announcements and open work due within 7 days", () => {
    const announcements = [{ read: 0 }, { read: 1 }, { read: false }];
    const assignments = [
      { due_date: due(5) },
      { due_date: due(11) },
      { due_date: due(12) },
      { due_date: due(6), completed: 1 },
      { due_date: due(4) },
      { due_date: null },
    ];
    expect(mirrorBadges(announcements, assignments, NOW)).toEqual({ unread: 2, dueSoon: 2 });
    expect(mirrorBadges(null, null, NOW)).toEqual({ unread: 0, dueSoon: 0 });
  });
});

describe("upcomingExams", () => {
  it("keeps open future exams, soonest first, with scopes", () => {
    const rows = [
      { uuid: "late", kind: "exam", title: "Final", due_date: "2099-12-10T10:00:00.000Z" },
      { uuid: "hw", kind: "homework", title: "HW", due_date: "2099-01-01T10:00:00.000Z" },
      { uuid: "done", kind: "exam", title: "Done", due_date: "2099-02-01T10:00:00.000Z", completed: 1 },
      { uuid: "past", kind: "exam", title: "Old", due_date: "2000-01-01T10:00:00.000Z" },
      { uuid: "mid", kind: "exam", title: "Midterm", due_date: "2099-03-01T10:00:00.000Z" },
    ];
    const scopes = { mid: { moduleIds: ["m1"], source: "manual" } };
    expect(upcomingExams(rows, scopes)).toEqual([
      { uuid: "mid", title: "Midterm", dueDate: "2099-03-01T10:00:00.000Z", moduleIds: ["m1"], scopeSource: "manual" },
      { uuid: "late", title: "Final", dueDate: "2099-12-10T10:00:00.000Z", moduleIds: [], scopeSource: "course" },
    ]);
  });
});
