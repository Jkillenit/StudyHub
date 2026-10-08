import { describe, expect, it } from "vitest";
import { goneRows, withLeaving } from "./leavingRows.js";

const a = { id: "a" };
const b = { id: "b" };
const c = { id: "c" };
const d = { id: "d" };

describe("goneRows", () => {
  it("finds shown rows missing from the new list, with their slot", () => {
    expect(goneRows([a, b, c], ["a", "c", "d"])).toEqual([{ item: b, index: 1 }]);
  });
  it("ignores rows only pushed out of the top three", () => {
    expect(goneRows([a, b, c], ["d", "a", "b", "c"])).toEqual([]);
  });
  it("is empty on the first load", () => {
    expect(goneRows([], ["a"])).toEqual([]);
  });
});

describe("withLeaving", () => {
  it("puts leaving rows back in their old slots", () => {
    expect(withLeaving([a, c, d], [{ item: b, index: 1 }]).map((r) => [r.item.id, r.leaving])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
      ["d", false],
    ]);
  });
  it("drops a leaving row that came back", () => {
    expect(withLeaving([a, b], [{ item: b, index: 0 }]).map((r) => r.item.id)).toEqual(["a", "b"]);
  });
  it("appends past the end", () => {
    expect(withLeaving([], [{ item: a, index: 2 }]).map((r) => r.item.id)).toEqual(["a"]);
  });
});
