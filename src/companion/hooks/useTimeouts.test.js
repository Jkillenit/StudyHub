import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeouts } from "./useTimeouts.js";

describe("createTimeouts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs callbacks once and forgets them", () => {
    const t = createTimeouts();
    const fn = vi.fn();
    t.later(fn, 100);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    t.clearAll();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clearAll cancels everything pending", () => {
    const t = createTimeouts();
    const a = vi.fn();
    const b = vi.fn();
    t.later(a, 50);
    t.later(b, 500);
    t.clearAll();
    vi.advanceTimersByTime(1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("clear cancels one", () => {
    const t = createTimeouts();
    const a = vi.fn();
    const b = vi.fn();
    const id = t.later(a, 50);
    t.later(b, 50);
    t.clear(id);
    vi.advanceTimersByTime(50);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
