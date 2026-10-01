/**
 * The Director: decides what Nova does next on her own. No AI, just utility scoring.
 *
 * CompanionLayer ticks `choose(INTENTS, ctx)` every few seconds and on events. Each intent scores
 * the context snapshot; the highest score above THRESHOLD that's off cooldown and allowed by the
 * interrupt rules wins, and the layer runs it (a scene below, or its own handler). Nothing wins =
 * her idle life carries on as before.
 *
 * Tiers: critical (something happened to your grades) > reactive (you're doing something she
 * can help with) > proactive (suggestions). Proactive needs you idle, is capped to one per
 * PROACTIVE_GAP_MS, and backs off when she's annoyed (being ignored makes her nag less, not more).
 */

export const TIERS = { critical: 2, reactive: 1, proactive: 0 };
export const THRESHOLD = 0.3;
export const PROACTIVE_GAP_MS = 10 * 60 * 1000;
/** Hovering a gauge this long means "what's this about?". */
export const HOVER_MS = 3000;
/** A grade has to move at least this many points before she mentions it. */
export const GRADE_MOVE_PTS = 0.5;

const HOUR = 60 * 60 * 1000;

export const INTENTS = [
  {
    id: "gradeMoved",
    tier: "critical",
    cooldownMs: 0,
    score: (c) => (c.events.some((e) => e.type === "grade") ? 1 : 0),
    steps: [
      { if: "onToday", then: [{ do: "walkTo", anchor: "course.{grade.uuid}.gauge" }, { do: "pointAt", anchor: "course.{grade.uuid}.gauge" }] },
      {
        if: "grade.up",
        then: [{ do: "emote", name: "celebrate" }, { do: "say", line: "director.gradeUp" }],
        else: [{ do: "emote", name: "sigh" }, { do: "say", line: "director.gradeDown" }],
      },
      { do: "lookAt", target: "user" },
    ],
  },
  {
    id: "explainGauge",
    tier: "reactive",
    cooldownMs: 3 * 60 * 1000,
    score: (c) => (c.gauge && c.hover.ms >= HOVER_MS ? 0.8 : 0),
    steps: [
      { do: "walkTo", anchor: "course.{gauge.uuid}.gauge" },
      { do: "pointAt", anchor: "course.{gauge.uuid}.gauge" },
      {
        if: "gauge.behind",
        then: [{ do: "highlight", anchor: "course.{gauge.uuid}.gauge", style: "warn" }, { do: "say", line: "director.gaugeBehind" }],
        else: [{ do: "highlight", anchor: "course.{gauge.uuid}.gauge", style: "glow" }, { do: "say", line: "director.gaugeAhead" }],
      },
      { do: "lookAt", target: "user" },
    ],
  },
  {
    id: "birthday",
    tier: "critical",
    cooldownMs: 20 * HOUR,
    score: (c) => (c.birthday ? 1 : 0),
  },
  {
    id: "callback",
    tier: "proactive",
    cooldownMs: 20 * HOUR,
    score: (c) => (c.callback ? 0.35 : 0),
  },
  {
    id: "briefingOffer",
    tier: "proactive",
    cooldownMs: 12 * HOUR,
    score: (c) => (c.onToday && c.today?.hasCourses && c.part === "morning" ? 0.7 : 0),
  },
  {
    id: "overdue",
    tier: "proactive",
    cooldownMs: 1 * HOUR,
    score: (c) => (c.onToday && c.today?.overdue ? 0.4 + 0.05 * Math.min(c.today.overdue.count, 6) : 0),
    steps: [
      { do: "walkTo", anchor: "overdue" },
      { do: "highlight", anchor: "overdue", style: "danger" },
      { do: "say", line: "director.overdue" },
      { do: "lookAt", target: "user" },
    ],
  },
  {
    id: "dueCards",
    tier: "proactive",
    cooldownMs: 10 * 60 * 1000,
    score: (c) => (c.due?.count >= 3 ? Math.min(0.9, 0.3 + c.due.count / 30) : 0),
  },
];

/**
 * The intent to run now, or null.
 * ctx: { blocked, typing, idle, feelings: { annoyance }, events, skip?: Set<id>, ... }  (plus what intents read)
 * timing: { next: { [id]: earliest ms }, lastProactive }
 */
export function choose(intents, ctx, { next = {}, lastProactive = 0 } = {}, now = Date.now()) {
  if (ctx.blocked) return null;
  const annoyance = ctx.feelings?.annoyance || 0;
  let best = null;
  let bestKey = -Infinity;
  for (const it of intents) {
    if (now < (next[it.id] || 0) || ctx.skip?.has(it.id)) continue;
    if (it.tier === "reactive" && ctx.typing) continue;
    if (it.tier === "proactive" && (!ctx.idle || now - lastProactive < PROACTIVE_GAP_MS)) continue;
    let score = it.score(ctx) || 0;
    if (it.tier === "proactive") score *= 1 - annoyance * 0.6;
    if (score < THRESHOLD) continue;
    const key = TIERS[it.tier] * 10 + score;
    if (key > bestKey) {
      best = it;
      bestKey = key;
    }
  }
  return best;
}

/* ---------- shared state: timing, pending events, and what Today last showed ---------- */

const TIMING_KEY = "sh-nova-director";
const SEEN_KEY = "sh-nova-seen-grades";

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
};

export const timing = { next: {}, lastProactive: 0, ...read(TIMING_KEY, {}) };

/** Mark an intent as run: its cooldown starts now. */
export function ran(it, now = Date.now()) {
  timing.next[it.id] = now + it.cooldownMs;
  if (it.tier === "proactive") timing.lastProactive = now;
  write(TIMING_KEY, timing);
}

/** Push an intent's next run further out (the student said "not now"). */
export function snooze(id, ms, now = Date.now()) {
  timing.next[id] = Math.max(timing.next[id] || 0, now + ms);
  write(TIMING_KEY, timing);
}

export const events = [];
const WAKE = "studyhub-nova-wake";

export function notify(event) {
  events.push(event);
  window.dispatchEvent(new CustomEvent(WAKE));
}

/** Remove and return the first pending event of `type`. */
export function take(type) {
  const i = events.findIndex((e) => e.type === type);
  return i < 0 ? null : events.splice(i, 1)[0];
}

export const onWake = (fn) => {
  window.addEventListener(WAKE, fn);
  return () => window.removeEventListener(WAKE, fn);
};

/** Grade changes between two `{ uuid: current }` maps. Courses new to `before` don't count. */
export function gradeMoves(before, courses) {
  return courses
    .filter((c) => c.current != null && before[c.uuid] != null && Math.abs(c.current - before[c.uuid]) >= GRADE_MOVE_PTS)
    .map((c) => ({ type: "grade", uuid: c.uuid, course: c.course, from: before[c.uuid], to: c.current, pct: c.pct, up: c.current > before[c.uuid] }));
}

/** What the Today screen shows (briefingContext); read by intents as `ctx.today`. */
export let today = null;

export function publishToday(facts) {
  today = facts;
  const courses = facts?.courses || [];
  if (!courses.length) return;
  const seen = read(SEEN_KEY, {});
  for (const move of gradeMoves(seen, courses)) notify(move);
  for (const c of courses) if (c.current != null) seen[c.uuid] = c.current;
  write(SEEN_KEY, seen);
}
