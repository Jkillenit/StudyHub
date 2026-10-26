import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const { start, readEnabled } = createRequire(import.meta.url)("./index.cjs");

function fakeAdapter({ enabled = "0" } = {}) {
  const settings = new Map([["station.enabled", enabled]]);
  return {
    getDb: () => ({
      prepare: () => ({
        get: (key) => ({ value: settings.get(key) }),
      }),
    }),
    backgroundCheck: vi.fn(),
    paths: { appData: () => "/tmp/app", documents: () => "/tmp/docs" },
    onPower: vi.fn(),
    offPower: vi.fn(),
    ipcSend: vi.fn(),
    setBackgroundCheck: vi.fn(),
  };
}

describe("station boot", () => {
  it("readEnabled treats 1/true as on", () => {
    expect(readEnabled(fakeAdapter({ enabled: "0" }).getDb())).toBe(false);
    expect(readEnabled(fakeAdapter({ enabled: "1" }).getDb())).toBe(true);
    expect(readEnabled(fakeAdapter({ enabled: "true" }).getDb())).toBe(true);
  });

  it("does nothing when station.enabled is off", () => {
    const log = vi.fn();
    const result = start(fakeAdapter({ enabled: "0" }), { log });
    expect(result.started).toBe(false);
    expect(result.stubs).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("logs station ready and exposes stubs when enabled", () => {
    const log = vi.fn();
    const result = start(fakeAdapter({ enabled: "1" }), { log });
    expect(result.started).toBe(true);
    expect(log).toHaveBeenCalledWith("station ready");
    expect(result.stubs).toMatchObject({
      jobs: expect.any(Object),
      scheduler: expect.any(Object),
      api: expect.any(Object),
      notify: expect.any(Object),
    });
    result.stop();
  });
});
