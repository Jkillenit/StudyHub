import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createDraftsPrepHandler } = require("./draftsPrep.cjs");

const NOW = new Date("2026-10-26T12:00:00-05:00");

function openFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      course_code TEXT
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      due_date TEXT,
      kind TEXT NOT NULL DEFAULT 'assignment',
      submitted INTEGER NOT NULL DEFAULT 0,
      score REAL,
      instructions TEXT
    );
    CREATE TABLE station_drafts (
      id TEXT PRIMARY KEY,
      assignment_uuid TEXT NOT NULL,
      course_uuid TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      docx_path TEXT,
      md_path TEXT,
      model TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      check_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(assignment_uuid, mode)
    );
    CREATE TABLE station_ai_usage (
      day TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      est_cents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, model)
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

describe("draftsPrep handler", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    db = openFixture();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drafts-prep-"));
    const cid = db
      .prepare("INSERT INTO courses (uuid, name, course_code) VALUES (?,?,?)")
      .run("gba", "GBA 490", "GBA 490").lastInsertRowid;
    db.prepare(
      `INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted, score, instructions)
       VALUES ('a1', ?, 'Case 4 paper', '2026-10-28T23:59:00-05:00', 'assignment', 0, NULL, 'Write a case memo')`,
    ).run(cid);
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("preps eligible drafts via injected route", async () => {
    const route = vi.fn(async (task, opts) => {
      expect(task).toBe("draft_outline");
      expect(opts.cacheSystem).toBe(true);
      return { ok: true, text: "OUTLINE — REVIEW BEFORE USE\n\nA. Issue", tokensIn: 5, tokensOut: 5, model: "m" };
    });
    const onDraftReady = vi.fn();
    const handler = createDraftsPrepHandler({
      db,
      route,
      documentsDir: () => path.join(tmp, "Documents"),
      styleDir: () => path.join(tmp, "style"),
      now: () => NOW,
      onDraftReady,
    });
    const result = await handler({
      params: {},
      progress: () => {},
      log: () => {},
      signal: { aborted: false },
    });
    expect(result.summary).toMatch(/draft ready/i);
    expect(route).toHaveBeenCalled();
    expect(onDraftReady).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM station_drafts").get().n).toBe(1);
  });

  it("returns needs_you when route defers for cap", async () => {
    const route = vi.fn(async () => ({ ok: false, deferred: true, reason: "cap" }));
    const handler = createDraftsPrepHandler({
      db,
      route,
      documentsDir: () => path.join(tmp, "Documents"),
      styleDir: () => path.join(tmp, "style"),
      now: () => NOW,
    });
    const result = await handler({ params: {}, progress: () => {}, log: () => {} });
    expect(result.status).toBe("needs_you");
    expect(result.summary).toMatch(/AI cap/i);
  });

  it("never requires provider clients; uses injected route", () => {
    const src = fs.readFileSync(new URL("./draftsPrep.cjs", import.meta.url), "utf8");
    const draftsSrc = fs.readFileSync(new URL("../drafts.cjs", import.meta.url), "utf8");
    expect(src).not.toMatch(/require\([^)]*(anthropic|ollama|aiConfig)/i);
    expect(draftsSrc).not.toMatch(/require\([^)]*(anthropic|ollama|aiConfig)/i);
    expect(draftsSrc).not.toMatch(/callMessages/);
    expect(draftsSrc).toMatch(/route\(/);
  });
});
