import { useEffect, useRef, useState } from "react";
import { useShell } from "./ShellContext.jsx";
import { setMotionPref, useMotionPref, useReducedMotion } from "./motion.js";

/** Nova's quiet mode lives in her own state; the layer broadcasts changes. */
function useNovaQuiet() {
  const [quiet, setQuiet] = useState(() => document.documentElement.dataset.novaQuiet === "on");
  useEffect(() => {
    const onState = (e) => {
      if (typeof e.detail?.quiet === "boolean") setQuiet(e.detail.quiet);
    };
    window.addEventListener("studyhub-companion-state", onState);
    return () => window.removeEventListener("studyhub-companion-state", onState);
  }, []);
  return quiet;
}

export function SettingsPanel({ open, onClose }) {
  const ref = useRef(null);
  const { apiLive } = useShell();
  const pref = useMotionPref();
  const reduced = useReducedMotion();
  const quiet = useNovaQuiet();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.("[data-tour-id='titlebar-scout']")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const openOther = (event) => {
    onClose();
    window.dispatchEvent(new CustomEvent(event));
  };

  return (
    <div ref={ref} className="sh-settings" role="dialog" aria-label="Settings" data-sprite-avoid>
      <header className="sh-settings-head">
        <span className="sh-hud-label">SETTINGS</span>
        <button type="button" className="sh-settings-close" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </header>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">MOTION</div>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Reduce motion</span>
            <span className="sh-settings-hint">
              {pref === null ? "Following your system setting." : "Overrides your system setting."} No arrival animation, count-ups or typing, and Nova only fades between spots.
            </span>
          </span>
          <input type="checkbox" className="sh-switch" checked={reduced} onChange={(e) => setMotionPref(e.target.checked)} />
        </label>
        {pref !== null ? (
          <button type="button" className="sh-settings-link" onClick={() => setMotionPref(null)}>
            Use system setting
          </button>
        ) : null}
      </section>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">COMPANION</div>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Quiet mode</span>
            <span className="sh-settings-hint">Nova stays docked: no wandering or idle animations. She still answers when you click her.</span>
          </span>
          <input
            type="checkbox"
            className="sh-switch"
            checked={quiet}
            onChange={(e) => window.dispatchEvent(new CustomEvent("studyhub-companion-quiet", { detail: { quiet: e.target.checked } }))}
          />
        </label>
        <button type="button" className="sh-settings-action" onClick={() => openOther("studyhub-scout-settings")}>
          Nova settings
          <span aria-hidden>›</span>
        </button>
      </section>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">AI</div>
        <button type="button" className="sh-settings-action" onClick={() => openOther("studyhub-open-ai")}>
          <span>
            Claude API key
            <span className={`sh-settings-status${apiLive ? " sh-settings-status--on" : ""}`}>{apiLive ? "Connected" : "Not set"}</span>
          </span>
          <span aria-hidden>›</span>
        </button>
      </section>
    </div>
  );
}
