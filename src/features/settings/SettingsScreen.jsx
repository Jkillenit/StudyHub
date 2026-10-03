export const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "nova", label: "Nova" },
  { id: "theme", label: "Make it yours" },
  { id: "blackboard", label: "Blackboard" },
  { id: "backup", label: "Backup" },
  { id: "ai", label: "AI key" },
];

export function SettingsScreen({ tab = "general", onTab }) {
  const current = SETTINGS_TABS.find((t) => t.id === tab) || SETTINGS_TABS[0];
  return (
    <section className="sh-panel sh-hub-block sh-settings-screen">
      <h2 className="sh-hud-title">SETTINGS</h2>
      <div className="sh-tab-row" role="tablist">
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
      <p className="sh-hub-empty-hint">{current.label} settings will show here.</p>
    </section>
  );
}
