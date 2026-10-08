import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldAttractor, fieldTuning, frameDue, lastAttractor } from "./fieldEvents.js";

describe("fieldTuning", () => {
  it("thins and slows the field late at night", () => {
    const late = fieldTuning("late");
    const day = fieldTuning("day");
    expect(late.density).toBeLessThan(day.density);
    expect(late.speed).toBeLessThan(day.speed);
    expect(fieldTuning("evening").density).toBeLessThan(day.density);
    expect(day).toEqual({ density: 1, speed: 1 });
  });
});

describe("frameDue", () => {
  it("lets a frame through about every 33ms at 30fps", () => {
    expect(frameDue(1000, 1000)).toBe(false);
    expect(frameDue(1020, 1000)).toBe(false);
    expect(frameDue(1033, 1000)).toBe(true);
    expect(frameDue(1016, 1000, 60)).toBe(true);
  });
});

describe("lastAttractor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("remembers the last position published", () => {
    vi.stubGlobal("window", new EventTarget());
    expect(lastAttractor()).toBe(null);
    fieldAttractor(120, 340, 0);
    expect(lastAttractor()).toEqual({ x: 120, y: 340 });
  });
});
