import { useEffect, useState } from "react";

/** Focus mode countdown; clicking it ends focus early. */
export function FocusPill({ until, onStop }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((until - Date.now()) / 1000));
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <button type="button" className="sc-focus-pill mono" onClick={onStop} title="End focus early" aria-label={`Focus mode, ${mmss} left. Click to stop.`}>
      FOCUS {mmss}
    </button>
  );
}
