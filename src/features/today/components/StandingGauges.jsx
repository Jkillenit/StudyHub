import { useEffect, useState } from "react";
import { formatPct } from "../priority.js";
import { useCountUp } from "../useArrival.js";
import { HudPanel } from "./HudPanel.jsx";

const R = 44;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;
const START_DEG = 135;

function polar(deg, r) {
  const a = (deg * Math.PI) / 180;
  return { x: 56 + r * Math.cos(a), y: 56 + r * Math.sin(a) };
}

function statusText(row) {
  if (row.state === "none") return "No grades yet";
  if (row.state === "warn") return `${formatPct(row.gap)} below ${row.targetLetter}`;
  return `On track for ${row.targetLetter}`;
}

function Gauge({ row, arriving, onOpen }) {
  const [swept, setSwept] = useState(!arriving);
  useEffect(() => {
    if (!arriving) {
      setSwept(true);
      return undefined;
    }
    setSwept(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSwept(true)));
    return () => cancelAnimationFrame(raf);
  }, [arriving]);

  const shown = useCountUp(row.current, arriving);
  const fill = row.current == null ? 0 : Math.max(0, Math.min(1, row.current / 100)) * ARC;
  const tickDeg = START_DEG + 270 * Math.max(0, Math.min(1, row.target / 100));
  const t1 = polar(tickDeg, 36);
  const t2 = polar(tickDeg, 52);

  return (
    <button
      type="button"
      className={`sh-gauge sh-gauge--${row.state}`}
      data-brief-target={`gauge-${row.courseUuid}`}
      data-nova-drop="gauge"
      onClick={() => onOpen(row.courseUuid)}
      title={`${row.label}: open the what-if calculator`}
    >
      <span className="sh-gauge-dial">
        <svg width="100%" height="100%" viewBox="0 0 112 112" fill="none" aria-hidden>
          <circle className="sh-gauge-track" cx="56" cy="56" r={R} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ARC} ${C}`} transform={`rotate(${START_DEG} 56 56)`} />
          {row.current != null ? (
            <circle
              className="sh-gauge-fill"
              cx="56"
              cy="56"
              r={R}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${swept ? fill : 0} ${C}`}
              transform={`rotate(${START_DEG} 56 56)`}
            />
          ) : null}
          <line className="sh-gauge-tick" x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="sh-gauge-center">
          {row.current != null ? <span className="sh-gauge-value">{formatPct(shown ?? 0)}</span> : <span className="sh-gauge-value sh-gauge-value--none">—</span>}
          <span className="sh-gauge-of">of {formatPct(row.target)}</span>
        </span>
      </span>
      <span className="sh-gauge-course">{row.label}</span>
      <span className="sh-gauge-status">{statusText(row)}</span>
    </button>
  );
}

export function StandingGauges({ standing, arriving, onOpen, onMore, index = 0 }) {
  const { courses, more, uniformTarget, uniformLetter } = standing;
  const holdText = uniformLetter ? `hold a ${uniformLetter}` : "hold your target";
  return (
    <HudPanel className="sh-standing" index={index} aria-label="Standing" data-tour-id="today-standing" data-perch>
      <header className="sh-panel-head">
        <h2 className="sh-hud-title">STANDING</h2>
        {courses.length ? (
          <span className="sh-panel-meta">{uniformTarget != null ? `Target ${uniformLetter} · ${formatPct(uniformTarget)}` : "Per-course targets"}</span>
        ) : null}
      </header>
      {courses.length ? (
        <>
          <div className="sh-standing-grid">
            {courses.map((row) => (
              <Gauge key={row.courseUuid} row={row} arriving={arriving} onOpen={onOpen} />
            ))}
          </div>
          <p className="sh-standing-foot">
            Select a course to see what you need on the final to {holdText}.
            {more > 0 ? (
              <>
                {" "}
                <button type="button" className="sh-link-btn" onClick={onMore}>
                  +{more} more
                </button>
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className="sh-standing-foot sh-standing-foot--empty">Your grades show up here after your first Blackboard sync.</p>
      )}
    </HudPanel>
  );
}
