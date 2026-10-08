import { describe, expect, it } from "vitest";
import { dueEmphasis, dueShort, hoursUntil } from "./dueEmphasis.js";

describe("dueShort", () => {
  const at = (d, h = 23, m = 59) => new Date(2026, 9, d, h, m).toISOString();

  it("gives today and tomorrow a 24-hour time", () => {
    expect(dueShort(at(8, 9, 5), 0)).toBe("today 09:05");
    expect(dueShort(at(9), 1)).toBe("tomorrow 23:59");
    expect(dueShort(at(9), 1, true)).toBe("tomorrow 23:59");
  });

  it("counts exams down from two to six days", () => {
    expect(dueShort(at(10, 10, 0), 2, true)).toBe("in 2 days");
    expect(dueShort(at(14, 10, 0), 6, true)).toBe("in 6 days");
  });

  it("names the weekday for other work two to six days out", () => {
    expect(dueShort(at(10), 2)).toBe("Sat");
    expect(dueShort(at(14), 6)).toBe("Wed");
  });

  it("gives a date from a week out", () => {
    expect(dueShort(at(15), 7)).toBe("Oct 15");
    expect(dueShort(at(16, 10, 0), 8, true)).toBe("Oct 16");
  });

  it("is empty without a due date", () => {
    expect(dueShort(null, null)).toBe("");
    expect(dueShort(at(9), null)).toBe("");
  });
});

describe("dueEmphasis", () => {
  it("steps at 24h and 72h", () => {
    expect(dueEmphasis(0)).toBe("hot");
    expect(dueEmphasis(23.9)).toBe("hot");
    expect(dueEmphasis(24)).toBe("near");
    expect(dueEmphasis(71.9)).toBe("near");
    expect(dueEmphasis(72)).toBe("far");
    expect(dueEmphasis(500)).toBe("far");
  });

  it("treats a missing due date as far", () => {
    expect(dueEmphasis(null)).toBe("far");
    expect(dueEmphasis(undefined)).toBe("far");
  });

  it("measures hours from now", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(hoursUntil("2026-10-09T12:00:00Z", now)).toBe(24);
    expect(hoursUntil(null, now)).toBe(null);
  });
});
