import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PACKS, applyStoredPack, getPack, setPack } from "./pack.js";

const KEY = "studyHub.v2.prefs.pack";

describe("flavor pack pref", () => {
  let store;
  let html;

  beforeEach(() => {
    store = new Map();
    html = { dataset: {} };
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    });
    vi.stubGlobal("document", { documentElement: html });
    vi.stubGlobal("window", new EventTarget());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists nova first as the default", () => {
    expect(PACKS).toEqual(["nova", "zombies"]);
    expect(getPack()).toBe("nova");
  });

  it("falls back to nova for invalid stored or requested ids", () => {
    store.set(KEY, JSON.stringify("vaporwave"));
    expect(getPack()).toBe("nova");
    store.set(KEY, "{not json");
    expect(getPack()).toBe("nova");
    setPack("zombies");
    setPack("bogus");
    expect(getPack()).toBe("nova");
    expect(html.dataset.pack).toBe("nova");
  });

  it("setPack saves, sets html[data-pack] and fires the event", () => {
    const seen = [];
    window.addEventListener("studyhub-pack-changed", (e) => seen.push(e.detail.pack));
    setPack("zombies");
    expect(store.get(KEY)).toBe(JSON.stringify("zombies"));
    expect(html.dataset.pack).toBe("zombies");
    expect(seen).toEqual(["zombies"]);
  });

  it("applyStoredPack applies the saved pack", () => {
    store.set(KEY, JSON.stringify("zombies"));
    applyStoredPack();
    expect(html.dataset.pack).toBe("zombies");
  });
});
