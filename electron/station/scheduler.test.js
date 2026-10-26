import { describe, expect, it, beforeEach } from "vitest";
import { createRequire } from "node:module";

const { createScheduler, AFTER_RESUME_MS, DRAFT_CHECK_MS } = createRequire(import.meta.url)("./scheduler.cjs");

/** Controllable clock: setTimeout callbacks run when advance() reaches their due time. */
function createFakeClock(startMs) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + Math.max(0, ms) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      while (true) {
        let soonest = null;
        for (const [id, t] of timers) {
          if (t.at > end) continue;
          if (!soonest || t.at < soonest.at) soonest = { id, ...t };
        }
        if (!soonest) {
          now = end;
          return;
        }
        now = soonest.at;
        timers.delete(soonest.id);
        soonest.fn();
      }
    },
  };
}

const day = (isoLocal) => new Date(isoLocal).getTime(); // no "Z": local time, like the scheduler

describe("createScheduler", () => {
  let clock;
  let enqueued;
  let hasEligible;
  let morningAt;
  let scheduler;

  beforeEach(() => {
    // 2026-10-26 05:00 UTC — before morning brief
    clock = createFakeClock(day("2026-10-26T05:00:00"));
    enqueued = [];
    hasEligible = () => false;
    morningAt = () => "06:45";
    scheduler = createScheduler({
      enqueue: (spec) => enqueued.push(spec),
      hasEligibleDrafts: () => hasEligible(),
      getMorningBriefAt: () => morningAt(),
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
  });

  it("fires morning and evening briefing_build once per calendar day", () => {
    scheduler.start();

    clock.advance(2 * 3600000); // → 07:00, past 06:45
    expect(enqueued.filter((e) => e.type === "briefing_build")).toEqual([
      { type: "briefing_build", source: "schedule", params: { kind: "morning" } },
    ]);

    clock.advance(11 * 3600000); // → 18:00
    expect(enqueued.filter((e) => e.type === "briefing_build")).toEqual([
      { type: "briefing_build", source: "schedule", params: { kind: "morning" } },
      { type: "briefing_build", source: "schedule", params: { kind: "evening" } },
    ]);

    // rest of day + next morning window
    clock.advance(13 * 3600000); // → 07:00 next day
    const mornings = enqueued.filter((e) => e.params?.kind === "morning");
    const evenings = enqueued.filter((e) => e.params?.kind === "evening");
    expect(mornings).toHaveLength(2);
    expect(evenings).toHaveLength(1);

    clock.advance(11 * 3600000); // → 18:00 next day
    expect(enqueued.filter((e) => e.params?.kind === "evening")).toHaveLength(2);

    scheduler.stop();
  });

  it("does not double-fire morning after it already ran that day", () => {
    scheduler.start();
    clock.advance(2 * 3600000); // past morning
    expect(enqueued.filter((e) => e.params?.kind === "morning")).toHaveLength(1);
    clock.advance(30 * 60000);
    expect(enqueued.filter((e) => e.params?.kind === "morning")).toHaveLength(1);
    scheduler.stop();
  });

  it("resumed() enqueues one bb_sync after 90s (replaces pending resume)", () => {
    scheduler.start();
    scheduler.resumed();
    clock.advance(30 * 1000);
    scheduler.resumed(); // replaces prior timer
    clock.advance(AFTER_RESUME_MS - 1);
    expect(enqueued.filter((e) => e.type === "bb_sync")).toEqual([]);
    clock.advance(1);
    expect(enqueued.filter((e) => e.type === "bb_sync")).toEqual([
      { type: "bb_sync", source: "event", params: {} },
    ]);
    clock.advance(AFTER_RESUME_MS);
    expect(enqueued.filter((e) => e.type === "bb_sync")).toHaveLength(1);
    scheduler.stop();
  });

  it("every 2h enqueues drafts preset only when eligibility says so", () => {
    scheduler.start();
    clock.advance(DRAFT_CHECK_MS);
    expect(enqueued.some((e) => e.preset === "drafts")).toBe(false);

    hasEligible = () => true;
    clock.advance(DRAFT_CHECK_MS);
    expect(enqueued.filter((e) => e.preset === "drafts")).toEqual([
      { preset: "drafts", source: "schedule" },
    ]);

    hasEligible = () => false;
    clock.advance(DRAFT_CHECK_MS);
    expect(enqueued.filter((e) => e.preset === "drafts")).toHaveLength(1);
    scheduler.stop();
  });

  it("enqueues nightly health_check at 03:30", () => {
    scheduler.stop();
    clock = createFakeClock(day("2026-10-26T03:00:00"));
    enqueued = [];
    scheduler = createScheduler({
      enqueue: (spec) => enqueued.push(spec),
      hasEligibleDrafts: () => false,
      getMorningBriefAt: () => "06:45",
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.start();
    clock.advance(30 * 60000);
    expect(enqueued.filter((e) => e.type === "health_check")).toEqual([
      { type: "health_check", source: "schedule", params: {} },
    ]);
    scheduler.stop();
  });

  it("stop() clears timers so nothing further enqueues", () => {
    scheduler.start();
    scheduler.stop();
    clock.advance(48 * 3600000);
    expect(enqueued).toEqual([]);
  });

  it("uses getMorningBriefAt for morning time", () => {
    morningAt = () => "07:15";
    scheduler.stop();
    scheduler = createScheduler({
      enqueue: (spec) => enqueued.push(spec),
      hasEligibleDrafts: () => false,
      getMorningBriefAt: () => morningAt(),
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.start();
    clock.advance(2 * 3600000); // 07:00 — before 07:15
    expect(enqueued.filter((e) => e.params?.kind === "morning")).toHaveLength(0);
    clock.advance(15 * 60000);
    expect(enqueued.filter((e) => e.params?.kind === "morning")).toHaveLength(1);
    scheduler.stop();
  });
});
