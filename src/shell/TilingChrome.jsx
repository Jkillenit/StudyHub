import { useShell } from "./ShellContext.jsx";

export function TopBar({ onCommandPalette }) {
  const { breadcrumb, apiLive } = useShell();
  const parts = breadcrumb.length ? breadcrumb : ["STUDY HUB"];

  return (
    <header className="sh-topbar mono">
      <span className="sh-topbar-wordmark">STUDY//HUB</span>
      <span className="sh-topbar-divider" aria-hidden />
      <nav className="sh-topbar-crumb" aria-label="Breadcrumb">
        {parts.map((p, i) => (
          <span key={`${i}-${p}`} className={i === parts.length - 1 ? "sh-crumb-active" : ""}>
            {i > 0 ? <span className="sh-crumb-sep"> › </span> : null}
            {p}
          </span>
        ))}
      </nav>
      <div className="sh-topbar-right">
        <span
          className={`sh-api-dot ${apiLive ? "sh-api-dot--live" : ""}`}
          title={apiLive ? "API key configured" : "No API key"}
          aria-hidden
        />
        <span className={apiLive ? "sh-api-label sh-api-label--live" : "sh-api-label"}>
          {apiLive ? "API LIVE" : "API OFF"}
        </span>
        <span className="sh-topbar-divider" aria-hidden />
        <button type="button" className="sh-kbd-hint mono" onClick={onCommandPalette}>
          <span className="text-uppercase">⌘K</span>
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const { statusLeft, statusRight } = useShell();
  const L = statusLeft?.length ? statusLeft : ["●", "READY"];
  const R = statusRight?.length ? statusRight : [];

  return (
    <footer className="sh-statusbar mono">
      <div className="sh-status-left">
        {L.map((t, i) => (
          <span key={i} className="sh-status-item">
            {t}
          </span>
        ))}
      </div>
      <div className="sh-status-right">
        {R.map((t, i) => (
          <span key={i} className="sh-status-item sh-status-item--dim">
            {t}
          </span>
        ))}
      </div>
    </footer>
  );
}
