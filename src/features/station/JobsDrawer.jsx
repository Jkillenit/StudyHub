import { useCallback, useEffect, useState } from "react";
import { RUN_PRESET_OPTIONS, buildJobsView } from "./jobsView.js";

/**
 * PC jobs drawer: Run presets + live job list from station IPC.
 */
export function JobsDrawer({ onClose }) {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(async () => {
    const api = window.studyHub?.station;
    if (!api?.listJobs) return;
    try {
      const rows = await api.listJobs();
      setJobs(Array.isArray(rows) ? rows : []);
    } catch {
      setMessage("Could not load jobs");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void refresh();
    const api = window.studyHub?.station;
    const onJob = () => {
      if (alive) void refresh();
    };
    const off = api?.onJob?.(onJob);
    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, [refresh]);

  const view = buildJobsView(jobs);

  async function runPreset(preset) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await window.studyHub?.station?.run?.(preset);
      if (!res?.ok) setMessage(res?.error || "Run failed");
      else {
        setMessage(`Queued ${res.jobIds?.length || 0} jobs`);
        void refresh();
      }
    } catch {
      setMessage("Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    await window.studyHub?.station?.cancelJob?.(id);
    void refresh();
  }

  return (
    <aside className="sh-panel sh-hub-block sh-station-jobs" aria-label="Station jobs">
      <div className="sh-station-jobs-head">
        <h2 className="sh-hud-title">Station jobs</h2>
        {onClose ? (
          <button type="button" className="sh-btn-quiet" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <div className="sh-settings-section">
        <div className="sh-settings-section-label">Run</div>
        <div className="sh-settings-buttons sh-station-run-row">
          {RUN_PRESET_OPTIONS.map((p) => (
            <button key={p.id} type="button" className="sh-btn-outline" disabled={busy} title={p.hint} onClick={() => runPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {message ? <p className="sh-settings-hint">{message}</p> : null}
      </div>

      <div className="sh-settings-section">
        <div className="sh-settings-section-label">Active</div>
        {view.active.length === 0 ? (
          <p className="sh-settings-hint">No jobs running.</p>
        ) : (
          <ul className="sh-station-list">
            {view.active.map((row) => (
              <li key={row.id} className={`sh-station-job sh-station-job--${row.tone}`}>
                <span className="sh-station-list-primary">
                  {row.label} · {row.status}
                  {row.progress ? ` · ${row.progress}%` : ""}
                </span>
                {row.summary ? <span className="sh-settings-hint">{row.summary}</span> : null}
                {row.canCancel ? (
                  <button type="button" className="sh-settings-link" onClick={() => cancel(row.id)}>
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sh-settings-section">
        <div className="sh-settings-section-label">Recent</div>
        {view.recent.length === 0 ? (
          <p className="sh-settings-hint">No finished jobs yet.</p>
        ) : (
          <ul className="sh-station-list">
            {view.recent.slice(0, 12).map((row) => (
              <li key={row.id} className={`sh-station-job sh-station-job--${row.tone}`}>
                <span className="sh-station-list-primary">
                  {row.label} · {row.status}
                </span>
                {row.summary || row.error ? <span className="sh-settings-hint">{row.error || row.summary}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
