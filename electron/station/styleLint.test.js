import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { styleLint, countChecks } = createRequire(import.meta.url)("./styleLint.cjs");

describe("styleLint", () => {
  it("leaves clean text unchanged", () => {
    const text = "I think this case is strong.\n\nThe numbers look fine.";
    expect(styleLint(text)).toBe(text);
    expect(countChecks(text)).toBe(0);
  });

  it("flags ASCII hyphen-minus as [CHECK] without removing it", () => {
    const out = styleLint("long-term plan");
    expect(out).toContain("long-term");
    expect(out).toContain("[CHECK]");
    expect(out).toMatch(/long-term\s*\[CHECK\]/);
  });

  it("flags en dash and em dash", () => {
    expect(styleLint("range 1–5")).toContain("[CHECK]");
    expect(styleLint("aside — note")).toContain("[CHECK]");
    expect(styleLint("range 1–5")).toContain("–");
    expect(styleLint("aside — note")).toContain("—");
  });

  it("does not double-flag an already marked dash", () => {
    const once = styleLint("a-b");
    const twice = styleLint(once);
    expect(twice.match(/\[CHECK\]/g)?.length).toBe(once.match(/\[CHECK\]/g)?.length);
  });

  it("countChecks tallies [CHECK] markers", () => {
    expect(countChecks("one [CHECK] two [CHECK]")).toBe(2);
  });
});
