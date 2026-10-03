import { useEffect, useState } from "react";
import { useShell } from "../../shell/ShellContext.jsx";
import { setMotionPref, useMotionPref, useReducedMotion } from "../../shell/motion.js";
import { NovaMemoryView } from "../../companion/NovaMemoryView.jsx";
import { BackupTab } from "./BackupTab.jsx";
import { BlackboardTab } from "./BlackboardTab.jsx";

export const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "nova", label: "Nova" },
  { id: "theme", label: "Make it yours" },
  { id: "blackboard", label: "Blackboard" },
  { id: "backup", label: "Backup" },
  { id: "ai", label: "AI key" },
];

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

function GeneralTab() {
  const pref = useMotionPref();
  const reduced = useReducedMotion();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    window.studyHub?.app
      ?.info?.()
      .then((i) => alive && setInfo(i))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
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
        <div className="sh-settings-section-label">ABOUT</div>
        <div className="sh-settings-kv">
          <span>Version</span>
          <span className="sh-settings-mono">{info?.version ? `v${info.version}` : "Browser preview"}</span>
        </div>
      </section>
    </>
  );
}

function NovaTab() {
  const quiet = useNovaQuiet();
  const [memoryOpen, setMemoryOpen] = useState(false);

  if (memoryOpen) {
    return (
      <section className="sh-settings-section">
        <div className="sh-settings-section-label">WHAT NOVA KNOWS</div>
        <NovaMemoryView onBack={() => setMemoryOpen(false)} />
      </section>
    );
  }

  return (
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
      <div className="sh-settings-actions">
        <button type="button" className="sh-settings-action" onClick={() => setMemoryOpen(true)}>
          What Nova knows
          <span aria-hidden>›</span>
        </button>
        <button type="button" className="sh-settings-action" onClick={() => window.dispatchEvent(new CustomEvent("studyhub-scout-settings"))}>
          Nova settings
          <span aria-hidden>›</span>
        </button>
      </div>
    </section>
  );
}

const PACKS = [
  { id: "nova", name: "Nova", blurb: "Aqua and magenta on true black. Medals on every clean round.", active: true },
  { id: "zombies", name: "Zombies", blurb: "Warm dark, red and amber. Power-ups drop when you finish.", active: false },
];

function ThemeTab() {
  return (
    <section className="sh-settings-section">
      <div className="sh-settings-section-label">FLAVOR PACK</div>
      <div className="sh-settings-packs">
        {PACKS.map((p) => (
          <div key={p.id} className={`sh-settings-pack sh-settings-pack--${p.id}${p.active ? " sh-settings-pack--active" : ""}`} aria-disabled={!p.active}>
            <div className="sh-settings-pack-swatch" aria-hidden>
              <i />
              <i />
            </div>
            <div className="sh-settings-pack-name">{p.name}</div>
            <p className="sh-settings-hint">{p.blurb}</p>
            <span className="sh-settings-pack-state">{p.active ? "Active" : "Coming soon"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AiTab() {
  const { apiLive } = useShell();
  return (
    <section className="sh-settings-section">
      <div className="sh-settings-section-label">CLAUDE API KEY</div>
      <div className="sh-settings-kv">
        <span>Status</span>
        <span className={`sh-settings-mono${apiLive ? " sh-settings-on" : ""}`}>{apiLive ? "● Connected" : "○ Not set"}</span>
      </div>
      <p className="sh-settings-hint">Optional. Everything works without it; with a key, imports and Nova get sharper. The key is encrypted on this computer.</p>
      <div className="sh-settings-buttons">
        <button type="button" className="sh-btn-outline" onClick={() => window.dispatchEvent(new CustomEvent("studyhub-open-ai"))}>
          {apiLive ? "Change key" : "Set key"}
        </button>
      </div>
    </section>
  );
}

const TAB_BODY = {
  general: GeneralTab,
  nova: NovaTab,
  theme: ThemeTab,
  blackboard: BlackboardTab,
  backup: BackupTab,
  ai: AiTab,
};

export function SettingsScreen({ tab = "general", onTab }) {
  const current = SETTINGS_TABS.find((t) => t.id === tab) || SETTINGS_TABS[0];
  const Body = TAB_BODY[current.id];
  return (
    <section className="sh-panel sh-hub-block sh-settings-screen">
      <h2 className="sh-hud-title">SETTINGS</h2>
      <div className="sh-tab-row sh-settings-tabs" role="tablist">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current.id}
            className={`sh-tab${t.id === current.id ? " active" : ""}`}
            onClick={() => onTab?.(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sh-settings-body" role="tabpanel" aria-label={current.label}>
        <Body />
      </div>
    </section>
  );
}
