import { formatPct } from "./priority.js";

function tone(needed) {
  if (needed > 100) return "out";
  if (needed > 95) return "hard";
  if (needed > 85) return "stretch";
  return "ok";
}

/** "NEED 89%" pill for the score needed on an item to hold the course target. */
export function NeedBadge({ needed, title }) {
  if (needed == null || !Number.isFinite(needed)) return null;
  const label = needed > 100 ? "OUT OF REACH" : `NEED ${formatPct(Math.max(0, needed))}%`;
  return (
    <span className={`sh-need-badge sh-need-badge--${tone(needed)}`} title={title}>
      {label}
    </span>
  );
}
