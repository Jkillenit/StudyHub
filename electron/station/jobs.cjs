/**
 * Station job engine (BRIEFING §4): persistent queue, single runner, dedupe, cancel, recover.
 * No Electron imports — db + handlers are injected.
 */
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { isJobType } = require("./contracts.cjs");

/**
 * @typedef {object} HandlerCtx
 * @property {object} params
 * @property {(pct: number, msg?: string) => void} progress
 * @property {(level: string, msg: string, data?: unknown) => void} log
 * @property {AbortSignal} signal
 */

/**
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {Record<string, (ctx: HandlerCtx) => Promise<{ summary?: string, status?: string }|void>>} [opts.handlers]
 */
function createJobEngine({ db, handlers = {} } = {}) {
  if (!db) throw new Error("createJobEngine requires db");

  const registry = { ...handlers };
  const emitter = new EventEmitter();

  let started = false;
  let busy = false;
  /** @type {{ id: string, controller: AbortController } | null} */
  let current = null;
  let pumpTimer = null;

  const selectJob = db.prepare("SELECT * FROM station_jobs WHERE id = ?");
  const selectActiveByDedupe = db.prepare(
    `SELECT * FROM station_jobs
     WHERE dedupe_key = ? AND status IN ('queued','running')
     LIMIT 1`,
  );
  const selectNextQueued = db.prepare(
    `SELECT * FROM station_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC, rowid ASC
     LIMIT 1`,
  );
  const selectRunning = db.prepare(`SELECT * FROM station_jobs WHERE status = 'running'`);
  const selectQueuedByRun = db.prepare(
    `SELECT id FROM station_jobs WHERE run_id = ? AND status = 'queued'`,
  );
  const insertJob = db.prepare(
    `INSERT INTO station_jobs
      (id, type, status, source, params, progress, attempts, dedupe_key, run_id, created_at)
     VALUES
      (@id, @type, 'queued', @source, @params, 0, 0, @dedupe_key, @run_id, datetime('now'))`,
  );
  const insertEvent = db.prepare(
    `INSERT INTO station_job_events (job_id, level, message, data)
     VALUES (@job_id, @level, @message, @data)`,
  );
  const updateFields = db.prepare(
    `UPDATE station_jobs SET
      status = COALESCE(@status, status),
      progress = COALESCE(@progress, progress),
      summary = CASE WHEN @set_summary = 1 THEN @summary ELSE summary END,
      error = CASE WHEN @set_error = 1 THEN @error ELSE error END,
      attempts = COALESCE(@attempts, attempts),
      started_at = CASE WHEN @set_started = 1 THEN @started_at ELSE started_at END,
      finished_at = CASE WHEN @set_finished = 1 THEN @finished_at ELSE finished_at END
     WHERE id = @id`,
  );
  const selectEvents = db.prepare(
    `SELECT * FROM station_job_events WHERE job_id = ? ORDER BY id ASC`,
  );

  function assertType(type) {
    if (!isJobType(type)) {
      throw new Error(`Unknown job type (not in allowlist): ${type}`);
    }
  }

  function getJob(id) {
    return selectJob.get(id) || null;
  }

  function getEvents(jobId) {
    return selectEvents.all(jobId);
  }

  function writeEvent(jobId, level, message, data) {
    const dataJson = data === undefined ? null : JSON.stringify(data);
    const info = insertEvent.run({
      job_id: jobId,
      level: level || "info",
      message: String(message),
      data: dataJson,
    });
    const evt = {
      id: Number(info.lastInsertRowid),
      job_id: jobId,
      level: level || "info",
      message: String(message),
      data: dataJson,
      at: new Date().toISOString(),
    };
    emitter.emit("job.event", evt);
    return evt;
  }

  /**
   * @param {string} id
   * @param {object} patch
   */
  function patchJob(id, patch) {
    const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
    updateFields.run({
      id,
      status: has("status") ? patch.status : null,
      progress: has("progress") ? patch.progress : null,
      set_summary: has("summary") ? 1 : 0,
      summary: has("summary") ? patch.summary : null,
      set_error: has("error") ? 1 : 0,
      error: has("error") ? patch.error : null,
      attempts: has("attempts") ? patch.attempts : null,
      set_started: has("started_at") ? 1 : 0,
      started_at: has("started_at") ? patch.started_at : null,
      set_finished: has("finished_at") ? 1 : 0,
      finished_at: has("finished_at") ? patch.finished_at : null,
    });
    const job = getJob(id);
    emitter.emit("job.updated", job);
    return job;
  }

  function transition(id, status, { message, error = null, summary = undefined, progress = undefined } = {}) {
    const patch = {
      status,
      finished_at: ["done", "failed", "cancelled", "needs_you"].includes(status)
        ? new Date().toISOString().replace("T", " ").slice(0, 19)
        : undefined,
    };
    if (summary !== undefined) patch.summary = summary;
    if (error !== null || status === "failed" || status === "cancelled") {
      patch.error = error;
    }
    if (status === "queued") {
      patch.error = null;
      patch.finished_at = null;
      patch.started_at = null;
      patch.progress = 0;
    }
    if (progress !== undefined) patch.progress = progress;
    if (status === "done" || status === "needs_you") {
      patch.progress = progress !== undefined ? progress : 100;
      if (!Object.prototype.hasOwnProperty.call(patch, "error")) patch.error = null;
    }

    // Clear finished_at when re-queuing
    if (status === "queued") {
      updateFields.run({
        id,
        status: "queued",
        progress: 0,
        set_summary: 0,
        summary: null,
        set_error: 1,
        error: null,
        attempts: null,
        set_started: 1,
        started_at: null,
        set_finished: 1,
        finished_at: null,
      });
      const job = getJob(id);
      emitter.emit("job.updated", job);
      writeEvent(id, "info", message || `status:${status}`, { status });
      return job;
    }

    const job = patchJob(id, {
      status: patch.status,
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "error") ? { error: patch.error } : {}),
      ...(patch.finished_at !== undefined ? { finished_at: patch.finished_at } : {}),
    });
    writeEvent(id, status === "failed" ? "error" : "info", message || `status:${status}`, {
      status,
      error: error || undefined,
    });
    return job;
  }

  function register(type, handler) {
    assertType(type);
    if (typeof handler !== "function") throw new Error("handler must be a function");
    registry[type] = handler;
  }

  /**
   * @param {object} input
   * @param {string} input.type
   * @param {string} input.source
   * @param {object} [input.params]
   * @param {string|null} [input.dedupeKey]
   * @param {string|null} [input.runId]
   */
  function enqueue({ type, source, params = {}, dedupeKey = null, runId = null }) {
    assertType(type);
    if (!source) throw new Error("enqueue requires source");

    if (dedupeKey) {
      const existing = selectActiveByDedupe.get(dedupeKey);
      if (existing) return existing;
    }

    const id = randomUUID();
    try {
      insertJob.run({
        id,
        type,
        source,
        params: JSON.stringify(params ?? {}),
        dedupe_key: dedupeKey,
        run_id: runId,
      });
    } catch (err) {
      // Race on unique partial index — return the winner
      if (dedupeKey && /UNIQUE/i.test(String(err?.message || err))) {
        const existing = selectActiveByDedupe.get(dedupeKey);
        if (existing) return existing;
      }
      throw err;
    }

    const job = getJob(id);
    emitter.emit("job.updated", job);
    writeEvent(id, "info", "status:queued", { status: "queued" });
    schedulePump();
    return job;
  }

  function cancel(id) {
    const job = getJob(id);
    if (!job) return { ok: false, reason: "not_found" };
    if (["done", "failed", "cancelled", "needs_you"].includes(job.status)) {
      return { ok: false, reason: "terminal" };
    }

    if (job.status === "queued") {
      transition(id, "cancelled", {
        message: "status:cancelled",
        error: "cancelled",
        summary: "cancelled",
      });
      return { ok: true };
    }

    if (job.status === "running" && current?.id === id) {
      current.controller.abort();
      return { ok: true };
    }

    // Running but not this process's current (stale) — mark cancelled
    if (job.status === "running") {
      transition(id, "cancelled", {
        message: "status:cancelled",
        error: "cancelled",
        summary: "cancelled",
      });
      return { ok: true };
    }

    return { ok: false, reason: "unknown" };
  }

  function cancelRunRemainder(runId, exceptId) {
    if (!runId) return;
    const rows = selectQueuedByRun.all(runId);
    for (const row of rows) {
      if (row.id === exceptId) continue;
      transition(row.id, "cancelled", {
        message: "status:cancelled",
        error: "run stopped",
        summary: "cancelled — run stopped (needs_you)",
      });
    }
  }

  /**
   * Boot recovery: running → failed interrupted; requeue once if attempts < 2.
   */
  function recover() {
    const running = selectRunning.all();
    for (const job of running) {
      updateFields.run({
        id: job.id,
        status: "failed",
        progress: null,
        set_summary: 0,
        summary: null,
        set_error: 1,
        error: "interrupted",
        attempts: null,
        set_started: 0,
        started_at: null,
        set_finished: 1,
        finished_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      });
      emitter.emit("job.updated", getJob(job.id));
      writeEvent(job.id, "error", "interrupted", { status: "failed" });

      if (job.attempts < 2) {
        transition(job.id, "queued", { message: "requeued after interrupt" });
      }
    }
  }

  function schedulePump() {
    if (!started || pumpTimer) return;
    pumpTimer = setImmediate(() => {
      pumpTimer = null;
      void pump();
    });
  }

  async function pump() {
    if (!started || busy) return;
    const next = selectNextQueued.get();
    if (!next) return;

    const handler = registry[next.type];
    if (!handler) {
      transition(next.id, "failed", {
        message: "status:failed",
        error: `no handler registered for ${next.type}`,
      });
      schedulePump();
      return;
    }

    busy = true;
    const controller = new AbortController();
    current = { id: next.id, controller };

    const attempts = (next.attempts || 0) + 1;
    updateFields.run({
      id: next.id,
      status: "running",
      progress: 0,
      set_summary: 0,
      summary: null,
      set_error: 1,
      error: null,
      attempts,
      set_started: 1,
      started_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      set_finished: 1,
      finished_at: null,
    });
    emitter.emit("job.updated", getJob(next.id));
    writeEvent(next.id, "info", "status:running", { status: "running", attempts });

    const progress = (pct, msg) => {
      const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      patchJob(next.id, { progress: n });
      if (msg) writeEvent(next.id, "info", String(msg), { progress: n });
    };

    const log = (level, msg, data) => {
      writeEvent(next.id, level || "info", String(msg), data);
    };

    let params = {};
    try {
      params = JSON.parse(next.params || "{}");
    } catch {
      params = {};
    }

    try {
      const result =
        (await handler({
          params,
          progress,
          log,
          signal: controller.signal,
        })) || {};

      if (controller.signal.aborted) {
        transition(next.id, "cancelled", {
          message: "status:cancelled",
          error: "cancelled",
          summary: result.summary || "cancelled",
        });
      } else if (result.status === "needs_you") {
        transition(next.id, "needs_you", {
          message: "status:needs_you",
          summary: result.summary || "needs you",
          progress: 100,
        });
        cancelRunRemainder(next.run_id, next.id);
      } else if (result.status === "failed") {
        transition(next.id, "failed", {
          message: "status:failed",
          error: result.summary || "failed",
          summary: result.summary,
        });
      } else {
        transition(next.id, "done", {
          message: "status:done",
          summary: result.summary || null,
          progress: 100,
        });
      }
    } catch (err) {
      if (controller.signal.aborted || err?.name === "AbortError") {
        transition(next.id, "cancelled", {
          message: "status:cancelled",
          error: "cancelled",
          summary: "cancelled",
        });
      } else {
        transition(next.id, "failed", {
          message: "status:failed",
          error: err?.message || String(err),
        });
      }
    } finally {
      current = null;
      busy = false;
      schedulePump();
    }
  }

  function start() {
    if (started) return { stop };
    recover();
    started = true;
    schedulePump();
    return { stop };
  }

  function stop() {
    started = false;
    if (pumpTimer) {
      clearImmediate(pumpTimer);
      pumpTimer = null;
    }
    if (current) current.controller.abort();
  }

  return {
    enqueue,
    cancel,
    register,
    recover,
    start,
    stop,
    emitter,
    getJob,
    getEvents,
  };
}

module.exports = { createJobEngine };
