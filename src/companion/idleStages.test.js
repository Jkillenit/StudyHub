import { describe, expect, it } from "vitest";
import { LATE_DOZE_MS, PEEK_COOLDOWN_MS, dueStage, mayPeek, pickProp } from "./idleStages.js";

const S = 1000;

describe("dueStage", () => {
  it("waits for 30 seconds before anything", () => {
    expect(dueStage(29 * S, new Set())).toBe(null);
    expect(dueStage(30 * S, new Set())).toBe("fidget");
  });

  it("runs each stage once per stretch, in order", () => {
    const done = new Set(["fidget"]);
    expect(dueStage(45 * S, done)).toBe(null);
    expect(dueStage(61 * S, done)).toBe("doodle");
    done.add("doodle");
    expect(dueStage(119 * S, done)).toBe(null);
    expect(dueStage(121 * S, done)).toBe("prop");
    done.add("prop");
    expect(dueStage(301 * S, done)).toBe("doze");
    done.add("doze");
    expect(dueStage(900 * S, done)).toBe(null);
  });

  it("jumps to the latest stage when earlier ones were missed", () => {
    expect(dueStage(130 * S, new Set())).toBe("prop");
  });

  it("never goes back to a missed stage once a later one ran", () => {
    expect(dueStage(200 * S, new Set(["prop"]))).toBe(null);
  });

  it("skips stages the body can't do", () => {
    expect(dueStage(130 * S, new Set(["doodle"]), { skip: new Set(["prop"]) })).toBe(null);
    expect(dueStage(301 * S, new Set(["doodle"]), { skip: new Set(["prop"]) })).toBe("doze");
  });

  it("dozes sooner late at night", () => {
    const done = new Set(["fidget", "doodle", "prop"]);
    expect(dueStage(LATE_DOZE_MS, done)).toBe(null);
    expect(dueStage(LATE_DOZE_MS, done, { part: "late" })).toBe("doze");
  });
});

describe("mayPeek", () => {
  const always = () => 0;
  it("needs some idle time and respects the cooldown", () => {
    expect(mayPeek({ idleMs: 5 * S, random: always })).toBe(false);
    expect(mayPeek({ idleMs: 25 * S, lastPeek: 0, now: PEEK_COOLDOWN_MS + 1, random: always })).toBe(true);
    expect(mayPeek({ idleMs: 25 * S, lastPeek: 100, now: PEEK_COOLDOWN_MS, random: always })).toBe(false);
  });

  it("is a rare chance per check", () => {
    expect(mayPeek({ idleMs: 25 * S, now: PEEK_COOLDOWN_MS + 1, random: () => 0.5 })).toBe(false);
  });
});

describe("pickProp", () => {
  it("reads when there's no edge to sit on", () => {
    expect(pickProp({ canSit: false, random: () => 0.9 })).toBe("read");
    expect(pickProp({ canSit: true, random: () => 0.9 })).toBe("cards");
  });
});
