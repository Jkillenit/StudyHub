import { describe, expect, it } from "vitest";
import { createStage } from "./stage.js";
import { LAYOUTS } from "./workspace.js";

function fakeStage({ anchors = ["a", "b"], layout = { ...LAYOUTS.briefing }, busy = [], autoWalk = false } = {}) {
  const log = [];
  const ws = { layout, before: null };
  const rec = (name) => (...args) => {
    log.push([name, ...args.filter((a) => typeof a === "string")]);
  };
  let releaseWalk = null;
  const stage = createStage({
    find: async (name) => (anchors.includes(name) ? name : null),
    stop: rec("stop"),
    walkTo: (el) => {
      log.push(["walkTo", el]);
      if (autoWalk) return Promise.resolve(true);
      return new Promise((resolve) => {
        releaseWalk = resolve;
      });
    },
    lookAt: rec("lookAt"),
    pointAt: rec("pointAt"),
    mark: rec("mark"),
    clearMarks: rec("clearMarks"),
    scrollTo: async () => {},
    openTab: rec("openTab"),
    focus: rec("focus"),
    unfocus: rec("unfocus"),
    say: rec("say"),
    line: () => "",
    mood: rec("mood"),
    gesture: rec("gesture"),
    layout: () => ws.layout,
    place: (id, slot) => {
      log.push(["place", id, slot]);
      ws.layout = { ...ws.layout, [id]: slot };
    },
    remember: () => {
      ws.before = { ...ws.layout };
    },
    inUse: (el) => busy.includes(el),
  });
  return { stage, log, ws, arrive: (ok = true) => releaseWalk?.(ok) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("stage", () => {
  it("runs actions in order and cleans up when the scene ends", async () => {
    const { stage, log, arrive } = fakeStage();
    const done = stage.run(async (s) => {
      await s.walkTo("a");
      await s.pointAt("a");
      await s.highlight("b", "warn");
      await s.focusPanel("b");
    });
    await tick();
    arrive();
    expect(await done).toBe(true);
    expect(log.map((l) => l[0])).toEqual(["walkTo", "pointAt", "mark", "focus", "unfocus", "clearMarks"]);
    expect(log[2]).toEqual(["mark", "b", "b", "warn"]);
  });

  it("skips actions on missing anchors and reports false", async () => {
    const { stage, log } = fakeStage();
    let res;
    await stage.run(async (s) => {
      res = await s.pointAt("nope");
    });
    expect(res).toBe(false);
    expect(log.some((l) => l[0] === "pointAt")).toBe(false);
  });

  it("abort stops the remaining steps, stops her, and undoes focus", async () => {
    const { stage, log, arrive } = fakeStage();
    const after = [];
    const done = stage.run(async (s) => {
      await s.focusPanel("b");
      const ok = await s.walkTo("a");
      after.push(ok);
      await s.pointAt("a");
      await s.say("hello");
    });
    await tick();
    stage.abort();
    arrive();
    expect(await done).toBe(false);
    expect(after).toEqual([false]);
    const names = log.map((l) => l[0]);
    expect(names).toContain("stop");
    expect(names).toContain("unfocus");
    expect(names).not.toContain("pointAt");
    expect(names).not.toContain("say");
    expect(stage.running).toBe(false);
  });

  it("abort wakes a scene waiting for input", async () => {
    const { stage } = fakeStage();
    const done = stage.run((s) => s.wait("input"));
    await tick();
    stage.abort();
    expect(await done).toBe(false);
  });

  it("a new run aborts the previous one", async () => {
    const { stage, arrive } = fakeStage();
    const first = stage.run((s) => s.walkTo("a"));
    await tick();
    const second = stage.run(async () => {});
    arrive();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
  });

  it("arrange carries panels one at a time and remembers the old layout", async () => {
    const panels = ["panel.briefing", "panel.tonight", "panel.standing", "panel.week", "desk"];
    const { stage, log, ws } = fakeStage({ anchors: panels, autoWalk: true });
    expect(await stage.run((s) => s.arrange("grades"))).toBe(true);
    expect(ws.layout).toEqual(LAYOUTS.grades);
    expect(ws.before).toEqual(LAYOUTS.briefing);
    const steps = log.filter((l) => l[0] === "walkTo" || l[0] === "place").map((l) => l.slice(0, 2).join(" "));
    expect(steps).toEqual(["walkTo panel.tonight", "place tonight", "walkTo panel.standing", "place standing"]);
  });

  it("never moves a panel the user is using", async () => {
    const { stage, ws } = fakeStage({ anchors: ["panel.week"], busy: ["panel.week"], autoWalk: true });
    let res;
    await stage.run(async (s) => {
      res = await s.closePanel("week");
    });
    expect(res).toBe(false);
    expect(ws.layout.week).toBe("dock");
  });

  it("opens a filed panel from the desk", async () => {
    const { stage, log, ws } = fakeStage({ anchors: ["desk"], layout: { ...LAYOUTS.tidy }, autoWalk: true });
    await stage.run((s) => s.openPanel("standing"));
    expect(ws.layout.standing).toBe("dock");
    expect(log.find((l) => l[0] === "walkTo")).toEqual(["walkTo", "desk"]);
  });

  it("actions do nothing outside a run", async () => {
    const { stage, log } = fakeStage();
    expect(await stage.pointAt("a")).toBe(false);
    expect(log).toEqual([]);
  });
});
