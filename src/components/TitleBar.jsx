import { useEffect, useState } from "react";
import { useShell } from "../shell/ShellContext.jsx";

function getElectronApi() {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export function TitleBar({ onCommandPalette, onGoToHub }) {
  const { breadcrumb, apiLive } = useShell();
  const parts = breadcrumb.length ? breadcrumb : ["STUDY HUB"];
  const api = getElectronApi();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "");
  const kbdLabel = isMac ? "⌘K" : "Ctrl+K";

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

  const onCenterDblClick = () => {
    api?.maximizeWindow?.();
  };

  return (
    <header className="sh-titlebar mono">
      <div className="sh-titlebar-left">
        {onGoToHub ? (
          <button type="button" className="sh-titlebar-wordmark sh-titlebar-wordmark--btn" onClick={onGoToHub}>
            STUDY//HUB
          </button>
        ) : (
          <span className="sh-titlebar-wordmark">STUDY//HUB</span>
        )}
        <span className="sh-titlebar-sep" aria-hidden />
        <nav className="sh-titlebar-crumb" aria-label="Breadcrumb">
          {parts.map((p, i) => (
            <span key={`${i}-${p}`} className={i === parts.length - 1 ? "sh-crumb-active" : ""}>
              {i > 0 ? <span className="sh-crumb-sep"> › </span> : null}
              {p}
            </span>
          ))}
        </nav>
      </div>
      <div
        className="sh-titlebar-center"
        role="presentation"
        onDoubleClick={onCenterDblClick}
        title="Double-click to maximize or restore"
      />
      <div className="sh-titlebar-right">
        <span
          className={`sh-titlebar-api-dot ${apiLive ? "sh-titlebar-api-dot--live" : "sh-titlebar-api-dot--off"}`}
          title={apiLive ? "Claude API connected" : "API key required"}
          aria-hidden
        />
        <span className="sh-titlebar-sep" aria-hidden />
        <button type="button" className="sh-kbd-hint mono" onClick={onCommandPalette} title="Command palette">
          {kbdLabel}
        </button>
        {api ? (
          <>
            <span className="sh-titlebar-sep" aria-hidden />
            <div className="sh-titlebar-wincontrols">
              <button
                type="button"
                className="sh-winbtn"
                aria-label="Minimize"
                onClick={() => api.minimizeWindow()}
              >
                −
              </button>
              <button
                type="button"
                className="sh-winbtn"
                aria-label={maximized ? "Restore" : "Maximize"}
                onClick={() => api.maximizeWindow()}
              >
                {maximized ? "❐" : "□"}
              </button>
              <button type="button" className="sh-winbtn sh-winbtn--close" aria-label="Close" onClick={() => api.closeWindow()}>
                ×
              </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
