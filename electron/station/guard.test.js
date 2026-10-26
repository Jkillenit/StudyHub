/**
 * Station guardrails (BRIEFING §7 / S3.2) — static checks over electron/station/**.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { JOB_TYPES } = require("./contracts.cjs");
const { isLoopbackHost, DEFAULT_HOST } = require("./api.cjs");

const STATION_DIR = path.dirname(fileURLToPath(import.meta.url));

const SCHOOL_OR_PUBLISHER =
  /blackboard\.com|ualearn\.|mcgraw|connect\.mheducation|pearson|cengage|wiley|canvas\.|brightspace|d2l\./i;

const MUTATING_METHOD =
  /method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/gi;

const REGISTER_CALL = /jobs\.register\(\s*["']([a-z0-9_]+)["']/g;

/** @param {string} dir */
function listStationSources(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".test.js") || name === "guard.test.js") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...listStationSources(full));
    } else if (name.endsWith(".cjs") || name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

describe("station guardrails", () => {
  const sources = listStationSources(STATION_DIR);

  it("scans station production sources", () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.some((p) => p.endsWith("index.cjs"))).toBe(true);
    expect(sources.some((p) => p.endsWith("api.cjs"))).toBe(true);
  });

  it("only registers allowlisted job types", () => {
    const allow = new Set(JOB_TYPES);
    /** @type {string[]} */
    const found = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(REGISTER_CALL)) {
        found.push(m[1]);
      }
    }
    expect(found.length).toBeGreaterThan(0);
    for (const type of found) {
      expect(allow.has(type), `non-allowlisted register(${type})`).toBe(true);
    }
  });

  it("never issues mutating HTTP methods toward school/publisher origins", () => {
    /** @type {string[]} */
    const hits = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        MUTATING_METHOD.lastIndex = 0;
        if (!MUTATING_METHOD.test(lines[i])) continue;
        // Look nearby for a school/publisher host (same line or ±3).
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (SCHOOL_OR_PUBLISHER.test(window)) {
          hits.push(`${path.relative(STATION_DIR, file)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("API defaults to loopback and refuses non-loopback hosts", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.1")).toBe(false);
    const apiSrc = fs.readFileSync(path.join(STATION_DIR, "api.cjs"), "utf8");
    expect(apiSrc).toMatch(/assertLoopbackHost/);
    expect(apiSrc).toMatch(/127\.0\.0\.1/);
  });
});
