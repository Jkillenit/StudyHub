import { describe, expect, it } from "vitest";
import { goneRows, withLeaving } from "./leavingRows.js";

const a = { id: "a" };
const b = { id: "b" };
const c = { id: "c" };
const d = { id: "d" };

describe("goneRows", () => {
  it("marks a finished row done, with its slot", () => {
    expect(goneRows([a, b, c], ["a", "c", "d"], ["b"])).toEqual([{ item: b, index: 1, done: true }]);
  });
  it("keeps a row pushed out of the top three quiet", () => {
    expect(goneRows([a, b, c], ["d", "a", "b"], [])).toEqual([{ item: c, index: 2, done: false }]);
  });
  it("keeps a row that went overdue quiet", () => {
    expect(goneRows([a, b, c], ["b", "c", "d"], ["x"])).toEqual([{ item: a, index: 0, done: false }]);
  });
  it("is empty when the top three are unchanged, and on the first load", () => {
    expect(goneRows([a, b, c], ["a", "b", "c"], ["a"])).toEqual([]);
    expect(goneRows([], ["a"], [])).toEqual([]);
  });
});

describe("withLeaving", () => {
  it("puts leaving rows back in their old slots", () => {
    expect(withLeaving([a, c, d], [{ item: b, index: 1 }]).map((r) => [r.item.id, r.leaving, r.index])).toEqual([
      ["a", false, 0],
      ["b", true, 1],
      ["c", false, 1],
      ["d", false, 2],
    ]);
  });
  it("drops a leaving row that came back", () => {
    expect(withLeaving([a, b], [{ item: b, index: 0 }]).map((r) => r.item.id)).toEqual(["a", "b"]);
  });
  it("appends past the end", () => {
    expect(withLeaving([], [{ item: a, index: 2 }]).map((r) => r.item.id)).toEqual(["a"]);
  });
});
