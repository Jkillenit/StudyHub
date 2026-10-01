/**
 * Nova's feelings: numbers that drift with what happens and relax back to a baseline, so she's
 * never stuck in one mood. Pure; the layer keeps the object in companion state (`feelings`).
 * `rapport` only grows (sessions together); the rest live in 0..1.
 */

export const BASELINE = { energy: 0.5, mood: 0.5, annoyance: 0, pride: 0 };
/** Every drifting feeling covers half the way back to its baseline in this long. */
export const HALF_LIFE_MS = 4 * 60 * 60 * 1000;

export const EVENTS = {
  cardRight: { mood: 0.01, energy: 0.01 },
  cardWrong: { mood: -0.005 },
  testDone: { mood: 0.05, pride: 0.05 },
  gradeUp: { mood: 0.2, pride: 0.25 },
  gradeDown: { mood: -0.25 },
  returned: { mood: 0.1, energy: 0.1, rapport: 1 },
  clickSpam: { annoyance: 0.3 },
  nudgeDismissed: { annoyance: 0.1 },
  nudgeIgnored: { annoyance: 0.15 },
  nudgeTaken: { mood: 0.1, annoyance: -0.2 },
  lateNight: { energy: -0.4 },
};

const clamp = (n) => Math.min(1, Math.max(0, n));

/** Feelings as of `now`, relaxed toward baseline since they were last touched. */
export function current(f, now = Date.now()) {
  const at = Number.isFinite(f?.at) ? f.at : now;
  const keep = Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS);
  const out = { rapport: Math.max(0, Math.floor(f?.rapport || 0)), at: now };
  for (const [k, base] of Object.entries(BASELINE)) {
    const v = Number.isFinite(f?.[k]) ? f[k] : base;
    out[k] = clamp(base + (v - base) * keep);
  }
  return out;
}

export function feel(f, event, now = Date.now()) {
  const out = current(f, now);
  for (const [k, d] of Object.entries(EVENTS[event] || {})) out[k] = k === "rapport" ? out[k] + d : clamp(out[k] + d);
  return out;
}

/** Relationship tiers by rapport (visits together), lowest first. */
export const RAPPORT_TIERS = [
  { id: "stranger", label: "Strangers", from: 0 },
  { id: "partner", label: "Partners", from: 3 },
  { id: "friend", label: "Friends", from: 15 },
  { id: "rideOrDie", label: "Ride or die", from: 40 },
];

export function rapportTier(rapport = 0) {
  return RAPPORT_TIERS.filter((t) => rapport >= t.from).pop();
}

/** Is `tier` at least `min`? */
export const tierAtLeast = (tier, min) => RAPPORT_TIERS.findIndex((t) => t.id === tier) >= RAPPORT_TIERS.findIndex((t) => t.id === min);

/** The flavor her lines take on, or null when she's even. Checked in this order. */
export function tone(f, now = Date.now()) {
  const c = current(f, now);
  if (c.annoyance >= 0.5) return "annoyed";
  if (c.pride >= 0.4) return "proud";
  if (c.mood <= 0.25) return "low";
  if (c.energy <= 0.25) return "tired";
  return null;
}
