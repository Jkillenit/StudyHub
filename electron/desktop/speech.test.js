import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { createSpeech, fill, UNPROMPTED_GAP_MS } = createRequire(import.meta.url)("./speech.cjs");

const lines = {
  hi: ["Hi, {name}."],
  chat: ["one", "two"],
  grade: ["New grade in {course}."],
  levels: { salty: ["Damn."], clean: ["Darn."], unfiltered: ["Shit."] },
  saltyOnly: { salty: ["Hell yes."] },
  legacy: { normal: ["Damn."], clean: ["Darn."] },
  low: { salty: ["Well, damn."], serious: ["That one stung."] },
};

function setup(over = {}) {
  let t = 1_000_000;
  let hidden = false;
  let quiet = false;
  const shown = [];
  const s = createSpeech({
    lines,
    show: (b) => shown.push(b.text),
    isHidden: () => hidden,
    companion: () => ({ quiet }),
    name: () => "",
    level: () => "normal",
    now: () => t,
    random: () => 0,
    ...over,
  });
  return {
    s,
    shown,
    tick: (ms) => (t += ms),
    hide: (v) => (hidden = v),
    quiet: (v) => (quiet = v),
  };
}

describe("fill", () => {
  it("drops the name cleanly when unknown", () => {
    expect(fill("Hi, {name}.", {})).toBe("Hi.");
    expect(fill("Hi, {name}.", { name: "Sam" })).toBe("Hi, Sam.");
    expect(fill("{name}, {item} closes soon.", { item: "hw 4" })).toBe("Hw 4 closes soon.");
  });
});

describe("speech", () => {
  it("allows one unprompted line per 15 minutes", () => {
    const { s, tick } = setup();
    expect(s.say({ lineId: "chat", unprompted: true })).toBe("shown");
    tick(UNPROMPTED_GAP_MS - 1);
    expect(s.say({ lineId: "chat", unprompted: true })).toBe("dropped");
    tick(1);
    expect(s.say({ lineId: "chat", unprompted: true })).toBe("shown");
  });

  it("prompted lines and notifications ignore the rate limit", () => {
    const { s } = setup();
    s.say({ lineId: "chat", unprompted: true });
    expect(s.say({ lineId: "hi" })).toBe("shown");
    expect(s.say({ lineId: "grade", priority: 3, unprompted: true, vars: { course: "GBA 490" } })).toBe("shown");
  });

  it("quiet mode silences unprompted chatter only", () => {
    const { s, quiet } = setup();
    quiet(true);
    expect(s.say({ lineId: "chat", unprompted: true })).toBe("dropped");
    expect(s.say({ lineId: "hi" })).toBe("shown");
  });

  it("queues notifications while hidden and delivers the most important first", () => {
    const { s, shown, hide } = setup();
    hide(true);
    expect(s.say({ lineId: "chat", unprompted: true })).toBe("dropped");
    expect(s.say({ lineId: "hi", priority: 1 })).toBe("queued");
    expect(s.say({ lineId: "grade", priority: 3, vars: { course: "OM 300" } })).toBe("queued");
    expect(s.flushOne()).toBe(false);
    hide(false);
    s.flushOne();
    s.flushOne();
    expect(shown).toEqual(["New grade in OM 300.", "Hi."]);
  });

  it("holds notifications while another is up and drops expired ones", () => {
    let busy = true;
    const { s, shown, tick } = setup({ busy: () => busy });
    expect(s.say({ lineId: "hi" })).toBe("shown");
    expect(s.say({ lineId: "grade", priority: 3, vars: { course: "OM 300" } })).toBe("queued");
    expect(s.say({ lineId: "chat", priority: 4, expiresAt: 1_000_500 })).toBe("queued");
    busy = false;
    tick(1000);
    s.flushOne();
    expect(shown).toEqual(["Hi.", "New grade in OM 300."]);
    expect(s.queued).toBe(0);
  });

  it("does not repeat the same variant twice in a row", () => {
    const { s, shown } = setup();
    s.say({ lineId: "chat" });
    s.say({ lineId: "chat" });
    expect(shown).toEqual(["one", "two"]);
  });

  it("picks the language level and only falls back toward cleaner", () => {
    const said = (level, lineId) => {
      const t = setup({ level: () => level });
      t.s.say({ lineId });
      return t.shown[0];
    };
    expect(said("clean", "levels")).toBe("Darn.");
    expect(said("salty", "levels")).toBe("Damn.");
    expect(said("unfiltered", "levels")).toBe("Shit.");
    expect(said("unfiltered", "saltyOnly")).toBe("Hell yes.");
    expect(said("clean", "saltyOnly")).toBeUndefined();
    expect(said("salty", "legacy")).toBe("Damn.");
    expect(said("bogus", "levels")).toBe("Damn.");
  });

  it("serious mode uses the serious variant, else the clean one", () => {
    const a = setup({ level: () => "unfiltered", serious: (id) => id === "low" });
    a.s.say({ lineId: "low" });
    a.s.say({ lineId: "levels" });
    a.s.say({ lineId: "levels", serious: true });
    expect(a.shown).toEqual(["That one stung.", "Shit.", "Darn."]);
  });
});
