import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";

const require = createRequire(import.meta.url);
const { start, readEnabled } = require("./index.cjs");
const { hashToken } = require("./auth.cjs");

function openStationDb({ enabled = "0", token = null } = {}) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'user',
      course_code TEXT,
      bb_course_id TEXT
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      bb_id TEXT,
      title TEXT NOT NULL,
      due_date TEXT,
      kind TEXT NOT NULL DEFAULT 'assignment',
      source TEXT NOT NULL DEFAULT 'manual',
      completed INTEGER DEFAULT 0,
      submitted INTEGER NOT NULL DEFAULT 0,
      score REAL,
      points_possible REAL,
      updated_at TEXT,
      instructions TEXT,
      instructions_synced_at TEXT
    );
    CREATE TABLE announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      posted_at TEXT,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE bb_grade_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      bb_id TEXT NOT NULL,
      name TEXT NOT NULL,
      score REAL,
      points_possible REAL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, bb_id)
    );
    CREATE TABLE bb_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      bb_id TEXT NOT NULL,
      title TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, bb_id)
    );
    CREATE TABLE station_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      progress INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      dedupe_key TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX idx_station_jobs_dedupe ON station_jobs(dedupe_key)
      WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
    CREATE TABLE station_job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES station_jobs(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      data TEXT
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
  `);
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  ins.run("station.enabled", enabled);
  ins.run("station.push_details", "0");
  ins.run("station.ntfy_url", "https://ntfy.sh");
  ins.run("station.morning_brief_at", "06:45");
  ins.run("station.ai_cap_cents_per_day", "150");
  ins.run("station.bb_session", "ok");
  if (token) {
    ins.run("station.token_hash", hashToken(token));
  }
  return db;
}

function fakeAdapter(db) {
  return {
    getDb: () => db,
    backgroundCheck: vi.fn(),
    paths: { appData: () => "/tmp/app", documents: () => "/tmp/docs" },
    onPower: vi.fn(),
    offPower: vi.fn(),
    ipcSend: vi.fn(),
    setBackgroundCheck: vi.fn(),
  };
}

function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) return resolve();
      } catch (err) {
        if (Date.now() - start > timeoutMs) return reject(err);
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

describe("station boot", () => {
  /** @type {import('better-sqlite3').Database | null} */
  let db = null;
  /** @type {{ stop: () => void, stubs?: object } | null} */
  let boot = null;

  afterEach(async () => {
    if (boot?.stubs?.api?.stop) {
      try {
        await boot.stubs.api.stop();
      } catch {
        /* ignore */
      }
    }
    boot?.stop?.();
    boot = null;
    await new Promise((r) => setTimeout(r, 30));
    db?.close?.();
    db = null;
  });

  it("readEnabled treats 1/true as on", () => {
    db = openStationDb({ enabled: "0" });
    expect(readEnabled(db)).toBe(false);
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("1", "station.enabled");
    expect(readEnabled(db)).toBe(true);
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("true", "station.enabled");
    expect(readEnabled(db)).toBe(true);
  });

  it("does nothing when station.enabled is off", () => {
    db = openStationDb({ enabled: "0" });
    const log = vi.fn();
    boot = start(fakeAdapter(db), { log });
    expect(boot.started).toBe(false);
    expect(boot.stubs).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("wires jobs/scheduler/notify and logs ready when enabled", () => {
    db = openStationDb({ enabled: "1" });
    const log = vi.fn();
    const adapter = fakeAdapter(db);
    boot = start(adapter, { log });
    expect(boot.started).toBe(true);
    expect(log).toHaveBeenCalledWith("station ready");
    expect(log).toHaveBeenCalledWith("station api skipped (no station.token_hash)");
    expect(boot.stubs).toMatchObject({
      jobs: expect.objectContaining({ enqueue: expect.any(Function), stop: expect.any(Function) }),
      scheduler: expect.objectContaining({ start: expect.any(Function), stop: expect.any(Function) }),
      api: expect.objectContaining({ stop: expect.any(Function) }),
      notify: expect.objectContaining({ push: expect.any(Function), stop: expect.any(Function) }),
    });
    // Wave 2 handlers registered (enqueue allowlist + handler map)
    for (const type of ["bb_sync", "instructions_sync", "drafts_prep", "briefing_build"]) {
      expect(() =>
        boot.stubs.jobs.enqueue({ type, source: "desktop", params: {} }),
      ).not.toThrow();
    }
    expect(adapter.onPower).toHaveBeenCalledWith("resume", expect.any(Function));
    boot.stop();
    expect(adapter.offPower).toHaveBeenCalledWith("resume", expect.any(Function));
    boot = null;
  });

  it("registers briefing_build and stores station.last_briefing", async () => {
    db = openStationDb({ enabled: "1" });
    boot = start(fakeAdapter(db), { log: vi.fn() });
    const job = boot.stubs.jobs.enqueue({
      type: "briefing_build",
      source: "desktop",
      params: { kind: "on_demand" },
    });
    await waitFor(() => boot.stubs.jobs.getJob(job.id)?.status === "done");
    const raw = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.last_briefing");
    expect(raw?.value).toBeTruthy();
    const briefing = JSON.parse(raw.value);
    expect(briefing.headline).toBeTruthy();
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
  });

  it("starts API on loopback when token_hash is set", async () => {
    const token = randomBytes(16).toString("hex");
    db = openStationDb({ enabled: "1", token });
    const log = vi.fn();
    boot = start(fakeAdapter(db), { log });
    expect(boot.started).toBe(true);
    await waitFor(() => log.mock.calls.some((c) => c[0] === "station ready"));
    expect(log.mock.calls.some((c) => String(c[0]).includes("api failed"))).toBe(false);
    expect(log.mock.calls.some((c) => String(c[0]).includes("api skipped"))).toBe(false);
    await boot.stubs.api.stop();
  });
});
