import { describe, expect, it } from "vitest";
import {
  GENERIC_DOODLES,
  GLYPHS,
  buildDoodle,
  chasedLetter,
  doodleBox,
  inkLength,
  layoutDoodle,
  letterFor,
  personalOptions,
  pickDoodle,
  textStrokes,
} from "./doodles.js";
import { memoryMap } from "./memory/derive.js";

const NOW = new Date(2026, 8, 30, 21, 0);
const mem = (rows) => memoryMap(rows.map(([key, value, muted = false]) => ({ key, value, muted })));

describe("stroke font", () => {
  it("covers A-Z and 0-9", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") expect(GLYPHS[ch]?.length, ch).toBeGreaterThan(0);
  });

  it("lays text out left to right", () => {
    const one = textStrokes("A");
    const two = textStrokes("AA");
    expect(two.length).toBe(one.length * 2);
    const maxX = (strokes) => Math.max(...strokes.flat().map(([x]) => x));
    expect(maxX(two)).toBeGreaterThan(maxX(one));
  });
});

describe("layoutDoodle", () => {
  it("keeps every point inside the rect", () => {
    const rect = { left: 100, top: 200, width: 150, height: 90 };
    for (const id of [...GENERIC_DOODLES, "gameday", "drill"]) {
      const d = buildDoodle({ id }, () => 0.3);
      for (const s of layoutDoodle(d, rect)) {
        for (const p of s) {
          expect(p.x).toBeGreaterThanOrEqual(rect.left);
          expect(p.x).toBeLessThanOrEqual(rect.left + rect.width);
          expect(p.y).toBeGreaterThanOrEqual(rect.top);
          expect(p.y).toBeLessThanOrEqual(rect.top + rect.height);
        }
      }
    }
  });

  it("sizes wide doodles wide", () => {
    const d = buildDoodle({ id: "course", text: "OM 300" });
    const box = doodleBox(d, 180);
    expect(box.w).toBeGreaterThan(box.h);
    expect(inkLength(layoutDoodle(d, { left: 0, top: 0, width: box.w, height: box.h }))).toBeGreaterThan(0);
  });

  it("ends tic tac toe after a win", () => {
    const d = buildDoodle({ id: "tictactoe" }, () => 0);
    expect(d.strokes.length).toBeGreaterThan(4);
  });
});

describe("personal doodles", () => {
  it("maps targets to letters", () => {
    expect(letterFor(92)).toBe("A");
    expect(letterFor(80)).toBe("B");
    expect(letterFor(50)).toBe(null);
  });

  it("chases the course furthest below target", () => {
    const m = mem([
      ["standing:a", { course: "OM 300", current: 85, target: 90, below: true }],
      ["standing:b", { course: "CS 101", current: 60, target: 80, below: true }],
    ]);
    expect(chasedLetter(m)).toBe("B");
  });

  it("uses only facts she knows, never muted ones", () => {
    const m = mem([
      ["streak", { current: 4, best: 6 }],
      ["top_course", { course: "OM 300", sessions: 5 }],
      ["standing:a", null, true],
    ]);
    const ids = personalOptions(m, NOW).map((o) => o.id);
    expect(ids).toEqual(["streak", "course"]);
    const muted = mem([["streak", null, true]]);
    expect(personalOptions(muted, NOW)).toEqual([]);
  });

  it("knows game days and drill weekends this week", () => {
    const m = mem([
      ["gameday:2026-09-30", { date: "2026-09-30" }],
      ["blocked:2026-10-03", { date: "2026-10-03", reason: "drill" }],
      ["blocked:2026-10-20", { date: "2026-10-20", reason: "drill" }],
    ]);
    expect(personalOptions(m, NOW).map((o) => o.id)).toEqual(["gameday", "drill"]);
    expect(personalOptions(mem([["blocked:2026-10-20", { reason: "drill" }]]), NOW)).toEqual([]);
  });

  it("draws the crimson A on game day, and not twice in a row", () => {
    const m = mem([["gameday:2026-09-30", { date: "2026-09-30" }]]);
    expect(pickDoodle({ memory: m, now: NOW, random: () => 0 }).id).toBe("gameday");
    expect(buildDoodle({ id: "gameday" }).color).toBe("crimson");
    expect(pickDoodle({ memory: m, now: NOW, random: () => 0, last: "gameday" }).id).not.toBe("gameday");
  });

  it("falls back to a generic doodle with no facts", () => {
    expect(GENERIC_DOODLES).toContain(pickDoodle({ memory: {}, now: NOW, random: () => 0.5 }).id);
  });
});
