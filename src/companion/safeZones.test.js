import { afterEach, describe, expect, it, vi } from "vitest";
import { standOnTarget } from "./safeZones.js";

/** Fake element: `kinds` are the selector tokens it matches (e.g. "button", ".sh-panel"). */
function el(kinds, r, children = []) {
  const e = {
    kinds,
    children,
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }),
  };
  e.contains = (o) => o === e || children.includes(o);
  return e;
}

function stubDom(els, { w = 1200, h = 800 } = {}) {
  vi.stubGlobal("window", { innerWidth: w, innerHeight: h });
  vi.stubGlobal("document", {
    querySelector: () => null,
    querySelectorAll: (sel) => {
      const parts = sel.split(",").map((s) => s.trim());
      return els.filter((e) => e.kinds.some((k) => parts.includes(k)));
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("standOnTarget", () => {
  const S = 180;

  it("stands centered on a wide target with room above", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    stubDom([target]);
    const spot = standOnTarget(target, S);
    expect(spot).toMatchObject({ x: 410, y: 320 });
    expect(spot.plat).toMatchObject({ el: target, top: 500, left: 406, right: 594 });
  });

  it("ignores the panel that contains the target", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    const panel = el([".sh-panel"], { left: 300, top: 300, width: 500, height: 300 }, [target]);
    stubDom([panel, target]);
    expect(standOnTarget(target, S)).toMatchObject({ x: 410, y: 320 });
  });

  it("refuses a narrow target", () => {
    const target = el(["button"], { left: 400, top: 500, width: 80, height: 40 });
    stubDom([target]);
    expect(standOnTarget(target, S)).toBe(null);
  });

  it("refuses when she would cover text above it", () => {
    const target = el(["button"], { left: 400, top: 500, width: 200, height: 40 });
    const text = el(["p"], { left: 420, top: 380, width: 200, height: 20 });
    stubDom([target, text]);
    expect(standOnTarget(target, S)).toBe(null);
  });

  it("refuses when there's no headroom on screen", () => {
    const target = el(["button"], { left: 400, top: 150, width: 200, height: 40 });
    stubDom([target]);
    expect(standOnTarget(target, S)).toBe(null);
  });
});
