import { describe, expect, it } from "vitest";
import { dayNumber, daysBetween, localDayKey, startOfLocalDay } from "./dates.js";

describe("localDayKey", () => {
  it("formats local dates and treats bare dates as local", () => {
    expect(localDayKey(new Date(2026, 9, 1, 23, 30))).toBe("2026-10-01");
    expect(localDayKey("2026-10-01")).toBe("2026-10-01");
    expect(localDayKey(new Date(2026, 9, 1).getTime())).toBe("2026-10-01");
  });

  it("offsets by calendar days across month ends and DST", () => {
    expect(localDayKey(new Date(2026, 9, 31, 8), 1)).toBe("2026-11-01");
    expect(localDayKey(new Date(2026, 2, 7, 0, 30), 1)).toBe("2026-03-08");
    expect(localDayKey(new Date(2026, 10, 1, 0, 30), 1)).toBe("2026-11-02");
    expect(localDayKey(new Date(2026, 0, 1), -1)).toBe("2025-12-31");
  });
});

describe("dayNumber / daysBetween", () => {
  it("counts calendar days, bare dates local, null-safe", () => {
    expect(daysBetween("2026-10-02", new Date(2026, 9, 1, 23, 59))).toBe(1);
    expect(daysBetween(new Date(2026, 9, 1, 0, 1), new Date(2026, 9, 1, 23, 59))).toBe(0);
    expect(daysBetween(new Date(2026, 2, 9), new Date(2026, 2, 7))).toBe(2);
    expect(dayNumber(null)).toBeNull();
    expect(dayNumber("")).toBeNull();
    expect(dayNumber("garbage")).toBeNull();
    expect(daysBetween(null, new Date())).toBeNull();
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight", () => {
    const d = startOfLocalDay(new Date(2026, 9, 1, 15, 45));
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([0, 0, 1]);
  });
});
