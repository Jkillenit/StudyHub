import { useEffect, useRef, useState } from "react";
import { HEALTH_MAX, SHIELD_MAX, shieldStatus } from "./shield.js";

const HIT_MS = 1000;
const RECHARGE_MS = 1600;

/** Halo-style shield bar + health chunks. Hit effects re-trigger on every new `state` object. */
export function ShieldMeter({ state, label = null }) {
  const [hit, setHit] = useState(0);
  const [settled, setSettled] = useState(null);
  const hitTimer = useRef(0);

  useEffect(() => {
    if (state.last === "hit" || state.last === "down") {
      setHit((h) => (h === 1 ? 2 : 1));
      clearTimeout(hitTimer.current);
      hitTimer.current = setTimeout(() => setHit(0), HIT_MS);
    }
    if (state.last !== "recharge") return undefined;
    const t = setTimeout(() => setSettled(state), RECHARGE_MS);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => () => clearTimeout(hitTimer.current), []);

  const pct = (state.shield / SHIELD_MAX) * 100;
  const down = state.shield === 0;
  const charging = state.last === "recharge" && settled !== state;

  return (
    <div
      className="sh-shield"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={state.shield}
      aria-label="Shields"
      data-down={down || undefined}
      data-hit={hit || undefined}
      data-charging={charging || undefined}
    >
      <div className="sh-shield-scale" aria-hidden="true" />
      <div className="sh-shield-body" aria-hidden="true">
        <div className="sh-shield-glow" style={{ width: `${pct}%` }} />
        <div className="sh-shield-frame">
          <div className="sh-shield-in">
            <div className="sh-shield-trail" style={{ width: `${pct}%` }} />
            <div className="sh-shield-fill" style={{ width: `${pct}%` }}>
              <span className="sh-shield-ripple" />
              <span className="sh-shield-sweep" />
            </div>
            <div className="sh-shield-flash" />
          </div>
        </div>
      </div>
      <div className="sh-shield-health" aria-hidden="true">
        {Array.from({ length: HEALTH_MAX }, (_, i) => (
          <i key={i} data-lost={i >= state.health || undefined} data-last={i === state.health - 1 || undefined} />
        ))}
      </div>
      <div className="sh-shield-readout">
        <span>
          SHIELD <b>{state.shield}</b>
        </span>
        <span className="sh-shield-status">{label ?? shieldStatus(state)}</span>
        <span>
          HEALTH <b className="sh-shield-hp">{state.health}</b>/{HEALTH_MAX}
        </span>
      </div>
    </div>
  );
}
