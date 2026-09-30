import { useShell } from "./ShellContext.jsx";

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
