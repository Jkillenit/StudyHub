import { describe, expect, it } from "vitest";
import { ms, playSteps, unknownActions } from "./scenePlayer.js";
import { ACTIONS } from "./stage.js";
import { character } from "../companion/character.js";
import briefing from "./scenes/briefing.json";

function fakeStage({ stopAfter = Infinity } = {}) {
  const calls = [];
  const stage = { running: true };
  for (const k of ACTIONS) {
    stage[k] = async (...args) => {
      calls.push([k, ...args.filter((a) => typeof a !== "object" || a === null)]);
      if (calls.length >= stopAfter) stage.running = false;
      return true;
    };
  }
  return { stage, calls };
}

const names = (calls) => calls.map((c) => c[0]);

describe("scene player", () => {
  it("parses durations", () => {
    expect(ms("30s")).toBe(30000);
    expect(ms("500ms")).toBe(500);
    expect(ms("2m")).toBe(120000);
    expect(ms(40)).toBe(40);
  });

  it("branches on context and fills anchors from it", async () => {
    const { stage, calls } = fakeStage();
    const steps = [{ if: "risk", then: [{ do: "walkTo", anchor: "course.{risk.uuid}.gauge" }], else: [{ do: "say", line: "none" }] }];
    await playSteps(stage, steps, { risk: { uuid: "c1" } });
    await playSteps(stage, steps, { risk: null });
    expect(calls).toEqual([["walkTo", "course.c1.gauge"], ["say", "none"]]);
  });

  it("picks a weighted branch", async () => {
    const { stage, calls } = fakeStage();
    const steps = [{ choose: [{ weight: 1, steps: [{ do: "emote", name: "nod" }] }, { weight: 3, steps: [{ do: "emote", name: "smug" }] }] }];
    await playSteps(stage, steps, {}, () => 0.1);
    await playSteps(stage, steps, {}, () => 0.9);
    expect(calls).toEqual([["emote", "nod"], ["emote", "smug"]]);
  });

  it("runs parallel branches and stops when the run ends", async () => {
    const { stage, calls } = fakeStage({ stopAfter: 2 });
    await playSteps(stage, [{ parallel: [[{ do: "walkTo", anchor: "a" }], [{ do: "say", line: "hi" }]] }, { do: "pointAt", anchor: "a" }]);
    expect(names(calls)).toEqual(["walkTo", "say"]);
  });

  it("passes the context to say and whether to speak", async () => {
    const { stage } = fakeStage();
    let got;
    stage.say = async (...a) => {
      got = a;
    };
    await playSteps(stage, [{ do: "say", line: "briefing.task" }], { speak: true, task: { title: "Essay" } });
    expect(got[0]).toBe("briefing.task");
    expect(got[1].task.title).toBe("Essay");
    expect(got[2]).toEqual({ speak: true });
  });

  it("briefing scene uses only Stage actions and existing lines", async () => {
    expect(unknownActions(briefing.steps)).toEqual([]);
    const { stage, calls } = fakeStage();
    const lines = [];
    stage.say = async (key) => lines.push(key);
    await playSteps(stage, briefing.steps, { hasCourses: true, task: { title: "Essay" }, overdue: { count: 2 }, risk: { uuid: "c1" } });
    expect(lines).toEqual(["briefing.opener", "briefing.task", "briefing.overdue", "briefing.risk", "briefing.closer"]);
    for (const key of lines) expect(character.lines[key], key).toBeTruthy();
    expect(calls.filter((c) => c[0] === "walkTo").map((c) => c[1])).toEqual(["tonight.item.1", "overdue", "course.c1.gauge"]);
  });
});
