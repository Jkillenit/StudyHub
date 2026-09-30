import { useEffect, useRef, useState } from "react";
import { TINTS, MOVEMENT_LEVELS, SIZES, XP_AWARDS, levelProgress, unlockedTints } from "./companionStore.js";

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

const DESKTOP_SIZES = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];
const HIDDEN_WHY = {
  app: "Inside Study Hub right now. She steps out when you minimize or close it.",
  manual: "Taking a break. Use Show Nova in the tray to bring her back early.",
  auto: "Hidden for a meeting, screen share, or fullscreen app.",
  locked: "Screen is locked.",
  asleep: "Computer is asleep.",
};
const NOTIFY = [
  ["grades", "NEW GRADES", "She brings an envelope. Held until your meeting or screen share ends."],
  ["announcements", "ANNOUNCEMENTS", null],
  ["assignments", "NEW ASSIGNMENTS", "Also when a due date moves."],
  ["due", "DUE IN 30 MINUTES", null],
];

/** Desktop Nova: off by default; she lives on the desktop outside the app window. */
function DesktopSection() {
  const bridge = window.studyHub?.desktop;
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!bridge) return undefined;
    let alive = true;
    bridge.get().then((d) => alive && setData(d));
    const off = bridge.onState((status) => setData((d) => (d ? { ...d, status } : d)));
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);

  if (!bridge || !data) return null;
  const s = data.settings;
  const save = (patch) => bridge.set(patch).then((d) => d && setData(d));
  const why = data.status?.running && data.status.hidden ? HIDDEN_WHY[data.status.reasons?.[0]] : null;

  return (
    <>
      <Toggle
        label="DESKTOP NOVA"
        hint="She lives on your desktop, above the taskbar. She only reads the active window's app name and title, in memory, never saved or sent anywhere. Never screen contents or keystrokes."
        checked={s.enabled}
        onChange={(v) => save({ enabled: v })}
      />
      {s.enabled ? (
        <>
          {why ? <p className="sc-set-hint">{why}</p> : null}
          <Segmented label="DESKTOP SIZE" value={s.size} options={DESKTOP_SIZES} onChange={(v) => save({ size: v })} />
          <Toggle
            label="HIDE DURING MEETINGS"
            hint="Zoom, Teams, Meet, Webex, Discord and screen shares. Fullscreen apps and slideshows always hide her."
            checked={s.hideInMeetings}
            onChange={(v) => save({ hideInMeetings: v })}
          />
          {NOTIFY.map(([key, label, hint]) => (
            <Toggle key={key} label={label} hint={hint} checked={s.notify[key]} onChange={(v) => save({ notify: { ...s.notify, [key]: v } })} />
          ))}
          <div className="sc-settings-actions">
            <button type="button" className="sc-bubble-btn mono" onClick={() => bridge.hide("1h")}>
              HIDE 1 HOUR
            </button>
            <button type="button" className="sc-bubble-btn mono" onClick={() => bridge.hide("tomorrow")}>
              HIDE UNTIL TOMORROW
            </button>
          </div>
        </>
      ) : null}
      <Toggle
        label="START WITH WINDOWS"
        hint="Opens in the tray at sign-in so Blackboard checks keep running."
        checked={s.startWithWindows}
        onChange={(v) => save({ startWithWindows: v })}
      />
    </>
  );
}

export function CompanionSettings({ state, onChange, onClose, onResetTours, onResetStats, onReplayWelcome }) {
  const ref = useRef(null);
  const { level, into, span } = levelProgress(state.xp || 0);
  const unlocked = new Set(unlockedTints(state.xp || 0).map((t) => t.id));

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
    <div ref={ref} className="sc-settings" role="dialog" aria-label="Nova settings" data-sprite-avoid>
      <header className="sc-settings-head">
        <span className="mono">NOVA · SETTINGS</span>
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
      <details className="sc-set-earn">
        <summary className="mono">HOW TO EARN XP</summary>
        <ul>
          {Object.entries(XP_AWARDS).map(([id, a]) => (
            <li key={id}>
              <span>{a.label}</span>
              <span className="mono">+{a.xp}</span>
            </li>
          ))}
        </ul>
      </details>

      <Toggle label="SHOW NOVA" checked={state.enabled} onChange={(v) => onChange({ enabled: v })} />
      <Toggle
        label="QUIET MODE"
        hint="Stays docked, no wandering or idle life. Still answers when clicked."
        checked={!!state.quiet}
        onChange={(v) => onChange({ quiet: v })}
      />
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
      <Toggle label="SOUND" hint="Hologram chirps and glitches" checked={!!state.sound} onChange={(v) => onChange({ sound: v })} />
      <Segmented
        label="SIZE"
        value={state.scale}
        options={SIZES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))}
        onChange={(v) => onChange({ scale: v })}
      />
      <div className="sc-set-row">
        <span className="sc-set-label mono">PROJECTION</span>
        <select
          className="sc-set-select mono"
          value={state.accessory && TINTS.some((t) => t.id === state.accessory) ? state.accessory : "auto"}
          onChange={(e) => onChange({ accessory: e.target.value })}
        >
          <option value="auto">Newest unlock</option>
          {TINTS.map((t) => (
            <option key={t.id} value={t.id} disabled={!unlocked.has(t.id)}>
              {t.label}
              {unlocked.has(t.id) ? "" : ` (LV ${t.level})`}
            </option>
          ))}
        </select>
      </div>

      <DesktopSection />

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
      <p className="sc-settings-foot">Drag Nova anywhere to give her a new home spot. Ctrl+Shift+Space summons her.</p>
    </div>
  );
}
