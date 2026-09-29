import { useEffect, useRef } from "react";
import { ACCESSORIES, MOVEMENT_LEVELS, SIZES, levelProgress, unlockedAccessories } from "./companionStore.js";

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="sc-set-row">
      <span className="sc-set-label mono">{label}</span>
      <div className="sc-set-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`sc-set-seg-btn mono${value === o.value ? " active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="sc-set-row sc-set-row--toggle">
      <span>
        <span className="sc-set-label mono">{label}</span>
        {hint ? <span className="sc-set-hint">{hint}</span> : null}
      </span>
      <input type="checkbox" className="sc-set-check" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function CompanionSettings({ state, onChange, onClose, onResetTours, onResetStats, onReplayWelcome }) {
  const ref = useRef(null);
  const { level, into, span } = levelProgress(state.xp || 0);
  const unlocked = new Set(unlockedAccessories(state.xp || 0).map((a) => a.id));

  useEffect(() => {
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
  }, [onClose]);

  return (
    <div ref={ref} className="sc-settings" role="dialog" aria-label="Scout settings" data-sprite-avoid>
      <header className="sc-settings-head">
        <span className="mono">SCOUT · SETTINGS</span>
        <button type="button" className="sc-settings-close mono" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </header>

      <div className="sc-settings-level">
        <span className="mono">LV {level}</span>
        <div className="sc-settings-xpbar" aria-hidden>
          <span style={{ width: span ? `${Math.round((into / span) * 100)}%` : "100%" }} />
        </div>
        <span className="mono sc-settings-xp">{span ? `${into}/${span} XP` : "MAX"}</span>
      </div>

      <Toggle label="SHOW SCOUT" checked={state.enabled} onChange={(v) => onChange({ enabled: v })} />
      <Segmented
        label="MOVEMENT"
        value={state.movement}
        options={MOVEMENT_LEVELS.map((m) => ({ value: m, label: m.toUpperCase() }))}
        onChange={(v) => onChange({ movement: v })}
      />
      <Toggle
        label="SUGGESTIONS"
        hint="Occasional nudges about due cards"
        checked={state.nudges}
        onChange={(v) => onChange({ nudges: v })}
      />
      <Segmented
        label="SIZE"
        value={state.scale}
        options={SIZES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))}
        onChange={(v) => onChange({ scale: v })}
      />
      <div className="sc-set-row">
        <span className="sc-set-label mono">ACCESSORY</span>
        <select
          className="sc-set-select mono"
          value={state.accessory || "auto"}
          onChange={(e) => onChange({ accessory: e.target.value })}
        >
          <option value="auto">Newest unlock</option>
          {ACCESSORIES.map((a) => (
            <option key={a.id} value={a.id} disabled={!unlocked.has(a.id)}>
              {a.label}
              {unlocked.has(a.id) ? "" : ` (LV ${a.level})`}
            </option>
          ))}
        </select>
      </div>

      <div className="sc-settings-actions">
        <button type="button" className="sc-bubble-btn mono" onClick={onReplayWelcome}>
          REPLAY WELCOME
        </button>
        <button type="button" className="sc-bubble-btn mono" onClick={onResetTours}>
          RESET TOURS
        </button>
        <button type="button" className="sc-bubble-btn sc-bubble-btn--danger mono" onClick={onResetStats}>
          RESET QUIZ STATS
        </button>
      </div>
      <p className="sc-settings-foot">Drag Scout anywhere to give her a new home spot. Ctrl+Shift+Space summons her.</p>
    </div>
  );
}
