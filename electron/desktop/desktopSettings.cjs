/**
 * Desktop Nova settings (settings key "desktop") plus read-only access to the in-app companion
 * state she shares with the desktop (quiet mode, enabled). Main process only.
 */
const { EventEmitter } = require("events");
const { getDb } = require("../database.cjs");

const KEY = "desktop";
const SIZES = new Set(["sm", "md", "lg"]);
const LEVELS = new Set(["clean", "salty", "unfiltered"]);

const DEFAULTS = Object.freeze({
  enabled: false,
  hideInMeetings: true,
  size: "md",
  startWithWindows: false,
  closeToTrayExplained: false,
  /** ISO timestamp; she stays hidden until then ("Hide for 1 hour" / "Hide until tomorrow"). */
  hiddenUntil: null,
  /** Clean / Salty / Unfiltered. Moves to the main companion settings with the shared voice system. */
  level: "salty",
  /** Which Blackboard news she brings to the desktop. */
  notify: Object.freeze({ grades: true, announcements: true, assignments: true, due: true }),
  /** Set by Disconnect so a cleared session isn't reported as "Blackboard logged me out". */
  bbDisconnected: false,
});

const events = new EventEmitter();

function readJson(key) {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

function sanitize(raw) {
  const out = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  for (const k of ["enabled", "hideInMeetings", "startWithWindows", "closeToTrayExplained", "bbDisconnected"]) out[k] = !!out[k];
  const n = out.notify && typeof out.notify === "object" ? out.notify : {};
  out.notify = Object.fromEntries(Object.keys(DEFAULTS.notify).map((k) => [k, n[k] !== false]));
  if (!SIZES.has(out.size)) out.size = DEFAULTS.size;
  if (out.level === "normal") out.level = "salty";
  if (!LEVELS.has(out.level)) out.level = DEFAULTS.level;
  if (out.hiddenUntil && !Number.isFinite(Date.parse(out.hiddenUntil))) out.hiddenUntil = null;
  return out;
}

let cache = null;
function get() {
  if (!cache) cache = sanitize(readJson(KEY));
  return cache;
}

/** Merge a patch from the renderer or tray; only known keys are kept. */
function set(patch) {
  const prev = get();
  const next = sanitize({ ...prev, ...Object.fromEntries(Object.entries(patch || {}).filter(([k]) => k in DEFAULTS)) });
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .run(KEY, JSON.stringify(next));
  cache = next;
  events.emit("change", next, prev);
  return next;
}

/** The in-app companion settings: quiet mode silences her on the desktop too. */
function companion() {
  const s = readJson("companion.state") || {};
  return { enabled: s.enabled !== false, quiet: !!s.quiet || s.movement === "off", movement: s.movement || "normal" };
}

/** The student's name from her memory, or "" if she never learned it. */
function studentName() {
  try {
    const row = getDb().prepare("SELECT value, muted FROM companion_memory WHERE key = 'name'").get();
    return row && !row.muted ? JSON.parse(row.value)?.name || "" : "";
  } catch {
    return "";
  }
}

module.exports = { get, set, companion, studentName, events, DEFAULTS };
