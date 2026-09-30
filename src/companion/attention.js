/**
 * When Nova may act on her own. Pure functions; the layer feeds in timestamps.
 *
 * She never moves, talks or animates on her own while the student is working: wandering,
 * idle gestures, mutters and nudges wait for IDLE_START_MS with no input at all (pointer,
 * keys, wheel, touch), and a study session keeps her still for SESSION_QUIET_MS after its
 * last card.
 */

export const IDLE_START_MS = 10 * 1000;
export const SESSION_QUIET_MS = 45 * 1000;
/** She counts as "at her spot" within this many px of it. */
export const AT_SPOT_PX = 8;

export function idleFor(lastInput, now = Date.now()) {
  return Math.max(0, now - (lastInput || 0));
}

export function msUntilIdle(lastInput, now = Date.now()) {
  return Math.max(0, IDLE_START_MS - idleFor(lastInput, now));
}

export function inSession(lastStudy, now = Date.now()) {
  return !!lastStudy && now - lastStudy < SESSION_QUIET_MS;
}

/**
 * May she do something on her own right now?
 * `quiet` and `reduced` rule out idle life entirely; otherwise the student has to have
 * been idle long enough and not be mid-session.
 */
export function mayAct({ lastInput, lastStudy = 0, quiet = false, reduced = false, hidden = false, now = Date.now() }) {
  if (quiet || reduced || hidden) return false;
  if (inSession(lastStudy, now)) return false;
  return idleFor(lastInput, now) >= IDLE_START_MS;
}

/** How long to wait before checking `mayAct` again (never less than `min`). */
export function nextCheckMs({ lastInput, lastStudy = 0, now = Date.now(), min = 2000 }) {
  const untilIdle = msUntilIdle(lastInput, now);
  const untilSessionEnds = inSession(lastStudy, now) ? SESSION_QUIET_MS - (now - lastStudy) : 0;
  return Math.max(min, untilIdle, untilSessionEnds);
}

export function isAtSpot(pos, spot) {
  if (!pos || !spot) return true;
  return Math.hypot(pos.x - spot.x, pos.y - spot.y) <= AT_SPOT_PX;
}
