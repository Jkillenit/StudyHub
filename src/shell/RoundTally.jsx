import { useEffect, useState } from "react";
import { MARKS_PER_ROUND, loadRounds } from "../session/rounds.js";

/** Marks in the current round plus its number. `variant`: "rail" | "strip" | "corner". */
export function RoundTally({ variant = "strip" }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    void loadRounds().then((r) => {
      if (alive) setInfo((cur) => cur || r);
    });
    const onChange = (e) => {
      if (e.detail) setInfo(e.detail);
    };
    window.addEventListener("studyhub-rounds-changed", onChange);
    return () => {
      alive = false;
      window.removeEventListener("studyhub-rounds-changed", onChange);
    };
  }, []);

  if (!info) return null;
  const label = `Round ${info.round}: ${info.inRound} of ${MARKS_PER_ROUND} sessions`;
  const marks = Array.from({ length: MARKS_PER_ROUND }, (_, i) => <i key={i} data-on={i < info.inRound || undefined} />);

  if (variant === "rail") {
    return (
      <span className="sh-tally sh-tally--rail" title={label} aria-hidden="true">
        {marks}
        <b>R{info.round}</b>
      </span>
    );
  }
  return (
    <span className={`sh-tally sh-tally--${variant}`} role="img" aria-label={label} data-sprite-avoid={variant === "corner" || undefined}>
      {variant === "corner" ? <b>{info.round}</b> : <b>ROUND {info.round}</b>}
      <span className="sh-tally-marks">{marks}</span>
    </span>
  );
}
