/** How loud a due time reads: "hot" under 24h, "near" under 72h, else "far". Null (no due date) is "far". */
export function dueEmphasis(hoursLeft) {
  if (hoursLeft == null || Number.isNaN(hoursLeft)) return "far";
  if (hoursLeft < 24) return "hot";
  if (hoursLeft < 72) return "near";
  return "far";
}

export const hoursUntil = (iso, now = new Date()) => (iso ? (Date.parse(iso) - now.getTime()) / 3600000 : null);
