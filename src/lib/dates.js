/** Local-calendar date helpers. electron/examCards.cjs and dbMirrorHandlers.cjs keep CJS copies; parity is tested. */
const DAY_MS = 86400000;
const BARE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

function toLocalDate(value) {
  const bare = typeof value === "string" ? BARE.exec(value) : null;
  return bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(value);
}

/** Local YYYY-MM-DD, `offset` calendar days later. Bare YYYY-MM-DD strings are local dates, not UTC midnight. */
export function localDayKey(value = new Date(), offset = 0) {
  const d = toLocalDate(value);
  d.setHours(12, 0, 0, 0);
  if (offset) d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole local-calendar day number, or null for empty / invalid input. */
export function dayNumber(value) {
  if (value == null || value === "") return null;
  const bare = BARE.exec(String(value));
  if (bare) return Date.UTC(+bare[1], +bare[2] - 1, +bare[3]) / DAY_MS;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

export function daysBetween(value, now) {
  const a = dayNumber(value);
  const b = dayNumber(now);
  return a == null || b == null ? null : a - b;
}
