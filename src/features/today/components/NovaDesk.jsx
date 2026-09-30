import { LAYOUTS, PANEL_LABELS, workspace } from "../../../nova/workspace.js";

/** Each filed panel sits a little crooked, always the same way, so the desk looks lived in. */
const TILT = { briefing: "-3deg", tonight: "2deg", standing: "-1.5deg", week: "2.5deg" };

/** Tiny line drawings of each panel, so a filed card reads at a glance. */
function Glyph({ id }) {
  const common = { width: 46, height: 30, viewBox: "0 0 46 30", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", "aria-hidden": true };
  if (id === "tonight") {
    return (
      <svg {...common}>
        {[6, 15, 24].map((y, i) => (
          <g key={y} opacity={1 - i * 0.25}>
            <circle cx="5" cy={y} r="1.6" fill="currentColor" stroke="none" />
            <path d={`M11 ${y}H${40 - i * 6}`} />
          </g>
        ))}
      </svg>
    );
  }
  if (id === "standing") {
    return (
      <svg {...common}>
        {[9, 23, 37].map((cx, i) => (
          <g key={cx}>
            <path d={`M${cx - 6} 21a6 6 0 1 1 12 0`} opacity="0.35" />
            <path d={`M${cx - 6} 21a6 6 0 0 1 ${[9, 11, 6][i]} -5.6`} />
          </g>
        ))}
      </svg>
    );
  }
  if (id === "week") {
    return (
      <svg {...common}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <rect key={d} x={2 + d * 6.2} y="7" width="4.4" height="16" rx="1.2" opacity={d === 2 ? 1 : 0.4} />
        ))}
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 7H43" />
      <path d="M3 14H36" opacity="0.6" />
      <path d="M3 21H30" opacity="0.4" />
    </svg>
  );
}

/** Nova's desk: panels she (or you) filed away, as folders you can pull back out, plus "Put it back" after she rearranges. */
export function NovaDesk({ filed, canPutBack }) {
  if (!filed.length && !canPutBack) return null;
  return (
    <div className="sh-desk" data-nova-anchor="desk" role="region" aria-label="Nova's desk">
      <div className="sh-desk-head">
        <span className="sh-hud-label">NOVA'S DESK</span>
        {filed.length ? <span className="sh-desk-count">{filed.length} FILED</span> : null}
        {canPutBack ? (
          <button type="button" className="sh-desk-back" onClick={workspace.putBack} title="Undo Nova's last rearrange">
            <span aria-hidden>↺</span> Put it back
          </button>
        ) : null}
      </div>
      <div className="sh-desk-surface">
        {filed.length ? (
          filed.map((id) => (
            <button
              key={id}
              type="button"
              className="sh-desk-file"
              style={{ "--tilt": TILT[id] }}
              title={`Pull ${PANEL_LABELS[id]} back out`}
              onClick={() => workspace.place(id, LAYOUTS.briefing[id])}
            >
              <span className="sh-desk-tab">{PANEL_LABELS[id].toUpperCase()}</span>
              <span className="sh-desk-sheet">
                <Glyph id={id} />
              </span>
            </button>
          ))
        ) : (
          <span className="sh-desk-empty">Clean desk. Suspicious.</span>
        )}
      </div>
    </div>
  );
}
