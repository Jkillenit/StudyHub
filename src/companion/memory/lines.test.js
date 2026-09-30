import { describe, expect, it } from "vitest";
import { MEMORY_LINES, lineId, openerCandidates, pickLine, pickOpener } from "./lines.js";
import { memoryMap } from "./derive.js";

const first = () => 0;

describe("line library", () => {
  it("has 3-5 variants for every trigger she opens with", () => {
    for (const key of ["welcomeBack", "comeback", "lastSession", "patternUsual", "weakSpot", "lateSleep", "blockedReplan", "streak"]) {
      expect(MEMORY_LINES[key].length).toBeGreaterThanOrEqual(3);
      expect(MEMORY_LINES[key].length).toBeLessThanOrEqual(5);
    }
  });
});

describe("pickLine", () => {
  it("fills placeholders from facts", () => {
    const l = pickLine("comeback", { course: "MIS 430", current: 82, target: 80 }, { random: first });
    expect(l.text).toBe("MIS 430 is back over 80. 82% now. That was you.");
  });

  it("skips variants whose facts are missing", () => {
    const l = pickLine("welcomeBack", { days: 4, name: null }, { random: () => 0.3 });
    expect(l.text).not.toMatch(/\{|null/);
  });

  it("never repeats a line said this week", () => {
    const vars = { course: "OM 300", cards: 12 };
    const recent = new Set(MEMORY_LINES.lastSession.slice(0, -1).map((_, i) => lineId("lastSession", i)));
    const l = pickLine("lastSession", vars, { recent, random: first });
    expect(l.id).toBe(lineId("lastSession", MEMORY_LINES.lastSession.length - 1));
    recent.add(l.id);
    expect(pickLine("lastSession", vars, { recent })).toBeNull();
  });
});

describe("openers", () => {
  const evening = new Date(2026, 8, 30, 22, 30);

  it("leads with a warm welcome back after three days away", () => {
    const o = pickOpener({ memory: {}, now: evening, absentDays: 4, catchUp: { due: 3, next: "Case 2", when: "Thu" } }, { random: first });
    expect(o.trigger).toBe("welcomeBack");
    expect(o.then.trigger).toBe("catchUp");
  });

  it("tells them to sleep after 2am", () => {
    const o = pickOpener({ memory: {}, now: new Date(2026, 8, 30, 2, 40), timeLabel: "2:40 AM" }, { random: first });
    expect(o.trigger).toBe("lateSleep");
    expect(o.line.text).toContain("2:40 AM");
  });

  it("references the last session", () => {
    const memory = memoryMap([{ key: "last_session", value: { course: "OM 300", cards: 18, bestCombo: 7 } }]);
    const o = pickOpener({ memory, now: evening }, { random: first });
    expect(o.trigger).toBe("lastSessionCombo");
    expect(o.line.text).toContain("18");
  });

  it("drops muted facts", () => {
    const memory = memoryMap([
      { key: "last_session", value: null, muted: true },
      { key: "weak_topic", value: { topic: "Chapter 6", course: "OM 300", missPct: 40 } },
    ]);
    expect(openerCandidates({ memory, now: evening }).map((c) => c.trigger)).toEqual(["weakSpot"]);
  });

  it("notices an early start", () => {
    const memory = memoryMap([{ key: "study_time", value: { after: 22, typical: 23 } }]);
    const o = pickOpener({ memory, now: new Date(2026, 8, 30, 15) }, { random: first });
    expect(o.trigger).toBe("patternEarly");
    expect(o.line.text).toContain("10pm");
  });
});
