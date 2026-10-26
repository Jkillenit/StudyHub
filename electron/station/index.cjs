/**
 * Station boot: wire Wave 1–2 jobs / scheduler / notify / briefing / API / handlers
 * behind `station.enabled`.
 */

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createJobEngine } = require("./jobs.cjs");
const { createScheduler } = require("./scheduler.cjs");
const { createNotify } = require("./notify.cjs");
const { buildBriefing, readFacts } = require("./briefing.cjs");
const api = require("./api.cjs");
const { expandPreset } = require("./contracts.cjs");
const { hasEligibleDrafts, checkSpendCap } = require("./drafts.cjs");
const { createInstructionsSyncHandler } = require("./handlers/instructionsSync.cjs");
const { createDraftsPrepHandler } = require("./handlers/draftsPrep.cjs");
const { resolveStationRoute } = require("./routeStub.cjs");

const STATIC_ROOT = path.join(__dirname, "../../dist/station-remote");

/** Lazy — anthropicClient → aiConfig imports electron. */
function loadCallMessages() {
  try {
    return require("../anthropicClient.cjs").callMessages;
  } catch {
    return async () => {
      throw new Error("callMessages unavailable outside Electron");
    };
  }
}

const BRIEFING_MAX_AGE_MS = 10 * 60 * 1000;

/** @param {import('better-sqlite3').Database} db */
function readEnabled(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.enabled");
  const v = row?.value;
  return v === "1" || v === "true";
}

/** @param {import('better-sqlite3').Database} db @param {string} key @param {string|null} [fallback] */
function getSetting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value != null ? String(row.value) : fallback;
}

/** @param {import('better-sqlite3').Database} db @param {string} key @param {string} value */
function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} briefing
 */
function persistBriefing(db, briefing) {
  setSetting(db, "station.last_briefing", JSON.stringify(briefing));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {import('node:events').EventEmitter} emitter
 * @param {string} [kind]
 * @param {Date|string|number} [now]
 */
function buildAndStoreBriefing(db, emitter, kind = "on_demand", now = new Date()) {
  const facts = readFacts(db, now);
  const briefing = buildBriefing({ ...facts, kind }, now);
  persistBriefing(db, briefing);
  emitter.emit("briefing.ready", briefing);
  return briefing;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {import('node:events').EventEmitter} emitter
 */
function getOrRebuildBriefing(db, emitter) {
  const raw = getSetting(db, "station.last_briefing");
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      const gen = Date.parse(cached?.generatedAt);
      if (Number.isFinite(gen) && Date.now() - gen < BRIEFING_MAX_AGE_MS) {
        return cached;
      }
    } catch {
      /* rebuild */
    }
  }
  return buildAndStoreBriefing(db, emitter, "on_demand");
}

/**
 * @param {ReturnType<typeof createJobEngine>} jobs
 * @param {string} preset
 * @param {string} source
 */
function enqueueRun(jobs, preset, source) {
  const types = expandPreset(preset);
  const runId = randomUUID();
  const jobIds = types.map(
    (type) =>
      jobs.enqueue({
        type,
        source,
        params: type === "briefing_build" ? { kind: "run" } : {},
        runId,
      }).id,
  );
  return { runId, jobIds };
}

/**
 * @param {{ getDb: () => import('better-sqlite3').Database, onPower?: Function, offPower?: Function, paths?: object, backgroundCheck?: Function }} adapter
 * @param {{ log?: (msg: string) => void, extractBufferText?: Function, getApiKey?: () => string|null }} [opts]
 */
