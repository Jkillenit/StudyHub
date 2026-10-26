/**
 * Station PC IPC (S2.4). No direct `electron` import — inject ipcMain + helpers.
 * Forwards job/briefing events to the renderer via adapter.ipcSend.
 */

const crypto = require("node:crypto");
const { generateToken, hashToken } = require("./auth.cjs");
const { expandPreset, RUN_PRESETS } = require("./contracts.cjs");
const { buildAndStoreBriefing, getOrRebuildBriefing, enqueueRun } = require("./index.cjs");

const SETTING_KEYS = {
  enabled: "station.enabled",
  tokenHash: "station.token_hash",
  ntfyUrl: "station.ntfy_url",
  ntfyTopic: "station.ntfy_topic",
  pushDetails: "station.push_details",
  aiCapCents: "station.ai_cap_cents_per_day",
  draftModel: "station.draft_model",
  morningBriefAt: "station.morning_brief_at",
  lastBriefing: "station.last_briefing",
};

const DRAFT_MODE_PREFIX = "station.draft_mode.";

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

/** @param {import('better-sqlite3').Database} db */
function readDraftModes(db) {
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key LIKE ?`)
    .all(`${DRAFT_MODE_PREFIX}%`);
  /** @type {Record<string, string>} */
  const out = {};
  for (const row of rows) {
    out[String(row.key).slice(DRAFT_MODE_PREFIX.length)] = String(row.value);
  }
  return out;
}

/** @param {import('better-sqlite3').Database} db */
function listCourses(db) {
  try {
    return db
      .prepare(`SELECT uuid, name, course_code AS courseCode FROM courses ORDER BY name COLLATE NOCASE`)
      .all();
  } catch {
    return [];
  }
}

/** @param {string} topic */
async function maybeQrDataUrl(topicOrToken) {
  try {
    // Optional dep (BRIEFING §9). HANDOFF installs `qrcode` if missing.
    const QRCode = require("qrcode");
    return await QRCode.toDataURL(String(topicOrToken), { margin: 1, width: 240 });
  } catch {
    return null;
  }
}

/**
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {() => import('better-sqlite3').Database} deps.getDb
 * @param {(channel: string, payload: unknown) => void} deps.ipcSend
 * @param {() => { jobs?: object, notify?: object, emitter?: import('node:events').EventEmitter } | null} deps.getRuntime
 * @param {(enabled: boolean) => void} [deps.onEnabledChange]
 */
function registerStationIpc({ ipcMain, getDb, ipcSend, getRuntime, onEnabledChange }) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new Error("registerStationIpc requires ipcMain");
  }

  /** @type {Array<() => void>} */
  const unsubs = [];

  function bindEmitter(emitter) {
    if (!emitter || typeof emitter.on !== "function") return;
    const onBriefing = (briefing) => ipcSend("station:briefing", briefing);
    const onJob = (job) => ipcSend("station:job", job);
    const onJobEvent = (ev) => ipcSend("station:job-event", ev);
    emitter.on("briefing.ready", onBriefing);
    emitter.on("job.updated", onJob);
    emitter.on("job.event", onJobEvent);
    unsubs.push(() => {
      emitter.off("briefing.ready", onBriefing);
      emitter.off("job.updated", onJob);
      emitter.off("job.event", onJobEvent);
    });
  }

  function refreshEmitterBinding() {
    while (unsubs.length) unsubs.pop()?.();
    const runtime = getRuntime?.() || null;
    const emitter = runtime?.jobs?.emitter || runtime?.emitter || null;
    bindEmitter(emitter);
  }

  refreshEmitterBinding();

  ipcMain.handle("station:getSettings", async () => {
    const db = getDb();
    return {
      enabled: getSetting(db, SETTING_KEYS.enabled, "0"),
      tokenHash: getSetting(db, SETTING_KEYS.tokenHash, "") ? "set" : "",
      ntfyUrl: getSetting(db, SETTING_KEYS.ntfyUrl, "https://ntfy.sh"),
      ntfyTopic: getSetting(db, SETTING_KEYS.ntfyTopic, ""),
      pushDetails: getSetting(db, SETTING_KEYS.pushDetails, "0"),
      aiCapCents: getSetting(db, SETTING_KEYS.aiCapCents, "150"),
      draftModel: getSetting(db, SETTING_KEYS.draftModel, "claude-sonnet-5-5"),
      morningBriefAt: getSetting(db, SETTING_KEYS.morningBriefAt, "06:45"),
      draftModes: readDraftModes(db),
      courses: listCourses(db),
    };
  });

  ipcMain.handle("station:setSettings", async (_evt, patch = {}) => {
    const db = getDb();
    const p = patch && typeof patch === "object" ? patch : {};

    if (p.ntfyUrl != null) {
      const url = String(p.ntfyUrl).trim();
      if (!/^https:\/\//i.test(url)) return { ok: false, error: "ntfyUrl must be https" };
      setSetting(db, SETTING_KEYS.ntfyUrl, url.replace(/\/$/, ""));
    }
    if (p.ntfyTopic != null) setSetting(db, SETTING_KEYS.ntfyTopic, String(p.ntfyTopic).trim());
    if (p.pushDetails != null) {
      setSetting(db, SETTING_KEYS.pushDetails, p.pushDetails === true || p.pushDetails === "1" ? "1" : "0");
    }
    if (p.aiCapCents != null) {
      const n = Number(p.aiCapCents);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: "aiCapCents must be >= 0" };
      setSetting(db, SETTING_KEYS.aiCapCents, String(Math.floor(n)));
    }
    if (p.draftModel != null) setSetting(db, SETTING_KEYS.draftModel, String(p.draftModel).trim());
    if (p.morningBriefAt != null) {
      const t = String(p.morningBriefAt).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { ok: false, error: "morningBriefAt must be HH:MM" };
      setSetting(db, SETTING_KEYS.morningBriefAt, t);
    }
    if (p.draftModes && typeof p.draftModes === "object") {
      for (const [uuid, mode] of Object.entries(p.draftModes)) {
        if (!["off", "outline", "rough_draft"].includes(mode)) {
          return { ok: false, error: `invalid draft mode for ${uuid}` };
        }
        setSetting(db, `${DRAFT_MODE_PREFIX}${uuid}`, mode);
      }
    }
    return { ok: true };
  });

  ipcMain.handle("station:enable", async () => {
    const db = getDb();
    const token = generateToken();
    setSetting(db, SETTING_KEYS.tokenHash, hashToken(token));
    setSetting(db, SETTING_KEYS.enabled, "1");
    let topic = getSetting(db, SETTING_KEYS.ntfyTopic, "");
    if (!topic) {
      topic = crypto.randomBytes(18).toString("base64url");
      setSetting(db, SETTING_KEYS.ntfyTopic, topic);
    }
    const qrDataUrl = await maybeQrDataUrl(token);
    onEnabledChange?.(true);
    refreshEmitterBinding();
    return { ok: true, token, ntfyTopic: topic, qrDataUrl };
  });

  ipcMain.handle("station:disable", async () => {
    const db = getDb();
    setSetting(db, SETTING_KEYS.enabled, "0");
    onEnabledChange?.(false);
    refreshEmitterBinding();
    return { ok: true };
  });

  ipcMain.handle("station:getBriefing", async () => {
    const db = getDb();
    const runtime = getRuntime?.() || null;
    const emitter = runtime?.jobs?.emitter;
    if (emitter) {
      try {
        return getOrRebuildBriefing(db, emitter);
      } catch {
        /* fall through to cached */
      }
    }
    const raw = getSetting(db, SETTING_KEYS.lastBriefing);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle("station:run", async (_evt, payload = {}) => {
    const runtime = getRuntime?.() || null;
    const jobs = runtime?.jobs;
    if (!jobs || typeof jobs.enqueue !== "function") {
      return { ok: false, error: "station not running" };
    }
    const preset = payload?.preset || "briefing";
    if (!RUN_PRESETS[preset]) return { ok: false, error: `unknown preset: ${preset}` };
    try {
      expandPreset(preset);
      const result = enqueueRun(jobs, preset, "desktop");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("station:listJobs", async (_evt, payload = {}) => {
    const db = getDb();
    const since = payload?.since;
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
  });

  ipcMain.handle("station:cancelJob", async (_evt, payload = {}) => {
    const runtime = getRuntime?.() || null;
    const jobs = runtime?.jobs;
    if (!jobs || typeof jobs.cancel !== "function") return { ok: false, error: "station not running" };
    const id = payload?.id;
    if (!id) return { ok: false, error: "id required" };
    return jobs.cancel(id);
  });

  ipcMain.handle("station:testPush", async () => {
    const runtime = getRuntime?.() || null;
    const jobs = runtime?.jobs;
    if (!jobs || typeof jobs.enqueue !== "function") return { ok: false, error: "station not running" };
    try {
      const row = jobs.enqueue({ type: "notify_test", source: "desktop", params: {} });
      return { ok: true, jobId: row.id };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("station:rebuildBriefing", async () => {
    const db = getDb();
    const runtime = getRuntime?.() || null;
    const emitter = runtime?.jobs?.emitter;
    if (!emitter) {
      const { buildBriefing, readFacts } = require("./briefing.cjs");
      const briefing = buildBriefing({ ...readFacts(db, new Date()), kind: "on_demand" }, new Date());
      setSetting(db, SETTING_KEYS.lastBriefing, JSON.stringify(briefing));
      ipcSend("station:briefing", briefing);
      return briefing;
    }
    return buildAndStoreBriefing(db, emitter, "on_demand");
  });

  return {
    refreshEmitterBinding,
    dispose() {
      while (unsubs.length) unsubs.pop()?.();
    },
  };
}

module.exports = { registerStationIpc };
