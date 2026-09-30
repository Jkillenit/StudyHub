/**
 * Every desktop line goes through `say`: quiet mode, the unprompted rate limit, the hidden
 * queue and template filling live here. Emits "line" for each line shown (voice hooks in there).
 */
const { EventEmitter } = require("events");

const UNPROMPTED_GAP_MS = 15 * 60 * 1000;
const MAX_QUEUE = 10;

function bubbleMs(text, buttons) {
  if (buttons?.length) return 9000;
  return Math.min(9000, Math.max(4000, 2500 + text.length * 55));
}

/** Variants for a line id at a language level ("normal" is the fallback). */
function variants(lines, id, level) {
  const entry = lines?.[id];
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === "object") return entry[level] || entry.normal || [];
  return [];
}

function fill(text, vars) {
  let out = text;
  if (!vars.name) out = out.replace(/,?\s*\{name\}/g, "");
  return out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k]))).trim();
}

/**
 * @param deps.lines persona lines.json
 * @param deps.show (bubble: { id, lineId, text, buttons }, ms) => void
 * @param deps.isHidden () => boolean
 * @param deps.companion () => { quiet }
 * @param deps.name () => string
 * @param deps.level () => string
 * @param deps.markSaid (lineId) => void
 * @param deps.busy () => boolean   a notification bubble is up (other notifications wait their turn)
 */
function createSpeech({ lines, show, isHidden, companion, name, level, markSaid = () => {}, busy = () => false, now = Date.now, random = Math.random }) {
  const events = new EventEmitter();
  const last = new Map();
  let lastUnprompted = 0;
  let queue = [];
  let seq = 0;

  function pick(lineId) {
    const list = variants(lines, lineId, level());
    if (!list.length) return null;
    let i = Math.floor(random() * list.length);
    if (list.length > 1 && i === last.get(lineId)) i = (i + 1) % list.length;
    last.set(lineId, i);
    return list[i];
  }

  function deliver(item) {
    const raw = pick(item.lineId);
    if (!raw) return false;
    const text = fill(raw, { name: name(), ...(item.vars || {}) });
    const bubble = { ...(item.extra || {}), id: ++seq, lineId: item.lineId, text, buttons: item.buttons || null };
    show(bubble, item.ms || bubbleMs(text, item.buttons));
    markSaid(item.lineId);
    events.emit("line", { lineId: item.lineId, text, priority: item.priority || 0 });
    return true;
  }

  /**
   * @param item.lineId persona line id
   * @param item.vars template vars
   * @param item.priority 0 = chatter; > 0 = a notification the student turned on (queued while hidden, never rate limited)
   * @param item.unprompted she decided to speak on her own (quiet mode and the 15-minute limit apply)
   * @param item.buttons [{ id, label }] shown under the line
   * @param item.extra fields merged into the bubble (pose, prop, data)
   * @param item.expiresAt drop it from the queue after this time
   * @returns "shown" | "queued" | "dropped"
   */
  function say(item) {
    const priority = item.priority || 0;
    if (item.unprompted && priority === 0) {
      if (companion().quiet) return "dropped";
      if (now() - lastUnprompted < UNPROMPTED_GAP_MS) return "dropped";
    }
    if (isHidden() || (priority > 0 && busy())) {
      if (priority === 0) return "dropped";
      queue = [...queue, { ...item, at: now() }].sort((a, b) => b.priority - a.priority || a.at - b.at).slice(0, MAX_QUEUE);
      return "queued";
    }
    if (!deliver(item)) return "dropped";
    if (item.unprompted && priority === 0) lastUnprompted = now();
    return "shown";
  }

  /** Delivers the most important queued line; call again when its bubble closes. */
  function flushOne() {
    queue = queue.filter((q) => !(q.expiresAt < now()));
    if (isHidden() || !queue.length) return false;
    const [next, ...rest] = queue;
    queue = rest;
    return deliver(next);
  }

  return { say, flushOne, events, get queued() { return queue.length; } };
}

module.exports = { createSpeech, fill, variants, UNPROMPTED_GAP_MS };
