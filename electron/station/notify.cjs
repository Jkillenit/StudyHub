/**
 * Nova Station push via ntfy (BRIEFING §3.5).
 * No electron imports. Injectable fetch/clock for vitest.
 */

const RATE_LIMIT_MS = 2 * 60 * 1000;

const EVENT_TYPES = Object.freeze([
  "run_finished",
  "draft_ready",
  "new_grade",
  "session_expired",
  "job_failed",
  "morning_briefing",
]);

/**
 * Build title/body/priority for a known event. Detail text only when pushDetails.
 * @param {string} kind
 * @param {Record<string, unknown>} [data]
 * @param {{ pushDetails?: boolean }} [opts]
 */
function mapEvent(kind, data = {}, opts = {}) {
  const pushDetails = opts.pushDetails === true;
  const detail = typeof data.detail === "string" ? data.detail : "";

  switch (kind) {
    case "run_finished": {
      const grades = Number(data.grades) || 0;
      const drafts = Number(data.drafts) || 0;
      return {
        eventType: "run_finished",
        title: `Nova: run done — ${grades} grades, ${drafts} draft ready`,
        body: pushDetails ? detail : "",
        priority: "default",
      };
    }
    case "draft_ready":
      return {
        eventType: "draft_ready",
        title: `Draft ready: ${data.course} ${data.title} (${data.mode})`,
        body: pushDetails ? detail : "",
        priority: "default",
      };
    case "new_grade": {
      let body = "";
      if (pushDetails && data.score != null) {
        body =
          data.pointsPossible != null ? `${data.score}/${data.pointsPossible}` : String(data.score);
      }
      return {
        eventType: "new_grade",
        title: `New grade in ${data.course}`,
        body,
        priority: "default",
      };
    }
    case "session_expired":
      return {
        eventType: "session_expired",
        title: "Blackboard signed out — sign in on the PC",
        body: pushDetails ? detail : "",
        priority: "high",
      };
    case "job_failed":
      return {
        eventType: "job_failed",
        title: `Nova: ${data.type} failed`,
        body: pushDetails ? detail : "",
        priority: "default",
      };
    case "morning_briefing":
      return {
        eventType: "morning_briefing",
        title: "Morning brief ready",
        body: pushDetails ? detail : "",
        priority: "low",
      };
    default:
      return {
        eventType: kind || "default",
        title: String(data.title || kind || "Nova"),
        body: pushDetails ? detail : "",
        priority: data.priority || "default",
      };
  }
}

/**
 * @param {{
 *   fetch?: typeof fetch,
 *   now?: () => number,
 *   setTimeout?: typeof setTimeout,
 *   clearTimeout?: typeof clearTimeout,
 *   getConfig: () => {
 *     ntfyUrl: string,
 *     ntfyTopic: string,
 *     pushDetails: boolean,
 *     clickUrl: string,
 *   },
 * }} deps
 */
function createNotify(deps) {
  const doFetch = deps.fetch || globalThis.fetch.bind(globalThis);
  const now = deps.now || Date.now;
  const schedule = deps.setTimeout || setTimeout;
  const cancel = deps.clearTimeout || clearTimeout;

  /** @type {Map<string, { lastSentAt: number, pendingCount: number, latest: object|null, timer: unknown }>} */
  const windows = new Map();

  function getWindow(eventType) {
    let w = windows.get(eventType);
    if (!w) {
      w = { lastSentAt: 0, pendingCount: 0, latest: null, timer: null };
      windows.set(eventType, w);
    }
    return w;
  }

  /**
   * @param {{ title: string, body?: string, priority?: string, click?: string, eventType?: string }} msg
   * @returns {Promise<{ ok: boolean, error?: string, skipped?: boolean }>}
   */
  async function sendNow(msg) {
    try {
      const cfg = deps.getConfig();
      const topic = (cfg.ntfyTopic || "").trim();
      const base = (cfg.ntfyUrl || "https://ntfy.sh").replace(/\/$/, "");
      if (!topic) return { ok: false, error: "ntfy topic not configured" };

      const body = cfg.pushDetails ? msg.body || "" : "";
      const click = msg.click || cfg.clickUrl || "";
      const res = await doFetch(`${base}/${topic}`, {
        method: "POST",
        headers: {
          Title: msg.title || "",
          Priority: msg.priority || "default",
          ...(click ? { Click: click } : {}),
        },
        body,
      });
      if (!res || res.ok === false) {
        const status = res?.status != null ? String(res.status) : "unknown";
        return { ok: false, error: `ntfy HTTP ${status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async function flushBatch(eventType) {
    const w = getWindow(eventType);
    w.timer = null;
    if (!w.latest || w.pendingCount <= 0) {
      w.pendingCount = 0;
      w.latest = null;
      return;
    }
    const n = w.pendingCount;
    const latest = w.latest;
    w.pendingCount = 0;
    w.latest = null;
    const title = `${latest.title} +${n} more`;
    w.lastSentAt = now();
    await sendNow({ ...latest, title });
  }

  /**
   * @param {{ title: string, body?: string, priority?: string, click?: string, eventType?: string }} payload
   * @returns {Promise<{ ok: boolean, error?: string, batched?: boolean }>}
   */
  async function push(payload) {
    try {
      const eventType = payload.eventType || "default";
      const w = getWindow(eventType);
      const t = now();
      const elapsed = t - w.lastSentAt;

      if (w.lastSentAt > 0 && elapsed < RATE_LIMIT_MS) {
        w.pendingCount += 1;
        w.latest = {
          title: payload.title,
          body: payload.body || "",
          priority: payload.priority || "default",
          click: payload.click,
          eventType,
        };
        if (!w.timer) {
          const wait = RATE_LIMIT_MS - elapsed;
          w.timer = schedule(() => {
            void flushBatch(eventType);
          }, wait);
        }
        return { ok: true, batched: true };
      }

      w.lastSentAt = t;
      w.pendingCount = 0;
      w.latest = null;
      if (w.timer) {
        cancel(w.timer);
        w.timer = null;
      }
      return await sendNow({
        title: payload.title,
        body: payload.body || "",
        priority: payload.priority || "default",
        click: payload.click,
        eventType,
      });
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  /**
   * Map a known event then push (reads pushDetails from config).
   * @param {string} kind
   * @param {Record<string, unknown>} [data]
   */
  async function notifyEvent(kind, data = {}) {
    try {
      const cfg = deps.getConfig();
      const mapped = mapEvent(kind, data, { pushDetails: cfg.pushDetails === true });
      return await push({
        title: mapped.title,
        body: mapped.body,
        priority: mapped.priority,
        eventType: mapped.eventType,
      });
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  function stop() {
    for (const w of windows.values()) {
      if (w.timer) cancel(w.timer);
      w.timer = null;
      w.pendingCount = 0;
      w.latest = null;
    }
    windows.clear();
  }

  return { push, notifyEvent, stop, start() {} };
}

module.exports = {
  createNotify,
  mapEvent,
  RATE_LIMIT_MS,
  EVENT_TYPES,
};
