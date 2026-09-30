import { describe, expect, it } from "vitest";
import lines from "../../public/personas/nova/lines.json";

const SALTY = /\b(damn|hell|ass)\b/i;
const UNFILTERED = /\b(shit|fuck\w*|bitch|bastard)\b/i;

describe("nova lines.json language levels", () => {
  it("keeps plain, clean and serious lines clean, and salty lines below unfiltered", () => {
    for (const [id, entry] of Object.entries(lines)) {
      const clean = Array.isArray(entry) ? entry : [...(entry.clean || []), ...(entry.serious || [])];
      for (const t of clean) expect(`${id}: ${t}`).not.toMatch(SALTY), expect(`${id}: ${t}`).not.toMatch(UNFILTERED);
      for (const t of Array.isArray(entry) ? [] : entry.salty || []) expect(`${id}: ${t}`).not.toMatch(UNFILTERED);
    }
  });
});
