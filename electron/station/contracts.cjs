/**
 * Nova Station frozen contracts (BRIEFING §3). Do not widen the allowlist without Jack.
 *
 * @typedef {'bb_sync'|'instructions_sync'|'drafts_prep'|'briefing_build'|'health_check'|'notify_test'} JobType
 * @typedef {'queued'|'running'|'done'|'failed'|'cancelled'|'needs_you'} JobStatus
 * @typedef {'schedule'|'remote'|'desktop'|'event'} JobSource
 * @typedef {'full'|'sync'|'drafts'|'briefing'} RunPreset
 * @typedef {'job.updated'|'job.event'|'briefing.ready'|'session.changed'} StationEvent
 *
 * @typedef {object} Job
 * @property {string} id
 * @property {JobType} type
 * @property {JobStatus} status
 * @property {JobSource} source
 * @property {string} params
 * @property {number} progress
 * @property {string|null} [summary]
 * @property {string|null} [error]
 * @property {number} attempts
 * @property {string|null} [dedupe_key]
 * @property {string|null} [run_id]
 * @property {string} created_at
 * @property {string|null} [started_at]
 * @property {string|null} [finished_at]
 *
 * @typedef {object} JobEvent
 * @property {number} id
 * @property {string} job_id
 * @property {string} at
 * @property {'info'|'warn'|'error'} level
 * @property {string} message
 * @property {string|null} [data]
 *
 * @typedef {object} Draft
 * @property {string} id
 * @property {string} assignment_uuid
 * @property {string} course_uuid
 * @property {'outline'|'rough_draft'} mode
 * @property {'ready'|'reviewed'|'dismissed'} status
 * @property {string|null} [docx_path]
 * @property {string|null} [md_path]
 * @property {string|null} [model]
 * @property {number|null} [tokens_in]
 * @property {number|null} [tokens_out]
 * @property {number} check_count
 * @property {string} created_at
 *
 * @typedef {object} Briefing
 * @property {string} generatedAt
 * @property {'run'|'morning'|'evening'|'on_demand'} kind
 * @property {string} headline
 * @property {{ blackboard: 'ok'|'expired'|'unknown', lastSyncAt: string|null }} session
 * @property {object[]} newGrades
 * @property {object[]} dueSoon
 * @property {object[]} draftsReady
 * @property {object[]} needsYou
 * @property {object[]} announcements
 * @property {{ ran: number, failed: number, failures: unknown[] }} jobs
 * @property {{ todayCents: number, capCents: number }} aiSpend
 */

const JOB_TYPES = Object.freeze([
  "bb_sync",
  "instructions_sync",
  "drafts_prep",
  "briefing_build",
  "health_check",
  "notify_test",
]);

const JOB_TYPE_SET = new Set(JOB_TYPES);

const JOB_STATUS = Object.freeze([
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
  "needs_you",
]);

const RUN_PRESETS = Object.freeze({
  full: Object.freeze(["bb_sync", "instructions_sync", "drafts_prep", "briefing_build"]),
  sync: Object.freeze(["bb_sync", "briefing_build"]),
  drafts: Object.freeze(["instructions_sync", "drafts_prep", "briefing_build"]),
  briefing: Object.freeze(["briefing_build"]),
});

const EVENTS = Object.freeze(["job.updated", "job.event", "briefing.ready", "session.changed"]);

const BRIEFING_KINDS = new Set(["run", "morning", "evening", "on_demand"]);
const SESSION_STATES = new Set(["ok", "expired", "unknown"]);
const BRIEFING_ARRAY_KEYS = ["newGrades", "dueSoon", "draftsReady", "needsYou", "announcements"];

/** @param {unknown} t @returns {t is JobType} */
function isJobType(t) {
  return JOB_TYPE_SET.has(t);
}

/** @param {string} preset @returns {JobType[]} */
function expandPreset(preset) {
  const types = RUN_PRESETS[preset];
  if (!types) throw new Error(`Unknown run preset: ${preset}`);
  return [...types];
}

/**
 * Hand-written Briefing shape check (no schema lib).
 * @param {unknown} obj
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateBriefing(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") {
    return { ok: false, errors: ["briefing must be an object"] };
  }
  const b = /** @type {Record<string, unknown>} */ (obj);

  for (const key of [
    "generatedAt",
    "kind",
    "headline",
    "session",
    "newGrades",
    "dueSoon",
    "draftsReady",
    "needsYou",
    "announcements",
    "jobs",
    "aiSpend",
  ]) {
    if (!(key in b)) errors.push(`missing ${key}`);
  }

  if ("kind" in b && !BRIEFING_KINDS.has(b.kind)) errors.push("invalid kind");
  if (typeof b.generatedAt !== "undefined" && typeof b.generatedAt !== "string") {
    errors.push("generatedAt must be a string");
  }
  if (typeof b.headline !== "undefined" && typeof b.headline !== "string") {
    errors.push("headline must be a string");
  }

  const session = b.session;
  if (session != null) {
    if (typeof session !== "object") {
      errors.push("session must be an object");
    } else if (!SESSION_STATES.has(/** @type {{blackboard?: unknown}} */ (session).blackboard)) {
      errors.push("invalid session.blackboard");
    }
  }

  for (const key of BRIEFING_ARRAY_KEYS) {
    if (key in b && !Array.isArray(b[key])) errors.push(`${key} must be an array`);
  }

  const jobs = b.jobs;
  if (jobs != null) {
    if (typeof jobs !== "object" || Array.isArray(jobs)) {
      errors.push("jobs must be an object");
    } else {
      const j = /** @type {Record<string, unknown>} */ (jobs);
      if (typeof j.ran !== "number") errors.push("jobs.ran must be a number");
      if (typeof j.failed !== "number") errors.push("jobs.failed must be a number");
      if (!Array.isArray(j.failures)) errors.push("jobs.failures must be an array");
    }
  }

  const spend = b.aiSpend;
  if (spend != null) {
    if (typeof spend !== "object" || Array.isArray(spend)) {
      errors.push("aiSpend must be an object");
    } else {
      const s = /** @type {Record<string, unknown>} */ (spend);
      if (typeof s.todayCents !== "number") errors.push("aiSpend.todayCents must be a number");
      if (typeof s.capCents !== "number") errors.push("aiSpend.capCents must be a number");
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

module.exports = {
  JOB_TYPES,
  JOB_STATUS,
  RUN_PRESETS,
  EVENTS,
  isJobType,
  expandPreset,
  validateBriefing,
};
