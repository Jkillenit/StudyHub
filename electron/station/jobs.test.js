import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { createJobEngine } = require("./jobs.cjs");
const { JOB_TYPES } = require("./contracts.cjs");

function openStationDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
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
    CREATE INDEX idx_station_jobs_created ON station_jobs(created_at);

    CREATE TABLE station_job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES station_jobs(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      data TEXT
    );
  `);
  return db;
}

function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) return resolve();
      } catch (err) {
        return reject(err);
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

describe("station job engine", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {ReturnType<typeof createJobEngine>} */
  let engine;

  beforeEach(() => {
    db = openStationDb();
  });

  afterEach(() => {
    engine?.stop?.();
    db?.close();
  });

  it("rejects non-allowlisted job types", () => {
    engine = createJobEngine({ db, handlers: {} });
    expect(() =>
      engine.enqueue({ type: "submit_assignment", source: "desktop" }),
    ).toThrow(/allowlist|unknown|type/i);
    expect(db.prepare("SELECT COUNT(*) AS n FROM station_jobs").get().n).toBe(0);
  });

  it("dedupes by dedupe_key while queued or running", () => {
    engine = createJobEngine({
      db,
      handlers: {
        notify_test: async () => {
          await new Promise(() => {});
        },
      },
    });
    const a = engine.enqueue({
      type: "notify_test",
      source: "remote",
      dedupeKey: "notify_test:once",
    });
    const b = engine.enqueue({
      type: "notify_test",
      source: "remote",
      dedupeKey: "notify_test:once",
    });
    expect(b.id).toBe(a.id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM station_jobs").get().n).toBe(1);
  });

  it("runs one job at a time in created_at order", async () => {
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((r) => {
      releaseFirst = r;
    });

    engine = createJobEngine({
      db,
      handlers: {
        health_check: async ({ params }) => {
          order.push(params.n);
          if (params.n === 1) await firstGate;
          return { summary: `ok ${params.n}` };
        },
      },
    });

    engine.enqueue({ type: "health_check", source: "desktop", params: { n: 1 } });
    engine.enqueue({ type: "health_check", source: "desktop", params: { n: 2 } });
    engine.enqueue({ type: "health_check", source: "desktop", params: { n: 3 } });
    engine.start();

    await waitFor(() => order.length === 1);
    expect(order).toEqual([1]);
    expect(
      db.prepare("SELECT status FROM station_jobs WHERE json_extract(params,'$.n') = 2").get().status,
    ).toBe("queued");

    releaseFirst();
    await waitFor(() => order.length === 3);
    expect(order).toEqual([1, 2, 3]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM station_jobs WHERE status = 'done'").get().n,
    ).toBe(3);
  });

  it("exposes progress, log, and AbortSignal to handlers", async () => {
    const seen = {};
    engine = createJobEngine({
      db,
      handlers: {
        notify_test: async ({ progress, log, signal }) => {
          seen.hasSignal = typeof signal?.aborted === "boolean";
          progress(40, "halfway");
          log("info", "tick", { step: 1 });
          return { summary: "pushed" };
        },
      },
    });
    const job = engine.enqueue({ type: "notify_test", source: "desktop" });
    engine.start();
    await waitFor(() => engine.getJob(job.id).status === "done");

    const row = engine.getJob(job.id);
    expect(row.progress).toBe(100);
    expect(row.summary).toBe("pushed");
    expect(seen.hasSignal).toBe(true);

    const events = engine.getEvents(job.id);
    expect(events.some((e) => e.message.includes("halfway") || e.message === "halfway")).toBe(true);
    expect(events.some((e) => e.message === "tick")).toBe(true);
  });

  it("cancels a mid-run job via AbortSignal", async () => {
    let sawAbort = false;
    engine = createJobEngine({
      db,
      handlers: {
        bb_sync: async ({ signal }) => {
          await new Promise((resolve, reject) => {
            const onAbort = () => {
              sawAbort = true;
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            };
            if (signal.aborted) return onAbort();
            signal.addEventListener("abort", onAbort, { once: true });
          });
        },
      },
    });
    const job = engine.enqueue({ type: "bb_sync", source: "remote" });
    engine.start();
    await waitFor(() => engine.getJob(job.id).status === "running");
    expect(engine.cancel(job.id)).toEqual({ ok: true });
    await waitFor(() => engine.getJob(job.id).status === "cancelled");
    expect(sawAbort).toBe(true);
  });

  it("cancels a queued job without running it", () => {
    engine = createJobEngine({
      db,
      handlers: {
        briefing_build: async () => ({ summary: "built" }),
      },
    });
    // Do not start — leave queued
    const job = engine.enqueue({ type: "briefing_build", source: "schedule" });
    expect(engine.cancel(job.id)).toEqual({ ok: true });
    expect(engine.getJob(job.id).status).toBe("cancelled");
    expect(engine.getJob(job.id).finished_at).toBeTruthy();
  });

  it("on recover: running → failed interrupted, requeue if attempts < 2", () => {
    const id = "job-crash-1";
    db.prepare(
      `INSERT INTO station_jobs (id, type, status, source, params, attempts, started_at)
       VALUES (?, 'health_check', 'running', 'desktop', '{}', 1, datetime('now'))`,
    ).run(id);

    engine = createJobEngine({ db, handlers: { health_check: async () => ({ summary: "ok" }) } });
    engine.recover();

    const row = engine.getJob(id);
    // After recover with attempts=1 (<2): requeued for another try
    expect(row.status).toBe("queued");
    expect(row.error).toBeNull();
    const messages = engine.getEvents(id).map((e) => e.message);
    expect(messages.some((m) => /interrupt/i.test(m))).toBe(true);
  });

  it("failure after 2 attempts stays failed on recover (no requeue)", () => {
    const id = "job-crash-2";
    db.prepare(
      `INSERT INTO station_jobs (id, type, status, source, params, attempts, started_at)
       VALUES (?, 'health_check', 'running', 'desktop', '{}', 2, datetime('now'))`,
    ).run(id);

    engine = createJobEngine({ db, handlers: { health_check: async () => ({ summary: "ok" }) } });
    engine.recover();

    const row = engine.getJob(id);
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/interrupt/i);
    expect(row.finished_at).toBeTruthy();
  });

  it("writes events and emits for every status transition", async () => {
    const updates = [];
    const jobEvents = [];
    engine = createJobEngine({
      db,
      handlers: {
        notify_test: async () => ({ summary: "sent" }),
      },
    });
    engine.emitter.on("job.updated", (job) => updates.push(job.status));
    engine.emitter.on("job.event", (evt) => jobEvents.push(evt.message));

    const job = engine.enqueue({ type: "notify_test", source: "event" });
    expect(updates.at(-1)).toBe("queued");
    engine.start();
    await waitFor(() => engine.getJob(job.id).status === "done");

    expect(updates).toEqual(expect.arrayContaining(["queued", "running", "done"]));
    const persisted = engine.getEvents(job.id);
    expect(persisted.length).toBeGreaterThanOrEqual(3);
    expect(persisted.map((e) => e.message).join(" ")).toMatch(/queued|running|done/i);
    expect(jobEvents.length).toBeGreaterThan(0);
  });

  it("marks needs_you from handler status and stops the rest of the run", async () => {
    engine = createJobEngine({
      db,
      handlers: {
        bb_sync: async () => ({ summary: "sign in", status: "needs_you" }),
        briefing_build: async () => ({ summary: "should not run" }),
      },
    });
    const runId = "run-1";
    const a = engine.enqueue({ type: "bb_sync", source: "remote", runId });
    const b = engine.enqueue({ type: "briefing_build", source: "remote", runId });
    engine.start();
    await waitFor(() => engine.getJob(a.id).status === "needs_you");
    await waitFor(() => engine.getJob(b.id).status === "cancelled");
    expect(engine.getJob(b.id).summary || engine.getJob(b.id).error || "").toMatch(/stop|need|cancel/i);
  });

  it("marks failed when a handler throws", async () => {
    engine = createJobEngine({
      db,
      handlers: {
        drafts_prep: async () => {
          throw new Error("boom");
        },
      },
    });
    const job = engine.enqueue({ type: "drafts_prep", source: "desktop" });
    engine.start();
    await waitFor(() => engine.getJob(job.id).status === "failed");
    expect(engine.getJob(job.id).error).toMatch(/boom/);
  });

  it("register rejects non-allowlisted types", () => {
    engine = createJobEngine({ db });
    expect(() => engine.register("hack_bb", async () => ({}))).toThrow(/allowlist|unknown|type/i);
    for (const type of JOB_TYPES) {
      expect(() => engine.register(type, async () => ({ summary: type }))).not.toThrow();
    }
  });
});
