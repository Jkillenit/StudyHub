const KEY = "companion.state";

export const MOVEMENT_LEVELS = ["off", "calm", "normal", "lively"];
export const SIZES = [0.75, 1, 1.25];

/** XP needed to reach each level (index 0 = level 1). */
export const LEVEL_XP = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

export const ACCESSORIES = [
  { id: "none", label: "None", level: 1 },
  { id: "glasses", label: "Reading glasses", level: 3 },
  { id: "cap", label: "Graduation cap", level: 5 },
  { id: "headlamp", label: "Headlamp", level: 10 },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function defaultState() {
  return {
    enabled: true,
    movement: prefersReducedMotion() ? "off" : "normal",
    nudges: true,
    scale: 1,
    accessory: "auto",
    home: null,
    onboarded: false,
    xp: 0,
    tours: {},
    highScores: {},
    runs: 0,
  };
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

export function unlockedAccessories(xp) {
  const level = levelForXp(xp);
  return ACCESSORIES.filter((a) => a.level <= level);
}

/** "auto" wears the newest unlock. */
export function resolveAccessory(state) {
  const unlocked = unlockedAccessories(state.xp || 0);
  if (state.accessory && state.accessory !== "auto") {
    return unlocked.some((a) => a.id === state.accessory) ? state.accessory : "none";
  }
  return unlocked[unlocked.length - 1]?.id || "none";
}

function sanitize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base, ...raw };
  if (!MOVEMENT_LEVELS.includes(out.movement)) out.movement = base.movement;
  if (!SIZES.includes(out.scale)) out.scale = 1;
  out.xp = Math.max(0, Number(out.xp) || 0);
  if (!out.tours || typeof out.tours !== "object") out.tours = {};
  if (!out.highScores || typeof out.highScores !== "object") out.highScores = {};
  if (out.home && !(Number.isFinite(out.home.x) && Number.isFinite(out.home.y))) out.home = null;
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

export function saveCompanionState(state) {
  try {
    void window.studyHub?.db?.settings?.set?.({ key: KEY, value: JSON.stringify(state) });
  } catch {
    /* ignore */
  }
}
