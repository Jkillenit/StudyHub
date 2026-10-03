import { describe, expect, it } from "vitest";
import { addMark, roundInfo } from "./rounds.js";

describe("rounds", () => {
  it("starts in round one", () => {
    expect(roundInfo(0)).toEqual({ round: 1, inRound: 0 });
  });
  it("five marks make a round", () => {
    expect(roundInfo(4)).toEqual({ round: 1, inRound: 4 });
    expect(roundInfo(5)).toEqual({ round: 2, inRound: 0 });
    expect(roundInfo(12)).toEqual({ round: 3, inRound: 2 });
  });
  it("addMark reports the round it closed", () => {
    expect(addMark(3)).toEqual({ marks: 4, round: 1, inRound: 4, closedRound: null });
    expect(addMark(4)).toEqual({ marks: 5, round: 2, inRound: 0, closedRound: 1 });
    expect(addMark(14)).toEqual({ marks: 15, round: 4, inRound: 0, closedRound: 3 });
  });
});
