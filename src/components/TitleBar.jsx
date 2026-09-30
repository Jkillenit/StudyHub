import { useEffect, useState } from "react";
import { useShell } from "../shell/ShellContext.jsx";

function getElectronApi() {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export const HUB_VIEWS = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "courses", label: "Courses" },
  { id: "decks", label: "Decks", soon: true },
  { id: "grades", label: "Grades", soon: true },
];

function SyncStatus() {
  const [status, setStatus] = useState({ loggedIn: false, synced: false });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const s = await window.studyHub?.blackboard?.getStatus?.();
      if (alive && s) setStatus((cur) => ({ ...cur, loggedIn: !!s.loggedIn }));
    };
    const onSynced = (e) => {
      if (e.detail?.ok !== false) setStatus({ loggedIn: true, synced: true });
    };
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("studyhub-bb-synced", onSynced);
    return () => {
      alive = false;
      window.removeEventListener("focus", check);
      window.removeEventListener("studyhub-bb-synced", onSynced);
    };
  }, []);

  const label = !status.loggedIn ? "Blackboard not connected" : status.synced ? "Blackboard synced" : "Blackboard connected";
  return (
    <span className={`sh-top-sync${status.loggedIn ? " sh-top-sync--on" : ""}`} title={label}>
      <span className="sh-top-sync-dot" aria-hidden />
      <span className="sh-top-sync-label">{label}</span>
    </span>
  );
}

export function TitleBar({ onCommandPalette, onGoToHub, onNavigate, onOpenSettings, onHub = true, hubView = "today" }) {
  const { breadcrumb } = useShell();
  const api = getElectronApi();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "");
  const kbdLabel = isMac ? "⌘ K" : "Ctrl K";
  const crumb = !onHub && breadcrumb.length > 1 ? breadcrumb.slice(1).join(" › ") : null;

  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api?.isMaximized || !api?.subscribeWindowMaximized) return undefined;
    let cancelled = false;
    api.isMaximized().then((m) => {
      if (!cancelled) setMaximized(!!m);
    });
    const unsub = api.subscribeWindowMaximized((m) => setMaximized(m));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [api]);

  const activeView = onHub ? hubView : "courses";

  return (
    <header className="sh-titlebar" onDoubleClick={(e) => e.target === e.currentTarget && api?.maximizeWindow?.()}>
      <div className="sh-titlebar-left">
        <button type="button" className="sh-titlebar-wordmark" onClick={() => onGoToHub?.("today")} title="Today">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          <span>STUDY HUB</span>
        </button>
        {crumb ? (
          <span className="sh-titlebar-crumb" title={crumb}>
            {crumb}
          </span>
        ) : null}
      </div>

      <nav className="sh-titlebar-nav" aria-label="Main">
        {HUB_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`sh-nav-link${activeView === v.id ? " active" : ""}`}
            aria-current={activeView === v.id ? "page" : undefined}
            disabled={v.soon}
            title={v.soon ? `${v.label} is coming soon` : v.label}
            data-tour-id={`nav-${v.id}`}
            onClick={() => onNavigate?.(v.id)}
          >
            {v.label}
            {v.soon ? <span className="sh-nav-soon">soon</span> : null}
          </button>
        ))}
      </nav>

      <div className="sh-titlebar-right">
        <SyncStatus />
        <button
          type="button"
          className="sh-titlebar-icon"
          data-tour-id="titlebar-scout"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
        <button type="button" className="sh-kbd-hint" data-tour-id="titlebar-palette" onClick={onCommandPalette} title="Command palette">
          {kbdLabel}
        </button>
        {api ? (
          <div className="sh-titlebar-wincontrols">
            <button type="button" className="sh-winbtn" aria-label="Minimize" onClick={() => api.minimizeWindow()}>
              −
            </button>
            <button type="button" className="sh-winbtn" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => api.maximizeWindow()}>
              {maximized ? "❐" : "□"}
            </button>
            <button type="button" className="sh-winbtn sh-winbtn--close" aria-label="Close" onClick={() => api.closeWindow()}>
              ×
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
