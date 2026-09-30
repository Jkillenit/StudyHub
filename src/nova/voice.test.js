import { describe, expect, it } from "vitest";
import { expand, levelOf, pick, variants } from "./voice.js";
import { character } from "../companion/character.js";
import { MEMORY_LINES } from "../companion/memory/lines.js";

const first = () => 0;

describe("voice", () => {
  it("rates lines by their worst word", () => {
    expect(levelOf("Nice work.")).toBe("clean");
    expect(levelOf("Hell yes. Hello.")).toBe("salty");
    expect(levelOf("Well, shit.")).toBe("unfiltered");
    expect(levelOf("Class assignment.")).toBe("clean");
  });

  it("keeps plain-array lines at or under the level, and serious mode clean", () => {
    const entry = ["Clean.", "Damn.", "Fuck."];
    expect(variants("k", entry, "clean").map((v) => v.text)).toEqual(["Clean."]);
    expect(variants("k", entry, "salty").map((v) => v.text)).toEqual(["Clean.", "Damn."]);
    expect(variants("k", entry, "unfiltered")).toHaveLength(3);
    expect(variants("k", entry, "unfiltered", true).map((v) => v.text)).toEqual(["Clean."]);
    expect(variants("k", entry, "salty")[1].id).toBe("k#1");
  });

  it("falls back toward cleaner for per-level entries, never dirtier", () => {
    const entry = { clean: ["c"], unfiltered: ["u"], serious: ["s"] };
    expect(variants("k", entry, "salty").map((v) => v.text)).toEqual(["c"]);
    expect(variants("k", entry, "unfiltered").map((v) => v.text)).toEqual(["u"]);
    expect(variants("k", entry, "unfiltered", true).map((v) => v.text)).toEqual(["s"]);
    expect(variants("k", { salty: ["s"] }, "clean")).toEqual([]);
  });

  it("only uses variants whose fill-ins are known, including dotted paths", () => {
    const lib = { k: ["{task.title} is due.", "Something's due."] };
    expect(pick(lib, "k", {}, { random: first }).text).toBe("Something's due.");
    expect(pick(lib, "k", { task: { title: "Essay" } }, { random: first }).text).toBe("Essay is due.");
  });

  it("skips recent lines, and strict picks give up instead of repeating", () => {
    const lib = { k: ["a", "b"] };
    expect(pick(lib, "k", {}, { recent: new Set(["k#0"]), random: first }).text).toBe("b");
    expect(pick(lib, "k", {}, { recent: new Set(["k#0", "k#1"]), random: first }).text).toBe("a");
    expect(pick(lib, "k", {}, { recent: new Set(["k#0", "k#1"]), strict: true })).toBe(null);
  });

  it("expands #pools#, including nested ones", () => {
    expect(expand("#a# done", { a: ["#b#!"], b: ["Okay"] }, first)).toBe("Okay! done");
  });

  it("every in-app line key has something to say at Clean", () => {
    const silent = [];
    for (const [name, lib] of [["character", character.lines], ["memory", MEMORY_LINES]]) {
      for (const key of Object.keys(lib)) if (!variants(key, lib[key], "clean").length) silent.push(`${name}.${key}`);
    }
    expect(silent).toEqual([]);
  });
});
