import { describe, expect, it } from "vitest";
import { dueEmphasis, hoursUntil } from "./dueEmphasis.js";

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
