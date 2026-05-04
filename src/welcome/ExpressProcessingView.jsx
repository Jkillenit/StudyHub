import { useEffect, useState } from "react";

const STATUS_LABELS = ["READING FILE...", "EXTRACTING CONTENT...", "BUILDING COURSE..."];

export function ExpressProcessingView({ fileLabel, statusLabel = "", chapterLabel = "" }) {
  const [statusIdx, setStatusIdx] = useState(0);
  const [dotPos, setDotPos] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_LABELS.length);
    }, 650);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDotPos((p) => (p + 1) % 5);
    }, 180);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="sh-welcome-processing" aria-busy="true">
      <div className="sh-welcome-processing-name">{fileLabel}</div>
      <div className="sh-welcome-processing-status">{statusLabel || STATUS_LABELS[statusIdx]}</div>
      {chapterLabel ? <div className="sh-welcome-processing-status">{chapterLabel}</div> : null}
      <div className="sh-welcome-dot-row mono" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i === dotPos ? "sh-welcome-dot--on" : ""}>
            ●
          </span>
        ))}
      </div>
    </div>
  );
}
