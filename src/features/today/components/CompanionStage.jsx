import { useEffect, useState } from "react";

function clockText(d) {
  const day = d.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  const date = d.getDate();
  const month = d.toLocaleDateString([], { month: "short" }).toUpperCase();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} ${date} ${month} · ${time}`;
}

/**
 * Nova's home window. Nova herself is drawn by the companion layer; she lines up with
 * `[data-nova-home]` and stands on `[data-nova-floor]` while she's home.
 */
export function CompanionStage({ index = 0 }) {
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(() => document.documentElement.dataset.nova !== "off");

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30 * 1000);
    const onState = (e) => setOnline(e.detail?.visible !== false);
    window.addEventListener("studyhub-companion-state", onState);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("studyhub-companion-state", onState);
    };
  }, []);

  return (
    <div className="sh-stage sh-arrive" style={{ "--i": index }} data-nova-home aria-label="Companion">
      <div className="sh-stage-status">
        <span className={`sh-status-dot${online ? " sh-status-dot--live" : ""}`} aria-hidden />
        <span className="sh-stage-status-text">COMPANION · {online ? "ONLINE" : "RESTING"}</span>
      </div>
      <div className="sh-stage-clock">{clockText(now)}</div>
      <svg className="sh-stage-rings" viewBox="0 0 320 320" fill="none" aria-hidden>
        <circle cx="160" cy="160" r="150" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 7" />
        <circle cx="160" cy="160" r="122" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
        <circle className="sh-stage-arc" cx="160" cy="160" r="122" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="150 616.55" transform="rotate(-100 160 160)" />
        <circle cx="160" cy="160" r="122" stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 726.55" transform="rotate(80 160 160)" />
        <circle cx="160" cy="160" r="92" stroke="currentColor" strokeOpacity="0.28" strokeWidth="6" strokeDasharray="3 9" />
        <g className="sh-stage-core">
          <circle cx="160" cy="160" r="60" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx="160" cy="160" r="30" fill="currentColor" fillOpacity="0.22" />
          <circle cx="160" cy="160" r="12" fill="currentColor" fillOpacity="0.9" />
        </g>
        <line x1="16" y1="160" x2="66" y2="160" stroke="currentColor" strokeOpacity="0.4" />
        <line x1="254" y1="160" x2="304" y2="160" stroke="currentColor" strokeOpacity="0.4" />
      </svg>
      <div className="sh-stage-floor" data-nova-floor aria-hidden />
    </div>
  );
}
