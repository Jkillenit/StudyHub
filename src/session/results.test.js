import { describe, expect, it } from "vitest";
import { formatDuration, masteryDeltas, resultSummary } from "./results.js";

const mastered = { repetitions: 3, easeFactor: 2.5 };
const fresh = { repetitions: 0, easeFactor: 2.5 };

describe("masteryDeltas", () => {
  it("compares mastery per topic, biggest gain first", () => {
    const before = [
      { id: 1, t: "A", ...fresh },
      { id: 2, t: "A", ...fresh },
      { id: 3, t: "B", ...fresh },
    ];
    const after = [
      { id: 1, t: "A", ...mastered },
      { id: 2, t: "A", ...fresh },
      { id: 3, t: "B", ...mastered },
    ];
    expect(masteryDeltas(before, after, (c) => c.t)).toEqual([
      { topic: "B", before: 0, after: 100, delta: 100 },
      { topic: "A", before: 0, after: 50, delta: 50 },
    ]);
  });

  it("skips cards without a topic", () => {
    expect(masteryDeltas([{ ...fresh }], [{ ...mastered }], () => "")).toEqual([]);
  });
});

describe("resultSummary", () => {
  it("held shields, cards back tomorrow", () => {
    expect(resultSummary({ wentDown: false, downCount: 0, comeBack: 2 })).toBe("Shields held the whole way. Two cards come back tomorrow.");
  });
  it("went down once, one card", () => {
    expect(resultSummary({ wentDown: true, downCount: 1, comeBack: 1 })).toBe("Shields went down once. One card comes back tomorrow.");
  });
  it("went down several times, nothing tomorrow", () => {
    expect(resultSummary({ wentDown: true, downCount: 3, comeBack: 0 })).toBe("Shields went down 3 times.");
  });
  it("uses digits above nine", () => {
    expect(resultSummary({ wentDown: false, downCount: 0, comeBack: 12 })).toBe("Shields held the whole way. 12 cards come back tomorrow.");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(462000)).toBe("7:42");
    expect(formatDuration(5000)).toBe("0:05");
    expect(formatDuration(3723000)).toBe("1:02:03");
    expect(formatDuration(-1)).toBe("0:00");
  });
});
