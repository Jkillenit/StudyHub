import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { createCallMessagesRoute, DRAFT_TASKS } = require("./routeStub.cjs");
const { checkSpendCap } = require("./drafts.cjs");

function openDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE station_ai_usage (
      day TEXT NOT NULL, model TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      est_cents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, model)
    );
  `);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.ai_cap_cents_per_day", "150");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.cloud_model", "claude-sonnet-5-5");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.allow_opus", "0");
  return db;
}

describe("routeStub createCallMessagesRoute", () => {
  it("rejects unknown tasks", async () => {
    const db = openDb();
    const route = createCallMessagesRoute({
      getDb: () => db,
      getApiKey: () => "key",
      checkSpendCap,
      callMessages: vi.fn(),
    });
    expect(await route("flashcards", {})).toEqual({ ok: false, reason: "unknown_task" });
    expect(DRAFT_TASKS.has("draft_outline")).toBe(true);
    db.close();
  });

  it("returns deferred cap when spend is exhausted", async () => {
    const db = openDb();
    const day = new Date().toISOString().slice(0, 10);
    // local day key in drafts uses local timezone — write a high usage for today via many possible keys
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    db.prepare(
      `INSERT INTO station_ai_usage (day, model, tokens_in, tokens_out, est_cents) VALUES (?, ?, 0, 0, ?)`,
    ).run(local, "claude-sonnet-5-5", 999);
    const callMessages = vi.fn();
    const route = createCallMessagesRoute({
      getDb: () => db,
      getApiKey: () => "key",
      checkSpendCap,
      callMessages,
    });
    expect(await route("draft_outline", { system: "s", userContent: "u" })).toEqual({
      ok: false,
      deferred: true,
      reason: "cap",
    });
    expect(callMessages).not.toHaveBeenCalled();
    db.close();
    void day;
  });

  it("delegates draft tasks to callMessages", async () => {
    const db = openDb();
    const callMessages = vi.fn(async () => "outline text");
    const route = createCallMessagesRoute({
      getDb: () => db,
      getApiKey: () => "sk-test",
      checkSpendCap,
      callMessages,
    });
    const result = await route("draft_rough", {
      cacheSystem: true,
      system: "sys",
      userContent: "user",
      maxTokens: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe("outline text");
    expect(result.provider).toBe("anthropic");
    expect(callMessages).toHaveBeenCalledWith("sk-test", expect.objectContaining({
      model: "claude-sonnet-5-5",
      system: "sys",
      userContent: "user",
      maxTokens: 100,
    }));
    db.close();
  });

  it("blocks opus unless allow_opus=1", async () => {
    const db = openDb();
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("claude-opus-4", "station.cloud_model");
    const route = createCallMessagesRoute({
      getDb: () => db,
      getApiKey: () => "key",
      checkSpendCap,
      callMessages: vi.fn(),
    });
    expect(await route("draft_outline", { system: "s", userContent: "u" })).toEqual({
      ok: false,
      deferred: true,
      reason: "opus_blocked",
    });
    db.close();
  });
});
