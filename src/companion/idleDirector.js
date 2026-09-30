/** When Nova does something on her own while idle, and what. Pure functions; no DOM. */

export const IDLE_GAP_MS = [20 * 1000, 45 * 1000];
/** Gap multiplier per movement setting: calmer settings fidget less. */
export const IDLE_GAP_SCALE = { calm: 1.5, normal: 1, lively: 0.6, off: 1.25 };
/** After this long without input she counts as ignored, and "bored" gets likelier. */
export const BORED_AFTER_MS = 60 * 1000;
export const IDLE_GESTURES = ["yawn", "look", "bored", "stretch"];

/** "late" 23:00-05:00, "morning" 05:00-10:00, "evening" 20:00-23:00, else "day". */
export function dayPart(date = new Date()) {
  const h = date.getHours();
  if (h >= 23 || h < 5) return "late";
  if (h < 10) return "morning";
  if (h >= 20) return "evening";
  return "day";
}

/** She fidgets less late at night. */
export const LATE_GAP_SCALE = 1.8;

export function idleGap(movement, random = Math.random, part = "day") {
  const [a, b] = IDLE_GAP_MS;
  return (a + random() * (b - a)) * (IDLE_GAP_SCALE[movement] ?? 1) * (part === "late" ? LATE_GAP_SCALE : 1);
}

/** Weighted pick; yawns follow the clock, boredom follows neglect, never the same twice running. */
export function pickIdleGesture({ part = "day", bored = false, last = null, random = Math.random } = {}) {
  const weights = {
    yawn: { late: 5, morning: 3, evening: 2, day: 0.6 }[part] ?? 1,
    look: 3,
    bored: bored ? 4 : 1.2,
    stretch: part === "morning" ? 3 : 1.4,
  };
  if (last) delete weights[last];
  const entries = Object.entries(weights);
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

/** Sleep sooner late at night. */
export function sleepAfterMs(part) {
  return part === "late" ? 2 * 60 * 1000 : 3 * 60 * 1000;
}

export function clockLabel(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
