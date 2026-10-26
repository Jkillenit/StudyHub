import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(__dirname, "../../scripts/station-host.ps1");
const hasPowerShell = process.platform === "win32";

// Windows PowerShell 5.1 reads BOM-less files as cp1252; "-" and "->" lookalikes
// (em dash, arrows) then contain curly quotes that break strings.
describe("scripts/station-host.ps1", () => {
  const bytes = fs.readFileSync(file);

  it("starts with a UTF-8 BOM and has no other non-ASCII bytes", () => {
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const bad = [...bytes.subarray(3)].findIndex((b) => b > 0x7f);
    expect(bad, `non-ASCII byte at offset ${bad + 3}`).toBe(-1);
  });

  it.skipIf(!hasPowerShell)("parses with zero errors in Windows PowerShell", () => {
    const cmd =
      "$e=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:HOST_PS1,[ref]$null,[ref]$e)|Out-Null;" +
      "$e|%{ \"$($_.Extent.StartLineNumber): $($_.Message)\" }";
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8", env: { ...process.env, HOST_PS1: file } });
    expect(r.stdout.trim()).toBe("");
  });
});
