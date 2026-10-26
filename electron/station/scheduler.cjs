/**
 * Station schedule: morning/evening briefing, 2h draft check, nightly health, resume sync.
 * No cron — injectable clock (now / setTimeout) like bbWatcher. No electron imports.
 */

const AFTER_RESUME_MS = 90 * 1000;
const DRAFT_CHECK_MS = 2 * 60 * 60 * 1000;
const EVENING_AT = "18:00";
const HEALTH_AT = "03:30";
const DEFAULT_MORNING = "06:45";

/** @param {string} hm "HH:MM" @param {number} nowMs */
function msUntilNext(hm, nowMs) {
  const parts = String(hm || "").split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return msUntilNext(DEFAULT_MORNING, nowMs);
  const d = new Date(nowMs);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (next.getTime() <= nowMs) next.setDate(next.getDate() + 1);
  return next.getTime() - nowMs;
}

/**
 * @param {object} deps
 * @param {(spec: object) => void} deps.enqueue
 * @param {() => boolean} deps.hasEligibleDrafts
 * @param {() => string} [deps.getMorningBriefAt]
 * @param {() => number} [deps.now]
 * @param {typeof setTimeout} [deps.setTimeout]
 * @param {typeof clearTimeout} [deps.clearTimeout]
 */
function createScheduler({
  enqueue,
  hasEligibleDrafts,
  getMorningBriefAt = () => DEFAULT_MORNING,
  now = () => Date.now(),
  setTimeout: scheduleTimeout = setTimeout,
  clearTimeout: cancelTimeout = clearTimeout,
}) {
  let stopped = true;
  let morningTimer = null;
  let eveningTimer = null;
  let healthTimer = null;
  let draftTimer = null;
  let resumeTimer = null;

  function clear(id) {
    if (id != null) cancelTimeout(id);
  }

  function fireMorning() {
    if (stopped) return;
    enqueue({ type: "briefing_build", source: "schedule", params: { kind: "morning" } });
    morningTimer = scheduleTimeout(fireMorning, msUntilNext(getMorningBriefAt(), now()));
  }

  function fireEvening() {
    if (stopped) return;
    enqueue({ type: "briefing_build", source: "schedule", params: { kind: "evening" } });
    eveningTimer = scheduleTimeout(fireEvening, msUntilNext(EVENING_AT, now()));
  }

  function fireHealth() {
    if (stopped) return;
    enqueue({ type: "health_check", source: "schedule", params: {} });
    healthTimer = scheduleTimeout(fireHealth, msUntilNext(HEALTH_AT, now()));
  }

  function fireDraftCheck() {
    if (stopped) return;
    if (hasEligibleDrafts()) enqueue({ preset: "drafts", source: "schedule" });
    draftTimer = scheduleTimeout(fireDraftCheck, DRAFT_CHECK_MS);
  }

  function fireResumeSync() {
    resumeTimer = null;
    if (stopped) return;
    enqueue({ type: "bb_sync", source: "event", params: {} });
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      const t = now();
      morningTimer = scheduleTimeout(fireMorning, msUntilNext(getMorningBriefAt(), t));
      eveningTimer = scheduleTimeout(fireEvening, msUntilNext(EVENING_AT, t));
      healthTimer = scheduleTimeout(fireHealth, msUntilNext(HEALTH_AT, t));
      draftTimer = scheduleTimeout(fireDraftCheck, DRAFT_CHECK_MS);
    },
    stop() {
      stopped = true;
      clear(morningTimer);
      clear(eveningTimer);
      clear(healthTimer);
      clear(draftTimer);
      clear(resumeTimer);
      morningTimer = eveningTimer = healthTimer = draftTimer = resumeTimer = null;
    },
    /** Call on powerMonitor resume — one bb_sync after 90s (replaces a pending resume). */
    resumed() {
      if (stopped) return;
      clear(resumeTimer);
      resumeTimer = scheduleTimeout(fireResumeSync, AFTER_RESUME_MS);
    },
  };
}

module.exports = {
  createScheduler,
  AFTER_RESUME_MS,
  DRAFT_CHECK_MS,
  msUntilNext,
};
