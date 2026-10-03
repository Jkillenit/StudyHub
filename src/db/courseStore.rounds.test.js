import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeBridge({ setCompleted }) {
  const settings = new Map();
  return {
    db: {
      assignments: { setCompleted: vi.fn(setCompleted) },
      settings: {
        get: vi.fn(async (key) => settings.get(key) ?? null),
        set: vi.fn(async ({ key, value }) => {
          settings.set(key, value);
          return { success: true };
        }),
      },
    },
  };
}

async function setup(setCompleted = async () => ({ success: true })) {
  const win = Object.assign(new EventTarget(), { studyHub: makeBridge({ setCompleted }) });
  vi.stubGlobal("window", win);
  const marks = [];
  win.addEventListener("studyhub-rounds-changed", (e) => marks.push(e.detail));
  const { courseStore } = await import("./courseStore.js");
  return { courseStore, marks, bridge: win.studyHub };
}

describe("courseStore.setAssignmentCompleted round marks", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.doUnmock("../session/rounds.js");
    vi.unstubAllGlobals();
  });

  it("records one mark when an assignment is completed", async () => {
    const { courseStore, marks, bridge } = await setup();
    await courseStore.setAssignmentCompleted("a1", true);
    expect(bridge.db.assignments.setCompleted).toHaveBeenCalledWith({ uuid: "a1", completed: true });
    expect(marks).toHaveLength(1);
    expect(bridge.db.settings.set).toHaveBeenCalledWith({ key: "session.rounds", value: "1" });
  });

  it("records no mark when an assignment is uncompleted", async () => {
    const { courseStore, marks } = await setup();
    await courseStore.setAssignmentCompleted("a1", false);
    expect(marks).toHaveLength(0);
  });

  it("records no mark when the write rejects", async () => {
    const { courseStore, marks } = await setup(async () => {
      throw new Error("db locked");
    });
    await expect(courseStore.setAssignmentCompleted("a1", true)).rejects.toThrow("db locked");
    expect(marks).toHaveLength(0);
  });

  it("records no mark when the write does not report success", async () => {
    const { courseStore, marks } = await setup(async () => undefined);
    await courseStore.setAssignmentCompleted("a1", true);
    expect(marks).toHaveLength(0);
  });

  it("still completes when recordMark throws", async () => {
    vi.doMock("../session/rounds.js", () => ({
      recordMark: vi.fn(async () => {
        throw new Error("rounds broke");
      }),
    }));
    const { courseStore, bridge } = await setup();
    await expect(courseStore.setAssignmentCompleted("a1", true)).resolves.toEqual({ success: true });
    expect(bridge.db.assignments.setCompleted).toHaveBeenCalledTimes(1);
  });
});
