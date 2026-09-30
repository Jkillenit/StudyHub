import { describe, expect, it } from "vitest";
import { blockedBefore, rankToday } from "./priority.js";
import { blockedFromMemory, blockedWhen, replanNote } from "./blocked.js";

/** Monday Oct 5 2026, 9am. */
const NOW = new Date(2026, 9, 5, 9, 0).toISOString();
const inDays = (n) => new Date(2026, 9, 5 + n, 23, 59).toISOString();
const course = (assignments) => ({ uuid: "c1", name: "MKT 300", courseCode: "MKT 300", targetGrade: 80, components: [], assignments });
const asg = (uuid, days, kind = "project") => ({ uuid, title: uuid, kind, dueDate: inDays(days), score: null });

describe("blocked days in the ranking", () => {
  it("counts blocked days between today and the due date", () => {
    const blocked = new Set(["2026-10-10", "2026-10-11", "2026-10-20"]);
    expect(blockedBefore(7, NOW, blocked)).toBe(2);
    expect(blockedBefore(5, NOW, blocked)).toBe(0);
    expect(blockedBefore(0, NOW, blocked)).toBe(0);
  });

  it("moves work due after a blocked weekend up the list", () => {
    const data = { now: NOW, courses: [course([asg("Case study", 7), asg("Essay", 4)])] };
    const plain = rankToday(data);
    expect(plain[0].title).toBe("Essay");
    const blocked = rankToday(data, { blockedDays: ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"] });
    const caseItem = blocked.find((it) => it.title === "Case study");
    expect(caseItem.blockedBefore).toBe(4);
    expect(caseItem.score).toBeGreaterThan(plain.find((it) => it.title === "Case study").score);
  });

  it("describes what moved and why", () => {
    const days = ["2026-10-10", "2026-10-11"];
    const ranked = rankToday({ now: NOW, courses: [course([asg("LVMH case", 7)])] }, { blockedDays: days });
    expect(replanNote(ranked, days, new Date(NOW))).toEqual({ when: blockedWhen(days), title: "LVMH case" });
    expect(blockedWhen(days)).toMatch(/ and /);
  });

  it("reads only upcoming, unmuted blocked days from memory", () => {
    const memory = {
      "blocked:2026-10-01": { value: { reason: "work" } },
      "blocked:2026-10-10": { value: { reason: "drill" } },
      "blocked:2026-10-11": { value: null },
      "blocked:2026-10-12": { value: { reason: "work" }, muted: true },
    };
    expect(blockedFromMemory(memory, new Date(NOW))).toEqual(["2026-10-10"]);
  });
});
