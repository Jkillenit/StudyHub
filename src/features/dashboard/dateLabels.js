const DAY_MS = 86400000;

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole local days from today to `iso` (negative = past). */
export function daysFromToday(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.round((startOfLocalDay(t) - startOfLocalDay(new Date())) / DAY_MS);
}

export function dueLabel(iso) {
  const days = daysFromToday(iso);
  if (days === null) return "";
  const time = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days < 0) return days === -1 ? "YESTERDAY" : `${-days}D AGO`;
  if (days === 0) return `TODAY ${time}`;
  if (days === 1) return `TOMORROW ${time}`;
  if (days < 7) return new Date(iso).toLocaleDateString([], { weekday: "short" }).toUpperCase() + ` ${time}`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
}

export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
}

export function relativeTime(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "never";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
