import { describe, expect, it } from "vitest";
import { LAYOUTS, canPlace, inSlot, movesTo, workspace } from "./workspace.js";

describe("workspace", () => {
  it("briefing only goes left or on the desk", () => {
    expect(canPlace("briefing", "left")).toBe(true);
    expect(canPlace("briefing", "center")).toBe(false);
    expect(canPlace("tonight", "left")).toBe(false);
    expect(canPlace("nope", "desk")).toBe(false);
  });

  it("lists panels in a slot in fixed order", () => {
    expect(inSlot(LAYOUTS.briefing, "dock")).toEqual(["standing", "week"]);
  });

  it("files panels first, moves next, unfiles last", () => {
    const from = { briefing: "desk", tonight: "center", standing: "dock", week: "dock" };
    const to = { briefing: "left", tonight: "desk", standing: "center", week: "dock" };
    expect(movesTo(from, to).map((m) => `${m.id}>${m.slot}`)).toEqual(["tonight>desk", "standing>center", "briefing>left"]);
    expect(movesTo(LAYOUTS.briefing, LAYOUTS.briefing)).toEqual([]);
  });

  it("apply remembers the old layout and putBack restores it", () => {
    workspace.apply("briefing");
    workspace.apply("tidy");
    expect(workspace.get().layout).toEqual(LAYOUTS.tidy);
    workspace.putBack();
    expect(workspace.get().layout).toEqual(LAYOUTS.briefing);
    expect(workspace.get().before).toBe(null);
  });

  it("place refuses slots a panel can't use", () => {
    expect(workspace.place("briefing", "dock")).toBe(false);
    expect(workspace.place("week", "center")).toBe(true);
    expect(workspace.get().layout.week).toBe("center");
  });
});
