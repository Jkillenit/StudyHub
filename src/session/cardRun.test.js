import { describe, expect, it } from "vitest";
import { cardRunEnd, currentCardId, rateCard, sessionOrder, skipMissing, startCardRun } from "./cardRun.js";
import { initShield } from "./shield.js";

const rate = (run, grade, nextReview = "2026-10-04") => rateCard(run, grade, { nextReview });

describe("startCardRun", () => {
  it("starts at the first id with full shields and nothing rated", () => {
    const run = startCardRun(["a", "b"], { now: 5 });
    expect(currentCardId(run)).toBe("a");
    expect(run.shield).toEqual(initShield());
    expect(run.rated).toBe(0);
    expect(run.startedAt).toBe(5);
  });
});

describe("rateCard", () => {
  it("advances and ends when the order is exhausted", () => {
    const first = rate(startCardRun(["a", "b"]), 4);
    expect(first.end).toBe(false);
    expect(currentCardId(first.run)).toBe("b");
    const second = rate(first.run, 5);
    expect(second.end).toBe(true);
    expect(second.run.done).toBe(true);
    expect(second.run.rated).toBe(2);
    expect(second.run.correct).toBe(2);
  });

  it("counts only Again as a miss for the shield", () => {
    let run = startCardRun(["a", "b", "c", "d"]);
    run = rate(run, 3).run;
    expect(run.shield.shield).toBe(100);
    run = rate(run, 1).run;
    expect(run.shield.last).toBe("hit");
    expect(run.correct).toBe(1);
  });

  it("re-queues the card at the end when it costs a health chunk", () => {
    const run = { ...startCardRun(["a", "b"]), shield: { ...initShield(), shield: 0 } };
    const { run: next, end } = rate(run, 1);
    expect(next.shield.last).toBe("health");
    expect(next.order).toEqual(["a", "b", "a"]);
    expect(end).toBe(false);
    expect(currentCardId(next)).toBe("b");
    const last = rate(next, 4);
    expect(last.end).toBe(false);
    expect(currentCardId(last.run)).toBe("a");
  });

  it("does not re-queue while shields absorb the miss", () => {
    const { run } = rate(startCardRun(["a", "b"]), 1);
    expect(run.order).toEqual(["a", "b"]);
  });

  it("ends when health runs out, even with cards left", () => {
    const run = { ...startCardRun(["a", "b", "c"]), shield: { ...initShield(), shield: 0, health: 1 } };
    const { run: next, end } = rate(run, 1);
    expect(next.shield.health).toBe(0);
    expect(end).toBe(true);
  });

  it("tracks misses once per card, reviewed next dates and the best streak", () => {
    let run = startCardRun(["a", "b", "c", "d"]);
    run = { ...run, shield: { ...initShield(), shield: 0 } };
    run = rate(run, 1, "2026-10-04").run;
    run = rate(run, 4, "2026-10-10").run;
    run = rate(run, 4, "2026-10-10").run;
    run = rate(run, 4, "2026-10-10").run;
    expect(currentCardId(run)).toBe("a");
    run = rate(run, 1, "2026-10-04").run;
    expect(run.misses).toEqual(["a"]);
    expect(run.best).toBe(3);
    expect(run.reviewed).toEqual({ a: "2026-10-04", b: "2026-10-10", c: "2026-10-10", d: "2026-10-10" });
  });

  it("ignores ratings after the run is done", () => {
    const { run } = rate(startCardRun(["a"]), 4);
    const again = rate(run, 1);
    expect(again.run).toBe(run);
    expect(again.end).toBe(false);
  });
});

describe("skipMissing", () => {
  it("moves past ids that no longer exist", () => {
    const run = startCardRun(["a", "gone", "c"]);
    const after = rate(run, 4).run;
    const { run: next, end } = skipMissing(after, (id) => id !== "gone");
    expect(end).toBe(false);
    expect(currentCardId(next)).toBe("c");
  });

  it("returns the same run when the current card exists", () => {
    const run = startCardRun(["a", "b"]);
    expect(skipMissing(run, () => true).run).toBe(run);
  });

  it("ends the run when nothing is left", () => {
    const after = rate(startCardRun(["a", "gone"]), 4).run;
    const { run, end } = skipMissing(after, (id) => id === "a");
    expect(end).toBe(true);
    expect(run.done).toBe(true);
  });
});

describe("cardRunEnd", () => {
  it("shows results once something was rated, else closes", () => {
    const run = startCardRun(["a", "b"]);
    expect(cardRunEnd(run)).toBe("close");
    expect(cardRunEnd(rate(run, 4).run)).toBe("results");
  });
});

describe("sessionOrder", () => {
  const cards = [{ id: "a" }, { uuid: "b" }, { id: "c" }, { id: "d" }];
  const due = new Set(["c", "b"]);

  it("puts due cards first and keeps every card once", () => {
    const ids = sessionOrder(cards, (c) => due.has(c.uuid || c.id));
    expect(new Set(ids.slice(0, 2))).toEqual(due);
    expect([...ids].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("shuffles within each group", () => {
    const ids = sessionOrder(cards, (c) => due.has(c.uuid || c.id), () => 0);
    expect(ids).toEqual(["c", "b", "d", "a"]);
  });
});
