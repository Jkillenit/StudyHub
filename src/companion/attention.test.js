import { describe, expect, it } from "vitest";
import { IDLE_START_MS, SESSION_QUIET_MS, idleFor, inSession, isAtSpot, mayAct, msUntilIdle, nextCheckMs } from "./attention.js";

const NOW = 1_000_000;

describe("idle gate", () => {
  it("waits 10 seconds after the last input", () => {
    expect(IDLE_START_MS).toBe(10_000);
    expect(mayAct({ lastInput: NOW - 9_999, now: NOW })).toBe(false);
    expect(mayAct({ lastInput: NOW - 10_000, now: NOW })).toBe(true);
  });

  it("counts an app that has never seen input as idle", () => {
    expect(idleFor(0, NOW)).toBe(NOW);
    expect(mayAct({ lastInput: 0, now: NOW })).toBe(true);
  });

  it("never acts in quiet mode, with reduced motion, or while the window is hidden", () => {
    const idle = { lastInput: NOW - 120_000, now: NOW };
    expect(mayAct({ ...idle, quiet: true })).toBe(false);
    expect(mayAct({ ...idle, reduced: true })).toBe(false);
    expect(mayAct({ ...idle, hidden: true })).toBe(false);
  });

  it("stays still during a study session even after the idle wait", () => {
    const lastStudy = NOW - 35_000;
    expect(inSession(lastStudy, NOW)).toBe(true);
    expect(mayAct({ lastInput: NOW - 35_000, lastStudy, now: NOW })).toBe(false);
    expect(mayAct({ lastInput: NOW - 60_000, lastStudy: NOW - SESSION_QUIET_MS, now: NOW })).toBe(true);
  });

  it("schedules the next check for when she could act", () => {
    expect(msUntilIdle(NOW - 4_000, NOW)).toBe(6_000);
    expect(nextCheckMs({ lastInput: NOW - 4_000, now: NOW })).toBe(6_000);
    expect(nextCheckMs({ lastInput: NOW - 60_000, lastStudy: NOW - 5_000, now: NOW })).toBe(40_000);
    expect(nextCheckMs({ lastInput: NOW - 60_000, now: NOW })).toBe(2000);
  });

  it("treats a few px from the spot as at the spot", () => {
    expect(isAtSpot({ x: 100, y: 100 }, { x: 104, y: 103 })).toBe(true);
    expect(isAtSpot({ x: 100, y: 100 }, { x: 120, y: 100 })).toBe(false);
  });
});
