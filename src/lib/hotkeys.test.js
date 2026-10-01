import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./hotkeys.js";

describe("isTypingTarget", () => {
  it("is true for fields and contentEditable, false otherwise", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName }), tagName).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
