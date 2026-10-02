import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands.js";
import { SLASH, slashMatches } from "./slash.js";

describe("slash commands", () => {
  it("lists all commands for a bare slash and filters by prefix", () => {
    expect(slashMatches("/")).toHaveLength(SLASH.length);
    expect(slashMatches("/fo").map((s) => s.cmd)).toEqual(["/focus"]);
    expect(slashMatches("quiz")).toEqual([]);
    expect(slashMatches("/quiz mis")).toEqual([]);
  });
  it("every command fills text the parser understands", () => {
    for (const s of SLASH) {
      if (s.cmd === "/open") continue;
      expect(parseCommand(s.text.trim(), { courses: [] }), s.cmd).not.toBeNull();
    }
  });
});
