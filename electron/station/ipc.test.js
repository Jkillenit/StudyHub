/**
 * Station IPC registration — injectable ipcMain, no Electron.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { registerStationIpc } = require("./ipc.cjs");
const { hashToken } = require("./auth.cjs");

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler ${channel}`);
      return fn({}, ...args);
    },
  };
}

function memDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE courses (
      uuid TEXT PRIMARY KEY,
      name TEXT,
      course_code TEXT
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
    INSERT INTO settings (key, value) VALUES
      ('station.enabled', '0'),
      ('station.push_details', '0'),
      ('station.ai_cap_cents_per_day', '150'),
      ('station.morning_brief_at', '06:45'),
      ('station.ntfy_url', 'https://ntfy.sh'),
      ('station.draft_model', 'claude-sonnet-5-5');
    INSERT INTO courses (uuid, name, course_code) VALUES ('c1', 'GBA 490', 'GBA 490');
  `);
  return db;
}

describe("registerStationIpc", () => {
  let db;
  let ipcMain;

  beforeEach(() => {
    db = memDb();
    ipcMain = fakeIpcMain();
    registerStationIpc({
      ipcMain,
      getDb: () => db,
      ipcSend: () => {},
      getRuntime: () => null,
      onEnabledChange: vi.fn(),
    });
  });

  it("reads settings and courses", async () => {
    const s = await ipcMain.invoke("station:getSettings");
    expect(s.enabled).toBe("0");
    expect(s.courses).toEqual([{ uuid: "c1", name: "GBA 490", courseCode: "GBA 490" }]);
    expect(s.draftModel).toBe("claude-sonnet-5-5");
  });

  it("enables Station, stores token hash, and mints ntfy topic", async () => {
    const ipc = fakeIpcMain();
    const onEn = vi.fn();
    registerStationIpc({
      ipcMain: ipc,
      getDb: () => db,
      ipcSend: () => {},
      getRuntime: () => null,
      onEnabledChange: onEn,
    });
    const res = await ipc.invoke("station:enable");
    expect(res.ok).toBe(true);
    expect(res.token).toBeTruthy();
    expect(res.ntfyTopic).toBeTruthy();
    expect(onEn).toHaveBeenCalledWith(true);
    const hash = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.token_hash").value;
    expect(hash).toBe(hashToken(res.token));
    expect(db.prepare("SELECT value FROM settings WHERE key = ?").get("station.enabled").value).toBe("1");
  });

  it("rejects non-https ntfy url patches", async () => {
    const res = await ipcMain.invoke("station:setSettings", { ntfyUrl: "http://bad" });
    expect(res.ok).toBe(false);
  });

  it("saves draft mode per course", async () => {
    const res = await ipcMain.invoke("station:setSettings", { draftModes: { c1: "outline" } });
    expect(res.ok).toBe(true);
    expect(db.prepare("SELECT value FROM settings WHERE key = ?").get("station.draft_mode.c1").value).toBe("outline");
  });

  it("run fails when station runtime is not up", async () => {
    const res = await ipcMain.invoke("station:run", { preset: "briefing" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not running/i);
  });
});
