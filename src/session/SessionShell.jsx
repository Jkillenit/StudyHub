import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../shell/ShellContext.jsx";
import { ShieldMeter } from "./ShieldMeter.jsx";
import { loadRounds } from "./rounds.js";

/** The most recently mounted shell owns `session`; an older one unmounting leaves it alone. */
let owner = 0;

/**
 * Full-window frame for a quiz or flashcard session, laid over the page in `.sh-frame-main`.
 * While mounted the rail stays collapsed and Nova moves to her session lane. Escape is the
 * child panel's job; the shell only renders the Esc button.
 */
export function SessionShell({ kind, crumb, shield = null, counter = null, progress = null, onExit, children }) {
  const { setSession } = useShell();
  const [round, setRound] = useState(null);

  useLayoutEffect(() => {
    const id = ++owner;
    setSession({ kind });
    const root = document.documentElement;
    root.dataset.session = "";
    return () => {
      if (owner !== id) return;
      setSession(null);
      delete root.dataset.session;
    };
  }, [kind, setSession]);

  useEffect(() => {
    let alive = true;
    void loadRounds().then((r) => {
      if (alive) setRound(r.round);
    });
    return () => {
      alive = false;
    };
  }, []);

  const right = [round != null ? `ROUND ${round}` : null, counter].filter(Boolean).join(" · ");
  const target = document.querySelector(".sh-frame-main") || document.body;

  return createPortal(
    <section className="sh-session" data-sprite-avoid aria-label="Study session">
      <header className="sh-session-strip">
        <span className="sh-session-crumb">{crumb}</span>
        <div className="sh-session-meter">{shield ? <ShieldMeter state={shield} /> : null}</div>
        <div className="sh-session-right">
          {right ? <span className="sh-session-count">{right}</span> : null}
          <button type="button" className="sh-session-esc" onClick={onExit} aria-label="End session">
            Esc
          </button>
        </div>
      </header>
      {progress != null ? (
        <div className="sh-session-track" aria-hidden="true">
          <div className="sh-session-progress" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      ) : null}
      <div className="sh-session-body">
        <div className="sh-session-col">{children}</div>
      </div>
    </section>,
    target
  );
}
