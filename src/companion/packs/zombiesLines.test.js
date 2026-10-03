import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZOMBIES_LINES } from "./zombiesLines.js";
import { character, line } from "../character.js";
import { MEMORY_LINES } from "../memory/lines.js";
import { fill, setVoiceTone, variants } from "../../nova/voice.js";
import { greeting } from "../../features/today/briefing.js";

const KEY = "studyHub.v2.prefs.pack";
const FACT = /\{([\w.]+)\}/g;

const texts = (entry) => (Array.isArray(entry) ? entry : Object.values(entry || {}).flat());
const facts = (entry) => new Set(texts(entry).flatMap((t) => [...t.matchAll(FACT)].map((m) => m[1])));
const filled = (entry, vars) => texts(entry).map((t) => fill(t, vars));

describe("Zombies voice pack", () => {
  let store;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const usePack = (id) => store.set(KEY, JSON.stringify(id));

  it("overrides 25-40 keys", () => {
    const n = Object.keys(ZOMBIES_LINES).length;
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(40);
  });

  it("every override key exists in Nova's pools", () => {
    const missing = Object.keys(ZOMBIES_LINES).filter((k) => !character.lines[k] && !MEMORY_LINES[k]);
    expect(missing).toEqual([]);
  });

  it("every override only uses placeholders the Nova key already has", () => {
    const extra = [];
    for (const [key, entry] of Object.entries(ZOMBIES_LINES)) {
      const allowed = facts(character.lines[key] || MEMORY_LINES[key]);
      for (const f of facts(entry)) if (!allowed.has(f)) extra.push(`${key}: {${f}}`);
    }
    expect(extra).toEqual([]);
  });

  it("every override has a clean variant and fits the bubble", () => {
    for (const [key, entry] of Object.entries(ZOMBIES_LINES)) {
      expect(variants(key, entry, "clean").length, key).toBeGreaterThan(0);
      for (const t of texts(entry)) expect(t.length, t).toBeLessThanOrEqual(character.maxBubbleChars);
    }
  });

  it("line() speaks Zombies when the pack is zombies", () => {
    usePack("zombies");
    for (let i = 0; i < 5; i++) expect(ZOMBIES_LINES.quizStart).toContain(line("quizStart"));
    const vars = { answer: "Kanban" };
    expect(filled(ZOMBIES_LINES.wrong, vars)).toContain(line("wrong", vars));
  });

  it("line() speaks Nova when the pack is nova, and switching takes effect immediately", () => {
    usePack("nova");
    expect(character.lines.quizStart).toContain(line("quizStart"));
    usePack("zombies");
    expect(ZOMBIES_LINES.quizStart).toContain(line("quizStart"));
    usePack("nova");
    expect(character.lines.quizStart).toContain(line("quizStart"));
  });

  it("Nova's mood variants don't leak into an overridden key", () => {
    usePack("zombies");
    setVoiceTone("annoyed");
    const vars = { count: 12, course: "MIS 430" };
    try {
      for (let i = 0; i < 5; i++) expect(filled(ZOMBIES_LINES.due, vars)).toContain(line("due", vars));
    } finally {
      setVoiceTone(null);
    }
  });

  it("keys without an override fall back to Nova's lines", () => {
    usePack("zombies");
    expect(ZOMBIES_LINES.tourDone).toBeUndefined();
    expect(character.lines.tourDone).toContain(line("tourDone"));
    expect(line("no.such.key")).toBe("");
  });

  it("Home's greeting follows the pack", () => {
    const late = new Date(2026, 9, 3, 2);
    usePack("nova");
    expect(greeting(late)).toBe("Late one.");
    usePack("zombies");
    expect(ZOMBIES_LINES["home.late"]).toContain(greeting(late));
  });
});
