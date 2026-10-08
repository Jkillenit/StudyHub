/** How loud a due time reads: "hot" under 24h, "near" under 72h, else "far". Null (no due date) is "far". */
export function dueEmphasis(hoursLeft) {
  if (hoursLeft == null || Number.isNaN(hoursLeft)) return "far";
  if (hoursLeft < 24) return "hot";
  if (hoursLeft < 72) return "near";
  return "far";
}

/** Today's row due copy: "today 09:05", "tomorrow 23:59", "in 2 days" (exams), "Fri", then "Oct 16" from a week out. */
export function dueShort(iso, days, isExam = false) {
  if (!iso || days == null) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return isExam ? `in ${days} days` : d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const hoursUntil = (iso, now = new Date()) => (iso ? (Date.parse(iso) - now.getTime()) / 3600000 : null);
