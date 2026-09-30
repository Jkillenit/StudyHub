import { describe, expect, it } from "vitest";
import { createStage } from "./stage.js";

function fakeStage({ anchors = ["a", "b"] } = {}) {
  const log = [];
  const rec = (name) => (...args) => {
    log.push([name, ...args.filter((a) => typeof a === "string")]);
  };
  let releaseWalk = null;
  const stage = createStage({
    find: async (name) => (anchors.includes(name) ? name : null),
    stop: rec("stop"),
    walkTo: (el) => {
      log.push(["walkTo", el]);
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
  });
  return { stage, log, arrive: (ok = true) => releaseWalk?.(ok) };
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

  it("actions do nothing outside a run", async () => {
    const { stage, log } = fakeStage();
    expect(await stage.pointAt("a")).toBe(false);
    expect(log).toEqual([]);
  });
});
