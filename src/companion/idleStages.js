/**
 * Idle life, staged by how long the student has been away from the keyboard and mouse.
 * Pure: the layer feeds in idle time and what already ran this idle stretch.
 *
 * Each stage runs at most once per stretch; any input starts a new stretch. A stage that
 * was missed (she was busy, or it couldn't run) is skipped once a later one has run, so she
 * never goes back from reading to fidgeting.
 */

export const IDLE_STAGES = Object.freeze([
  { id: "fidget", at: 30 * 1000 },
  { id: "doodle", at: 60 * 1000 },
  { id: "prop", at: 2 * 60 * 1000 },
  { id: "doze", at: 5 * 60 * 1000 },
]);
/** Late at night she nods off sooner. */
export const LATE_DOZE_MS = 3 * 60 * 1000;

/** Peeking out from behind a panel: not before this much idle, and not more often than the cooldown. */
export const PEEK_MIN_IDLE_MS = 20 * 1000;
export const PEEK_COOLDOWN_MS = 4 * 60 * 1000;
/** Chance per one-second check once a peek is allowed (about 25s on average). */
export const PEEK_CHANCE = 0.04;

/** Wake-up denial ("I wasn't asleep.") only sometimes, so it stays funny. */
export const WAKE_DENIAL_CHANCE = 0.25;

export function stageTimes(part) {
  return IDLE_STAGES.map((s) => (s.id === "doze" && part === "late" ? { ...s, at: LATE_DOZE_MS } : s));
}

/**
 * The stage to start now, or null. `done` is the set of stage ids already run (or given up
 * on) this stretch; `skip` lists stages this body can't do (no 3D props in sprite mode).
 */
export function dueStage(idleMs, done, { part = "day", skip = null } = {}) {
  const stages = stageTimes(part);
  let after = -1;
  stages.forEach((s, i) => {
    if (done?.has(s.id)) after = i;
  });
  let pick = null;
  stages.forEach((s, i) => {
    if (i > after && idleMs >= s.at && !done?.has(s.id) && !skip?.has(s.id)) pick = s.id;
  });
  return pick;
}

/** May she peek out from behind a panel on this check? */
export function mayPeek({ idleMs, lastPeek = 0, now = Date.now(), random = Math.random }) {
  if (idleMs < PEEK_MIN_IDLE_MS) return false;
  if (now - lastPeek < PEEK_COOLDOWN_MS) return false;
  return random() < PEEK_CHANCE;
}

/** Which prop to play with at the 2 minute mark: reading lying down, or shuffling a deck sitting on an edge. */
export function pickProp({ canSit, random = Math.random }) {
  if (!canSit) return "read";
  return random() < 0.5 ? "read" : "cards";
}
