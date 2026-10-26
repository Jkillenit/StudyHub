import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import fs from "node:fs";

const { createModelRouter, ROUTER_TASKS, estimateCloudCents } = createRequire(import.meta.url)(
  "./modelRouter.cjs",
);

function openDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE station_ai_usage (
      day TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      est_cents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, model)
    );
  `);
  return db;
}

function set(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

describe("modelRouter", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  const now = () => new Date("2026-10-26T12:00:00-05:00");

  beforeEach(() => {
    db = openDb();
    set(db, "station.prefer_local", "1");
    set(db, "station.local_model", "llama3.2");
    set(db, "station.cloud_model", "claude-sonnet-5-5");
    set(db, "station.ollama_base_url", "http://127.0.0.1:11434/api");
    set(db, "station.allow_opus", "0");
    set(db, "station.ai_cap_cents_per_day", "150");
  });

  afterEach(() => {
    db.close();
  });

  it("exports the task allowlist", () => {
    expect([...ROUTER_TASKS].sort()).toEqual(["draft_outline", "draft_rough"]);
  });

  it("rejects unknown tasks", async () => {
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => "k",
      probeOllama: async () => false,
      generateLocal: async () => {
        throw new Error("local should not run");
      },
      generateCloud: async () => {
        throw new Error("cloud should not run");
      },
      now,
    });
    await expect(route("nope", { system: "s", userContent: "u" })).resolves.toEqual({
      ok: false,
      reason: "unknown_task",
    });
  });

  it("prefers local Ollama when probe succeeds", async () => {
    const generateLocal = async ({ model, system, userContent }) => {
      expect(model).toBe("llama3.2");
      expect(system).toBe("sys");
      expect(userContent).toBe("user");
      return { text: "local draft", tokensIn: 10, tokensOut: 20 };
    };
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => "k",
      probeOllama: async () => true,
      generateLocal,
      generateCloud: async () => {
        throw new Error("cloud should not run");
      },
      now,
    });
    const out = await route("draft_outline", {
      system: "sys",
      userContent: "user",
      cacheSystem: true,
    });
    expect(out).toEqual({
      ok: true,
      text: "local draft",
      model: "llama3.2",
      tokensIn: 10,
      tokensOut: 20,
      provider: "ollama",
    });
    const usage = db.prepare("SELECT * FROM station_ai_usage").all();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      day: "2026-10-26",
      model: "llama3.2",
      tokens_in: 10,
      tokens_out: 20,
      est_cents: 0,
    });
  });

  it("falls back to Anthropic when Ollama is down", async () => {
    const generateCloud = async ({ model, apiKey }) => {
      expect(model).toBe("claude-sonnet-5-5");
      expect(apiKey).toBe("sk-test");
      return { text: "cloud draft", tokensIn: 100, tokensOut: 50 };
    };
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => "sk-test",
      probeOllama: async () => false,
      generateLocal: async () => {
        throw new Error("local should not run");
      },
      generateCloud,
      now,
    });
    const out = await route("draft_rough", { system: "s", userContent: "u" });
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("anthropic");
    expect(out.model).toBe("claude-sonnet-5-5");
    expect(out.text).toBe("cloud draft");
    const usage = db.prepare("SELECT * FROM station_ai_usage").get();
    expect(usage.est_cents).toBeGreaterThan(0);
    expect(usage.model).toBe("claude-sonnet-5-5");
  });

  it("returns deferred cap before cloud call when over daily spend", async () => {
    db.prepare(
      `INSERT INTO station_ai_usage (day, model, tokens_in, tokens_out, est_cents)
       VALUES ('2026-10-26', 'claude-sonnet-5-5', 0, 0, 150)`,
    ).run();
    let cloudCalls = 0;
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => "sk",
      probeOllama: async () => false,
      generateCloud: async () => {
        cloudCalls += 1;
        return { text: "x", tokensIn: 1, tokensOut: 1 };
      },
      now,
    });
    await expect(route("draft_outline", { system: "s", userContent: "u" })).resolves.toEqual({
      ok: false,
      deferred: true,
      reason: "cap",
    });
    expect(cloudCalls).toBe(0);
  });

  it("blocks Opus cloud models unless allow_opus is on", async () => {
    set(db, "station.cloud_model", "claude-opus-4-1");
    set(db, "station.prefer_local", "0");
    let cloudCalls = 0;
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => "sk",
      probeOllama: async () => false,
      generateCloud: async () => {
        cloudCalls += 1;
        return { text: "x", tokensIn: 1, tokensOut: 1 };
      },
      now,
    });
    await expect(route("draft_outline", { system: "s", userContent: "u" })).resolves.toEqual({
      ok: false,
      deferred: true,
      reason: "opus_blocked",
    });
    expect(cloudCalls).toBe(0);

    set(db, "station.allow_opus", "1");
    const ok = await route("draft_outline", { system: "s", userContent: "u" });
    expect(ok.ok).toBe(true);
    expect(cloudCalls).toBe(1);
  });

  it("returns unavailable when Ollama down and no API key", async () => {
    const { route } = createModelRouter({
      getDb: () => db,
      getApiKey: () => null,
      probeOllama: async () => false,
      now,
    });
    const out = await route("draft_outline", { system: "s", userContent: "u" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("unavailable");
  });

  it("estimateCloudCents is higher for opus than sonnet/haiku", () => {
    expect(estimateCloudCents("claude-opus-4", 1000, 1000)).toBeGreaterThan(
      estimateCloudCents("claude-sonnet-5-5", 1000, 1000),
    );
    expect(estimateCloudCents("claude-sonnet-5-5", 1000, 1000)).toBeGreaterThan(
      estimateCloudCents("claude-haiku-4-5", 1000, 1000),
    );
  });
});

describe("modelRouter source guard", () => {
  it("does not top-level require ESM AI packages", () => {
    const src = fs.readFileSync(new URL("./modelRouter.cjs", import.meta.url), "utf8");
    expect(src).not.toMatch(/require\(["']ai["']\)/);
    expect(src).not.toMatch(/require\(["']@ai-sdk\/anthropic["']\)/);
    expect(src).not.toMatch(/require\(["']ollama-ai-provider-v2["']\)/);
    expect(src).toMatch(/import\(/);
  });
});
