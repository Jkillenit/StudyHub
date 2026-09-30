import { describe, expect, it } from "vitest";
import { factStrings, keepsFacts } from "./rephrase.js";

const original = "MIS 430 is back over 80. 82% now. That was you.";
const facts = factStrings({ course: "MIS 430", current: 82, target: 80 });

describe("keepsFacts", () => {
  it("accepts a tone change with every fact intact", () => {
    expect(keepsFacts(original, "Look at that. MIS 430 sits at 82%, over 80 again. All you.", facts)).toBe(true);
  });

  it("rejects a changed number", () => {
    expect(keepsFacts(original, "MIS 430 is at 85% now, over 80. Nice.", facts)).toBe(false);
  });

  it("rejects an invented number", () => {
    expect(keepsFacts(original, "MIS 430 hit 82%, over 80, up 3 points. Nice.", facts)).toBe(false);
  });

  it("rejects a dropped name", () => {
    expect(keepsFacts(original, "Your class is back at 82%, over 80.", facts)).toBe(false);
  });

  it("rejects overlong or multi-line output", () => {
    expect(keepsFacts(original, `MIS 430 82 80 ${"x".repeat(200)}`, facts)).toBe(false);
    expect(keepsFacts(original, "MIS 430\n82 80", facts)).toBe(false);
  });
});
