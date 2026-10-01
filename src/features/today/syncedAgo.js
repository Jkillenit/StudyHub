/** "Synced 2m ago" from a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") or ISO string. */
export function syncedAgo(at, now = new Date()) {
  if (!at) return null;
  const t = Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  if (Number.isNaN(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "Synced just now";
  if (m < 60) return `Synced ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Synced ${h}h ago`;
  return `Synced ${Math.round(h / 24)}d ago`;
}
