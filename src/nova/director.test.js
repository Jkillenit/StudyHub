import { describe, expect, it } from "vitest";
import { HOVER_MS, INTENTS, PROACTIVE_GAP_MS, choose, gradeMoves } from "./director.js";
import { unknownActions } from "./scenePlayer.js";
import { character } from "../companion/character.js";

const NOW = 1_000_000_000;
const base = { blocked: false, typing: false, idle: true, feelings: { annoyance: 0 }, events: [], onToday: true, today: null, part: "day", hover: { anchor: null, ms: 0 }, gauge: null, due: null };
const pickId = (ctx, timing) => choose(INTENTS, { ...base, ...ctx }, timing, NOW)?.id ?? null;

describe("director", () => {
  it("does nothing when nothing is worth doing", () => {
    expect(pickId({})).toBe(null);
  });

  it("nudges due cards only when you're idle", () => {
    expect(pickId({ due: { count: 12 } })).toBe("dueCards");
    expect(pickId({ due: { count: 12 }, idle: false })).toBe(null);
    expect(pickId({ due: { count: 1 } })).toBe(null);
  });

  it("caps proactive suggestions and respects cooldowns", () => {
    const ctx = { due: { count: 12 }, today: { overdue: { count: 2 } } };
    expect(pickId(ctx, { lastProactive: NOW - PROACTIVE_GAP_MS / 2 })).toBe(null);
    expect(pickId(ctx, { next: { overdue: NOW + 1 } })).toBe("dueCards");
  });

  it("nags less when annoyed", () => {
    expect(pickId({ due: { count: 3 } })).toBe("dueCards");
    expect(pickId({ due: { count: 3 }, feelings: { annoyance: 1 } })).toBe(null);
  });

  it("explains a hovered gauge, but not while you type", () => {
    const gauge = { uuid: "c1" };
    expect(pickId({ gauge, hover: { anchor: "course.c1.gauge", ms: HOVER_MS } })).toBe("explainGauge");
    expect(pickId({ gauge, hover: { anchor: "course.c1.gauge", ms: HOVER_MS - 1 } })).toBe(null);
    expect(pickId({ gauge, hover: { anchor: "course.c1.gauge", ms: HOVER_MS }, typing: true })).toBe(null);
  });

  it("puts a grade change ahead of everything, and stays silent when blocked", () => {
    const ctx = { events: [{ type: "grade" }], due: { count: 20 }, gauge: { uuid: "c1" }, hover: { anchor: "x", ms: HOVER_MS } };
    expect(pickId(ctx)).toBe("gradeMoved");
    expect(pickId({ ...ctx, idle: false, typing: true })).toBe("gradeMoved");
    expect(pickId({ ...ctx, blocked: true })).toBe(null);
  });

  it("offers the briefing on Today mornings only", () => {
    const today = { hasCourses: true };
    expect(pickId({ today, part: "morning" })).toBe("briefingOffer");
    expect(pickId({ today, part: "evening" })).toBe(null);
    expect(pickId({ today, part: "morning", onToday: false })).toBe(null);
  });

  it("notices grades that moved, not new or unchanged courses", () => {
    const moves = gradeMoves({ a: 80, b: 90 }, [
      { uuid: "a", course: "MIS 430", current: 84, pct: "84.0" },
      { uuid: "b", course: "GBA 490", current: 90.2, pct: "90.2" },
      { uuid: "c", course: "MKT 300", current: 70, pct: "70.0" },
    ]);
    expect(moves).toEqual([{ type: "grade", uuid: "a", course: "MIS 430", from: 80, to: 84, pct: "84.0", up: true }]);
  });

  it("intent scenes use only Stage actions and existing lines", () => {
    const keys = (steps) => steps.flatMap((s) => ("if" in s ? [...keys(s.then || []), ...keys(s.else || [])] : s.do === "say" ? [s.line] : []));
    for (const it of INTENTS.filter((i) => i.steps)) {
      expect(unknownActions(it.steps), it.id).toEqual([]);
      for (const k of keys(it.steps)) expect(character.lines[k], k).toBeTruthy();
    }
  });
});
