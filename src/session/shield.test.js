import { describe, expect, it } from "vitest";
import { HEALTH_MAX, SHIELD_MAX, applyAnswer, earnedMedals, initShield, isDepleted, shieldStatus } from "./shield.js";

const run = (answers, s = initShield()) => answers.reduce((acc, ok) => applyAnswer(acc, ok), s);

describe("shield", () => {
  it("starts full and stable", () => {
    const s = initShield();
    expect(s).toMatchObject({ shield: SHIELD_MAX, health: HEALTH_MAX, wentDown: false, last: null });
    expect(shieldStatus(s)).toBe("STABLE");
  });

  it("absorbs misses until the shield is down", () => {
    expect(run([false]).shield).toBe(65);
    expect(run([false]).last).toBe("hit");
    expect(shieldStatus(run([false]))).toBe("HIT · RECHARGE IN 3");
    expect(run([false, false]).shield).toBe(30);
    const down = run([false, false, false]);
    expect(down).toMatchObject({ shield: 0, health: HEALTH_MAX, wentDown: true, downCount: 1, last: "down" });
    expect(shieldStatus(down)).toBe("SHIELDS DOWN");
  });

  it("drops health only while shields are down and flags a re-queue", () => {
    const s = run([false, false, false, false]);
    expect(s).toMatchObject({ shield: 0, health: HEALTH_MAX - 1, lostChunks: 1, last: "health" });
  });

  it("recharges to full after three correct in a row", () => {
    const hit = run([false, true, true]);
    expect(hit.shield).toBe(65);
    expect(shieldStatus(hit)).toBe("HIT · RECHARGE IN 1");
    const full = applyAnswer(hit, true);
    expect(full).toMatchObject({ shield: SHIELD_MAX, last: "recharge" });
    expect(shieldStatus(full)).toBe("STABLE");
  });

  it("a miss resets the recharge count", () => {
    expect(run([false, true, true, false, true, true]).shield).toBe(30);
  });

  it("correct answers at full shield change nothing visible", () => {
    expect(run([true, true, true, true])).toMatchObject({ shield: SHIELD_MAX, last: null });
  });

  it("is depleted at zero health and never goes below", () => {
    const s = run(Array(3 + HEALTH_MAX + 2).fill(false));
    expect(s.health).toBe(0);
    expect(isDepleted(s)).toBe(true);
    expect(s.downCount).toBe(1);
  });

  it("counts each time the shields go down", () => {
    expect(run([false, false, false, true, true, true, false, false, false]).downCount).toBe(2);
  });
});

describe("earnedMedals", () => {
  it("needs a minimum number of answers", () => {
    expect(earnedMedals({ answered: 4, correct: 4, best: 4, wentDown: false })).toEqual([]);
  });

  it("awards unbroken, perfect and streak", () => {
    const ids = earnedMedals({ answered: 6, correct: 6, best: 6, wentDown: false }).map((m) => m.id);
    expect(ids).toEqual(["unbroken", "perfect", "streak"]);
  });

  it("streak medal carries the count", () => {
    const m = earnedMedals({ answered: 10, correct: 8, best: 6, wentDown: true });
    expect(m).toEqual([{ id: "streak", label: "Streak", detail: "6 clean in a row", badge: "6×" }]);
  });
});
