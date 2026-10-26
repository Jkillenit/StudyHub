import { describe, expect, it, beforeEach } from "vitest";
import { createStorage, storageKeys } from "./storage.js";

function memoryStore() {
  /** @type {Record<string, string>} */
  const map = {};
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

describe("remote storage", () => {
  /** @type {ReturnType<typeof createStorage>} */
  let storage;

  beforeEach(() => {
    storage = createStorage(memoryStore());
  });

  it("stores and clears the bearer token", () => {
    expect(storage.getToken()).toBe("");
    storage.setToken("  abc.token  ");
    expect(storage.getToken()).toBe("abc.token");
    storage.clearToken();
    expect(storage.getToken()).toBe("");
  });

  it("round-trips the last briefing JSON", () => {
    expect(storage.getLastBriefing()).toBeNull();
    const briefing = {
      generatedAt: "2026-10-26T06:45:00-05:00",
      kind: "morning",
      headline: "Quiet morning.",
    };
    storage.setLastBriefing(briefing);
    expect(storage.getLastBriefing()).toEqual(briefing);
    storage.setLastBriefing(null);
    expect(storage.getLastBriefing()).toBeNull();
  });

  it("normalizes base URL without trailing slash", () => {
    storage.setBaseUrl("https://pc.ts.net/");
    expect(storage.getBaseUrl()).toBe("https://pc.ts.net");
  });

  it("uses stable key names", () => {
    expect(storageKeys.TOKEN_KEY).toMatch(/^studyHub\.station\.remote\./);
  });
});
