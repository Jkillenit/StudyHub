const KEY = "companion.state";

/** How far and how often she roams when idle. Staying put entirely is `quiet`, not a level. */
export const MOVEMENT_LEVELS = ["calm", "normal", "lively"];
export const SIZES = [0.75, 1, 1.25];

/** XP needed to reach each level (index 0 = level 1). */
export const LEVEL_XP = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

/** Hologram projection tints, unlocked by level. `filter` is applied on top of the blue portraits. */
export const TINTS = [
  { id: "blue", label: "Standard blue", level: 1, filter: "hue-rotate(0deg)" },
  { id: "emerald", label: "Emerald", level: 3, filter: "hue-rotate(-70deg) saturate(1.1)" },
  { id: "gold", label: "Gold", level: 5, filter: "hue-rotate(-170deg) saturate(1.4) brightness(1.05)" },
  { id: "violet", label: "Violet", level: 7, filter: "hue-rotate(55deg)" },
  { id: "prism", label: "Prism", level: 10, filter: "hue-rotate(0deg)" },
];

/** Every way to earn XP. `study: false` awards don't count as studying for rampancy. */
export const XP_AWARDS = {
  simCorrect: { xp: 10, label: "Training Sim · correct answer" },
  simWrong: { xp: 2, label: "Training Sim · missed answer" },
  simRun: { xp: 25, label: "Training Sim · finish a run" },
  simPerfect: { xp: 50, label: "Training Sim · perfect run (5+ cards)" },
  cardKnown: { xp: 5, label: "Flashcard drill · knew it" },
  cardAgain: { xp: 2, label: "Flashcard drill · again" },
  testCorrect: { xp: 8, label: "Practice test · correct answer" },
  testDone: { xp: 30, label: "Practice test · finish" },
  tour: { xp: 50, label: "Finish a tour (first time)", study: false },
  daily: { xp: 20, label: "First study of the day" },
};

/** Sum a list of [awardId, count] pairs. */
export function xpFor(parts) {
  return parts.reduce((sum, [id, count]) => sum + (XP_AWARDS[id]?.xp || 0) * Math.max(0, count || 0), 0);
}

export function isStudyAward(parts) {
  return parts.some(([id, count]) => count > 0 && XP_AWARDS[id] && XP_AWARDS[id].study !== false);
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RAMPANT_AFTER_DAYS = 3;
export const RAMPANT_AFTER_IGNORES = 3;

export function defaultState() {
  return {
    enabled: true,
    movement: "normal",
    /** Quiet mode: docked, no wandering or idle life, still answers when clicked. */
    quiet: false,
    /** She asks what to call the student once; the answer lives in companion_memory. */
    askedName: false,
    /** Birthday and "never bug me about", asked once after the name. */
    askedMore: false,
    nudges: true,
    scale: 1,
    accessory: "auto",
    home: null,
    onboarded: false,
    xp: 0,
    tours: {},
    highScores: {},
    runs: 0,
    sound: false,
    firstSeenAt: new Date().toISOString(),
    lastStudyAt: null,
    lastDailyOn: null,
    ignored: 0,
  };
}

/** Days without studying or a string of ignored nudges and she starts to come apart. */
export function isRampant(state, now = Date.now()) {
  if (!state?.onboarded) return false;
  if ((state.ignored || 0) >= RAMPANT_AFTER_IGNORES) return true;
  const since = Date.parse(state.lastStudyAt || state.firstSeenAt || "");
  return Number.isFinite(since) && now - since > RAMPANT_AFTER_DAYS * DAY_MS;
}

export function levelForXp(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i += 1) if (xp >= LEVEL_XP[i]) level = i + 1;
  return level;
}

/** Progress toward the next level as { level, into, span } (span 0 at max level). */
export function levelProgress(xp) {
  const level = levelForXp(xp);
  const floor = LEVEL_XP[level - 1];
  const next = LEVEL_XP[level];
  return { level, into: xp - floor, span: next == null ? 0 : next - floor };
}

export function unlockedTints(xp) {
  const level = levelForXp(xp);
  return TINTS.filter((t) => t.level <= level);
}

/** "auto" projects in the newest unlock. Stored under `accessory` for older saves. */
export function resolveTint(state) {
  const unlocked = unlockedTints(state.xp || 0);
  if (state.accessory && state.accessory !== "auto") {
    return unlocked.find((t) => t.id === state.accessory) || TINTS[0];
  }
  return unlocked[unlocked.length - 1] || TINTS[0];
}

function sanitize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base, ...raw };
  if (raw.movement === "off") out.quiet = true;
  out.quiet = !!out.quiet;
  if (!MOVEMENT_LEVELS.includes(out.movement)) out.movement = base.movement;
  if (!SIZES.includes(out.scale)) out.scale = 1;
  out.xp = Math.max(0, Number(out.xp) || 0);
  if (!out.tours || typeof out.tours !== "object") out.tours = {};
  if (!out.highScores || typeof out.highScores !== "object") out.highScores = {};
  if (out.home && !(Number.isFinite(out.home.x) && Number.isFinite(out.home.y))) out.home = null;
  out.sound = !!out.sound;
  out.ignored = Math.max(0, Number(out.ignored) || 0);
  if (!raw.firstSeenAt) out.firstSeenAt = base.firstSeenAt;
  return out;
}

export async function loadCompanionState() {
  try {
    const raw = await window.studyHub?.db?.settings?.get?.(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultState();
  }
}

/** true / false, or null when the read failed (callers must not treat that as a first run). */
export async function readOnboarded() {
  try {
    const raw = await window.studyHub?.db?.settings?.get?.(KEY);
    return raw ? !!JSON.parse(raw).onboarded : false;
  } catch {
    return null;
  }
}

export function saveCompanionState(state) {
  try {
    void window.studyHub?.db?.settings?.set?.({ key: KEY, value: JSON.stringify(state) });
  } catch {
    /* ignore */
  }
}
