import { useCallback, useEffect, useState } from "react";

function formatLast(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function BackupTab() {
  const backup = window.studyHub?.app?.backup;
  const desktop = typeof backup?.status === "function";
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    try {
      setStatus(await backup.status());
    } catch {
      setStatus(null);
    }
  }, [backup, desktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (kind, fn) => {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fn();
      if (res?.ok === false && !res.canceled) setMessage({ error: true, text: res.error || "That didn't work." });
      else if (res?.ok && kind === "now") setMessage({ text: "Backed up." });
      else if (res?.ok && kind === "copy") setMessage({ text: "Copy saved." });
    } catch (err) {
      setMessage({ error: true, text: err?.message || "That didn't work." });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const statusLine = !desktop
    ? "Backups run in the desktop app."
    : status?.last
      ? `Last backup ${formatLast(status.last)} · ${status.count} kept · daily`
      : "No backup yet · daily, 7 kept";

  return (
    <section className="sh-settings-section">
      <div className="sh-settings-section-label">Backup</div>
      <p className="sh-settings-status-line">{statusLine}</p>
      <p className="sh-settings-hint">
        Study Hub saves a copy of your data every day and keeps the last 7 in the app data folder. Restoring saves a safety copy first.
      </p>
      <div className="sh-settings-buttons">
        <button type="button" className="sh-btn-accent" disabled={!desktop || !!busy} onClick={() => run("now", backup.now)}>
          {busy === "now" ? "Backing up…" : "Back up now"}
        </button>
        <button type="button" className="sh-btn-outline" disabled={!desktop || !!busy} onClick={() => run("folder", backup.openFolder)}>
          Open folder
        </button>
        <button type="button" className="sh-btn-outline" disabled={!desktop || !!busy} onClick={() => run("restore", backup.restore)}>
          Restore…
        </button>
      </div>
      <button type="button" className="sh-settings-link" disabled={!desktop || !!busy} onClick={() => run("copy", backup.create)}>
        Save a copy…
      </button>
      {message ? (
        <p className={`sh-settings-msg${message.error ? " sh-settings-msg--error" : ""}`} role="status">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
