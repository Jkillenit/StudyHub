import { useEffect, useState } from "react";
import { useShell } from "../shell/ShellContext.jsx";

function getElectronApi() {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).replace(/,/g, "").toUpperCase();
}

export function TitleBar({ onHub = true }) {
  const { breadcrumb } = useShell();
  const api = getElectronApi();
  const center = onHub ? todayLabel() : breadcrumb.filter(Boolean).join(" · ");

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

  return (
    <header className="sh-titlebar" onDoubleClick={(e) => e.target === e.currentTarget && api?.maximizeWindow?.()}>
      <div className="sh-titlebar-left" />

      <span className="sh-titlebar-date">{center}</span>

      <div className="sh-titlebar-right">
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
