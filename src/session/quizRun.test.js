import { describe, expect, it } from "vitest";
import { quizStep } from "./quizRun.js";
import { initShield } from "./shield.js";

const card = (i) => ({ id: `c${i}`, front: `Term ${i}`, back: `Def ${i}`, courseId: "x", courseUuid: "x", courseLabel: "X" });
const POOL = [0, 1, 2, 3, 4].map(card);
const FIELDS = { easeFactor: 2.5, intervalDays: 1, repetitions: 1, next_review: "2026-10-04" };

function makeRun(mode, { queue = POOL.slice(0, 3), index = 0, answered = 0, shield = initShield(), endsAt = null } = {}) {
  return {
    mode,
    pool: POOL,
    queue,
    index,
    q: { card: queue[index % queue.length], type: "flip" },
    score: 0,
    streak: 0,
    best: 0,
    answered,
    correct: 0,
    misses: [],
    dates: [],
    reviewed: {},
    courseUuids: new Set(),
    shield,
    hint: null,
    selected: null,
    revealed: false,
    result: null,
    endsAt,
  };
}

const answer = (run, correct) => quizStep(run, { type: "answer", correct, points: correct ? 100 : 0, fields: FIELDS }).run;
const lastChunk = () => ({ ...initShield(), shield: 0, health: 1 });

describe("quizStep", () => {
  it("ends every mode when health reaches zero", () => {
    for (const mode of ["quick", "weak", "streak", "clock"]) {
      const run = answer(makeRun(mode, { shield: lastChunk(), endsAt: 10_000 }), false);
      expect(run.shield.health).toBe(0);
      expect(quizStep(run, { type: "next" }, { now: 0 }).end).toBe("results");
    }
  });

  it("quick and weak end when out of cards, otherwise advance", () => {
    for (const mode of ["quick", "weak"]) {
      const first = quizStep(answer(makeRun(mode, { queue: POOL.slice(0, 2) }), true), { type: "next" });
      expect(first.end).toBeNull();
      expect(first.run.index).toBe(1);
      expect(first.run.result).toBeNull();
      expect(quizStep(answer(first.run, true), { type: "next" }).end).toBe("results");
    }
  });

  it("a lost health chunk re-queues the card and the last-card check uses the grown queue", () => {
    const run = answer(makeRun("quick", { queue: POOL.slice(0, 2), index: 1, shield: { ...initShield(), shield: 0 } }), false);
    expect(run.shield.last).toBe("health");
    expect(run.queue).toHaveLength(3);
    expect(run.queue[2].id).toBe("c1");
    const next = quizStep(run, { type: "next" });
    expect(next.end).toBeNull();
    expect(next.run.index).toBe(2);
    expect(next.run.q.card.id).toBe("c1");
  });

  it("streak and clock runs do not re-queue", () => {
    for (const mode of ["streak", "clock"]) {
      const run = answer(makeRun(mode, { shield: { ...initShield(), shield: 0 }, endsAt: 10_000 }), false);
      expect(run.shield.last).toBe("health");
      expect(run.queue).toHaveLength(3);
    }
  });

  it("clock ends when time is up", () => {
    const run = answer(makeRun("clock", { endsAt: 1000 }), true);
    expect(quizStep(run, { type: "next" }, { now: 999 }).end).toBeNull();
    expect(quizStep(run, { type: "next" }, { now: 1000 }).end).toBe("results");
  });

  it("skip is ungraded and ends the run on the last card", () => {
    const run = makeRun("quick", { queue: POOL.slice(0, 2), answered: 1 });
    const skipped = quizStep(run, { type: "skip" });
    expect(skipped.end).toBeNull();
    expect(skipped.run.index).toBe(1);
    expect(skipped.run.answered).toBe(1);
    expect(skipped.run.shield).toBe(run.shield);
    expect(skipped.run.dates).toEqual([]);
    expect(quizStep(skipped.run, { type: "skip" }).end).toBe("results");
  });

  it("closing with nothing answered returns no results", () => {
    expect(quizStep(makeRun("quick"), { type: "quit" }).end).toBe("close");
    expect(quizStep(makeRun("quick", { queue: POOL.slice(0, 1) }), { type: "skip" }).end).toBe("close");
    expect(quizStep(answer(makeRun("quick"), true), { type: "quit" }).end).toBe("results");
  });

  it("counts a missed card once and ignores out-of-order events", () => {
    let run = makeRun("streak", { queue: [card(0)] });
    run = answer(run, false);
    expect(quizStep(run, { type: "skip" }).run).toBe(run);
    expect(quizStep(run, { type: "answer", correct: true, fields: FIELDS }).run).toBe(run);
    run = quizStep(run, { type: "next" }).run;
    expect(quizStep(run, { type: "next" }).run).toBe(run);
    run = answer(run, false);
    expect(run.misses).toHaveLength(1);
    expect(run.answered).toBe(2);
    expect(run.reviewed).toEqual({ c0: "2026-10-04" });
  });
});