function start(adapter, { log = (msg) => console.info(msg), extractBufferText, getApiKey } = {}) {
  const db = adapter.getDb();
  if (!readEnabled(db)) {
    return { started: false, stop() {}, stubs: null };
  }

  const bootAt = Date.now();
  /** @type {{ stop: () => Promise<void> } | null} */
  let apiHandle = null;
  /** @type {Promise<void> | null} */
  let apiReady = null;

  const notify = createNotify({
    getConfig: () => ({
      ntfyUrl: getSetting(db, "station.ntfy_url", "https://ntfy.sh") || "https://ntfy.sh",
      ntfyTopic: getSetting(db, "station.ntfy_topic", "") || "",
      pushDetails: getSetting(db, "station.push_details", "0") === "1",
      clickUrl: getSetting(db, "station.click_url", "") || "",
    }),
  });

  const jobs = createJobEngine({ db, handlers: {} });

  const route = resolveStationRoute({
    getDb: () => db,
    getApiKey: typeof getApiKey === "function" ? getApiKey : () => null,
    checkSpendCap,
    callMessages: loadCallMessages(),
  });

  jobs.register("bb_sync", async ({ progress, log: jobLog, signal }) => {
    const check = adapter.backgroundCheck;
    if (typeof check !== "function") {
      return { summary: "backgroundCheck unavailable", status: "failed" };
    }
    const courses = db
      .prepare(
        `SELECT uuid, bb_course_id FROM courses
         WHERE bb_course_id IS NOT NULL AND bb_course_id != ''`,
      )
      .all();
    let okCount = 0;
    let expired = false;
    for (let i = 0; i < courses.length; i++) {
      if (signal?.aborted) return { summary: "cancelled", status: "cancelled" };
      const c = courses[i];
      progress?.(Math.round((i / Math.max(courses.length, 1)) * 90), `sync ${c.bb_course_id}`);
      try {
        const res = await check(c.bb_course_id);
        if (res?.error === "not-logged-in") {
          expired = true;
          setSetting(db, "station.bb_session", "expired");
          break;
        }
        if (res?.ok) {
          okCount += 1;
          setSetting(db, "station.bb_session", "ok");
          setSetting(db, "station.last_sync_at", new Date().toISOString());
        }
      } catch (err) {
        jobLog?.("warn", err?.message || String(err), { bbCourseId: c.bb_course_id });
      }
    }
    progress?.(100, "done");
    if (expired) return { summary: "Blackboard session expired", status: "needs_you" };
    return { summary: `synced ${okCount}/${courses.length} courses` };
  });

  jobs.register(
    "instructions_sync",
    createInstructionsSyncHandler({
      db,
      appDataPath: adapter.paths?.appData?.() || "",
      fetchInstructions: async (bbCourseId, columnId) => {
        // Lazy require — bbSync imports electron; keep station unit tests electron-free.
        const { fetchAssignmentInstructions } = require("../bbSync.cjs");
        return fetchAssignmentInstructions(bbCourseId, columnId, {
          extractBufferText:
            typeof extractBufferText === "function" ? extractBufferText : undefined,
        });
      },
    }),
  );

  jobs.register(
    "drafts_prep",
    createDraftsPrepHandler({
      db,
      route,
      documentsDir: () => adapter.paths?.documents?.() || "",
      styleDir: () => path.join(adapter.paths?.appData?.() || "", "station", "style"),
      onDraftReady: (draft) =>
        notify.notifyEvent("draft_ready", {
          course: draft.course,
          title: draft.title,
          mode: draft.mode,
        }),
    }),
  );

  jobs.register("briefing_build", async ({ params }) => {
    const kind = typeof params?.kind === "string" ? params.kind : "on_demand";
    const briefing = buildAndStoreBriefing(db, jobs.emitter, kind);
    if (kind === "morning") {
      void notify.notifyEvent("morning_briefing", { detail: briefing.headline }).catch(() => {});
    }
    return { summary: briefing.headline };
  });

  jobs.register("notify_test", async () => {
    const result = await notify.push({
      title: "Nova: test push",
      body: "",
      priority: "low",
      eventType: "notify_test",
    });
    if (!result.ok) return { summary: result.error || "notify failed", status: "failed" };
    return { summary: "test push sent" };
  });

  jobs.register("health_check", async () => {
    const session = getSetting(db, "station.bb_session", "unknown") || "unknown";
    const lastSyncAt = getSetting(db, "station.last_sync_at", null);
    return {
      summary: `session=${session}; lastSync=${lastSyncAt || "never"}`,
    };
  });

  function enqueueFromScheduler(spec) {
    if (spec?.preset) {
      return enqueueRun(jobs, spec.preset, spec.source || "schedule");
    }
    return jobs.enqueue({
      type: spec.type,
      source: spec.source || "schedule",
      params: spec.params || {},
    });
  }

  const scheduler = createScheduler({
    enqueue: enqueueFromScheduler,
    hasEligibleDrafts: (now) => hasEligibleDrafts(db, now),
    getMorningBriefAt: () => getSetting(db, "station.morning_brief_at", "06:45") || "06:45",
  });

  const onResume = () => scheduler.resumed();
  if (typeof adapter.onPower === "function") {
    adapter.onPower("resume", onResume);
  }

  jobs.start();
  scheduler.start();
  notify.start();

  const services = {
    events: jobs.emitter,
    getHealth() {
      const queueDepth = Number(
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM station_jobs WHERE status IN ('queued','running')`,
          )
          .get()?.n || 0,
      );
      return {
        ok: true,
        version: "1.1.0",
        uptimeSec: Math.max(0, Math.floor((Date.now() - bootAt) / 1000)),
        session: getSetting(db, "station.bb_session", "unknown") || "unknown",
        lastSyncAt: getSetting(db, "station.last_sync_at", null),
        queueDepth,
      };
    },
    getBriefing() {
      return getOrRebuildBriefing(db, jobs.emitter);
    },
    startRun(preset) {
      return enqueueRun(jobs, preset || "briefing", "remote");
    },
    listJobs(since) {
      if (since) {
        return db
          .prepare(
            `SELECT * FROM station_jobs
             WHERE created_at >= ? OR datetime(created_at) >= datetime(?)
             ORDER BY created_at DESC`,
          )
          .all(since, since);
      }
      return db.prepare(`SELECT * FROM station_jobs ORDER BY created_at DESC LIMIT 100`).all();
    },
    getJob(id) {
      const job = jobs.getJob(id);
      if (!job) return null;
      return { job, events: jobs.getEvents(id) };
    },
    cancelJob(id) {
      return jobs.cancel(id);
    },
    getDraft(id) {
      const row = db.prepare(`SELECT * FROM station_drafts WHERE id = ?`).get(id);
      if (!row) return null;
      let markdown = "";
      if (row.md_path) {
        try {
          markdown = fs.readFileSync(row.md_path, "utf8");
        } catch {
          markdown = "";
        }
      }
      return {
        meta: {
          id: row.id,
          status: row.status,
          mode: row.mode,
          check_count: row.check_count,
          assignment_uuid: row.assignment_uuid,
          course_uuid: row.course_uuid,
        },
        markdown,
      };
    },
    setDraftStatus(id, status) {
      const info = db
        .prepare(`UPDATE station_drafts SET status = ? WHERE id = ?`)
        .run(status, id);
      return { ok: info.changes > 0 };
    },
  };

  const tokenHash = getSetting(db, "station.token_hash", "");
  const apiStub = {
    start() {},
    async stop() {
      if (apiReady) {
        try {
          await apiReady;
        } catch {
          /* ignore start failure */
        }
      }
      if (apiHandle) {
        await apiHandle.stop();
        apiHandle = null;
      }
    },
  };

  if (tokenHash) {
    const staticRoot = fs.existsSync(STATIC_ROOT) ? STATIC_ROOT : undefined;
    apiReady = api
      .start({
        tokenHash,
        services,
        host: "127.0.0.1",
        port: 47811,
        staticRoot,
      })
      .then((handle) => {
        apiHandle = handle;
      })
      .catch((err) => {
        log(`station api failed to start: ${err?.message || err}`);
      });
  } else {
    log("station api skipped (no station.token_hash)");
  }

  const stubs = {
    jobs,
    scheduler,
    api: apiStub,
    notify,
  };

  log("station ready");

  return {
    started: true,
    stubs,
    stop() {
      if (typeof adapter.offPower === "function") {
        adapter.offPower("resume", onResume);
      }
      scheduler.stop();
      jobs.stop();
      notify.stop();
      void apiStub.stop();
    },
  };
}

module.exports = {
  start,
  readEnabled,
  enqueueRun,
  buildAndStoreBriefing,
  getOrRebuildBriefing,
};
