import { useEffect, useState } from "react";
import pkg from "../../package.json";

const STEPS = [
  [0, "INITIALIZING"],
  [260, "OPENING LOCAL DATABASE"],
  [560, "LOADING COURSES"],
];

/** Launch overlay; `useSplashPhase` decides when it leaves. */
export function SplashScreen({ ready, leaving, courseCount = 0 }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const t = window.setInterval(() => setElapsed(performance.now() - start), 80);
    return () => window.clearInterval(t);
  }, []);

  const step = ready
    ? `READY · ${courseCount} COURSE${courseCount === 1 ? "" : "S"}`
    : STEPS.filter(([at]) => elapsed >= at).pop()[1];

  return (
    <div className={`sh-splash${leaving ? " sh-splash--leaving" : ""}`} role="status" aria-live="polite" aria-label="Loading Study Hub">
      <div className="sh-splash-grid" aria-hidden />
      <div className="sh-splash-center">
        <div className="sh-splash-mark" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="sh-splash-word">
          STUDY<span className="sh-splash-slash">//</span>HUB
        </div>
        <div className="sh-splash-tag">YOUR COURSES · YOUR NOTES · ONE PLACE</div>
        <div className={`sh-splash-bar${ready ? " sh-splash-bar--done" : ""}`}>
          <span />
        </div>
        <div className="sh-splash-step">{step}</div>
      </div>
      <div className="sh-splash-foot">LOCAL-FIRST · v{pkg.version}</div>
    </div>
  );
}

const MIN_VISIBLE_MS = 1100;
const EXIT_MS = 420;

/** "show" → "leaving" → "done", never leaving before `loaded` or the minimum display time. */
export function useSplashPhase(loaded) {
  const [phase, setPhase] = useState("show");
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinDone(true), MIN_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase === "show" && loaded && minDone) setPhase("leaving");
  }, [loaded, minDone, phase]);

  useEffect(() => {
    if (phase !== "leaving") return undefined;
    const t = window.setTimeout(() => setPhase("done"), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  return phase;
}
