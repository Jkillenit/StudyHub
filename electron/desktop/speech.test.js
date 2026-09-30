import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { createSpeech, fill, UNPROMPTED_GAP_MS } = createRequire(import.meta.url)("./speech.cjs");

const lines = {
  hi: ["Hi, {name}."],
  chat: ["one", "two"],
  grade: ["New grade in {course}."],
  levels: { normal: ["Damn."], clean: ["Darn."] },
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

  it("picks the language level with normal as fallback", () => {
    expect(setup({ level: () => "clean" }).s.say({ lineId: "levels" })).toBe("shown");
    const a = setup({ level: () => "clean" });
    a.s.say({ lineId: "levels" });
    expect(a.shown).toEqual(["Darn."]);
    const b = setup({ level: () => "spicy" });
    b.s.say({ lineId: "levels" });
    expect(b.shown).toEqual(["Damn."]);
  });
});
