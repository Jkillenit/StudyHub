import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const scripts = ["station-host", "station-common", "station-pause", "station-resume"].map((n) =>
  path.join(root, "scripts", `${n}.ps1`),
);
const hasPowerShell = process.platform === "win32";

// Windows PowerShell 5.1 reads BOM-less files as cp1252; em dashes and arrows then contain
// curly-quote bytes that end strings early. So: BOM, ASCII only, and a real parse.
describe.each(scripts)("%s", (file) => {
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
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], {
      encoding: "utf8",
      env: { ...process.env, HOST_PS1: file },
    });
    expect(r.stdout.trim()).toBe("");
  });
});

describe("station scripts share one definition", () => {
  const text = (f) => fs.readFileSync(f, "utf8");

  it("only station-common.ps1 names the watchdog task", () => {
    for (const f of scripts) {
      const has = text(f).includes("NovaStationStudyHubWatchdog");
      expect(has, path.basename(f)).toBe(f.endsWith("station-common.ps1"));
    }
  });

  it("pause and resume support -WhatIf and load the common file", () => {
    for (const n of ["station-pause", "station-resume"]) {
      const t = text(path.join(root, "scripts", `${n}.ps1`));
      expect(t).toContain("SupportsShouldProcess");
      expect(t).toContain("station-common.ps1");
    }
  });

  it("RESUME.md is ASCII and has one-line checklist items b to h for the resume script", () => {
    const md = text(path.join(root, "docs/station/RESUME.md"));
    expect(/[^\x00-\x7f]/.test(md)).toBe(false);
    for (const k of "bcdefgh") expect(md, k).toMatch(new RegExp(`^- \\[ \\] ${k}\\. [^\\r\\n]+$`, "m"));
  });
});
