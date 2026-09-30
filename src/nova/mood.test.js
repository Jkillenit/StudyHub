import { describe, expect, it } from "vitest";
import { BASELINE, HALF_LIFE_MS, current, feel, tone } from "./mood.js";
import { pick } from "./voice.js";

describe("mood", () => {
  it("starts at baseline", () => {
    expect(current(null, 0)).toEqual({ ...BASELINE, rapport: 0, at: 0 });
  });

  it("relaxes halfway back to baseline per half-life; rapport stays", () => {
    const f = feel(feel(null, "clickSpam", 0), "returned", 0);
    expect(f.annoyance).toBeCloseTo(0.3);
    const later = current(f, HALF_LIFE_MS);
    expect(later.annoyance).toBeCloseTo(0.15);
    expect(later.rapport).toBe(1);
  });

  it("clamps to 0..1", () => {
    let f = null;
    for (let i = 0; i < 10; i += 1) f = feel(f, "clickSpam", 0);
    expect(f.annoyance).toBe(1);
    expect(feel(null, "nudgeTaken", 0).annoyance).toBe(0);
  });

  it("gives her lines a tone", () => {
    expect(tone(null, 0)).toBe(null);
    expect(tone(feel(feel(null, "clickSpam", 0), "clickSpam", 0), 0)).toBe("annoyed");
    expect(tone(feel(null, "gradeUp", 0), 0)).toBe(null);
    expect(tone(feel(feel(null, "gradeUp", 0), "gradeUp", 0), 0)).toBe("proud");
    expect(tone(feel(null, "lateNight", 0), 0)).toBe("tired");
  });

  it("toned lines win when they exist, plain lines otherwise", () => {
    const lib = { hi: ["Hi."], "hi@annoyed": ["What."] };
    expect(pick(lib, "hi", {}, { tone: "annoyed" }).text).toBe("What.");
    expect(pick(lib, "hi", {}, { tone: "proud" }).text).toBe("Hi.");
    expect(pick(lib, "hi", {}, { tone: "annoyed", recent: new Set(["hi@annoyed#0"]) }).text).toBe("Hi.");
  });
});
