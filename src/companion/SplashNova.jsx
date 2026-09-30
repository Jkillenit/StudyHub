import { useEffect, useState } from "react";
import { NovaSprite } from "./NovaSprite.jsx";
import { line } from "./character.js";
import { isRampant, loadCompanionState, resolveTint } from "./companionStore.js";
import { loadKeyedFrames } from "./novaFrames.js";

/** Nova's cameo on the launch splash. Skipped when she's turned off. */
export default function SplashNova() {
  const [view, setView] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadCompanionState(), loadKeyedFrames()]).then(([s]) => {
      if (!alive || !s.enabled) return;
      const rampant = isRampant(s);
      const key = rampant ? "splashRampant" : s.onboarded ? "splash" : "splashFirst";
      setView({ rampant, tint: resolveTint(s), quip: line(key) });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!view) return null;
  return (
    <div className={`sh-splash-nova${view.rampant ? " sh-splash-nova--rampant" : ""}`} aria-hidden>
      <div className="sh-splash-nova-sprite">
        <NovaSprite mood={view.rampant ? "stern" : "happy"} rampant={view.rampant} tint={view.tint} glow={3} size={150} />
      </div>
      <div className="sh-splash-nova-line mono">
        <span className="sh-splash-nova-name">NOVA ›</span> {view.quip}
      </div>
    </div>
  );
}
