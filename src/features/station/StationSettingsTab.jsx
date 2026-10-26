import { useCallback, useEffect, useState } from "react";
import { DRAFT_MODES, buildSettingsView } from "./settingsView.js";

/**
 * Settings → Station tab. Enable generates a one-time token + QR; other knobs write via IPC.
 */
export function StationSettingsTab() {
  const [view, setView] = useState(() => buildSettingsView({}));
  const [tokenOnce, setTokenOnce] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const api = window.studyHub?.station;
    if (!api?.getSettings) {
      setView(buildSettingsView({}));
      return;
    }
    const raw = await api.getSettings();
    setView(buildSettingsView(raw, raw?.courses || []));
  }, []);

  useEffect(() => {
    void reload().catch(() => setErr("Could not load Station settings"));
  }, [reload]);

  async function enable() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await window.studyHub?.station?.enable?.();
      if (!res?.ok) {
        setErr(res?.error || "Enable failed");
        return;
      }
      setTokenOnce(res.token);
      setQrDataUrl(res.qrDataUrl || null);
      setMsg("Station enabled. Copy the token now — it is only shown once.");
      await reload();
    } catch {
      setErr("Enable failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setErr(null);
    try {
      await window.studyHub?.station?.disable?.();
      setTokenOnce(null);
      setQrDataUrl(null);
      setMsg("Station disabled.");
      await reload();
    } catch {
      setErr("Disable failed");
    } finally {
      setBusy(false);
    }
  }

  async function savePatch(patch) {
    setErr(null);
    const res = await window.studyHub?.station?.setSettings?.(patch);
    if (!res?.ok) {
      setErr(res?.error || "Save failed");
      return;
    }
    setMsg("Saved.");
    await reload();
  }

  async function testPush() {
    setBusy(true);
    setErr(null);
    try {
      const res = await window.studyHub?.station?.testPush?.();
      if (!res?.ok) setErr(res?.error || "Test push failed");
      else setMsg("Test push queued.");
    } catch {
      setErr("Test push failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="sh-settings-section">
        <div className="sh-settings-section-label">Station</div>
        <div className="sh-settings-kv">
          <span>Status</span>
          <span className={`sh-settings-mono${view.enabled ? " sh-settings-on" : ""}`}>
            {view.enabled ? "● Enabled" : "○ Off"}
          </span>
        </div>
        <p className="sh-settings-hint">
          Always-on host for phone Run, jobs, drafts, and briefings. Binds only to 127.0.0.1; reach it through Tailscale serve.
        </p>
        <div className="sh-settings-buttons">
          {view.enabled ? (
            <button type="button" className="sh-btn-quiet" disabled={busy} onClick={disable}>
              Disable Station
            </button>
          ) : (
            <button type="button" className="sh-btn-outline" disabled={busy} onClick={enable}>
              Enable Station
            </button>
          )}
          {view.enabled ? (
            <button type="button" className="sh-btn-outline" disabled={busy} onClick={testPush}>
              Send test push
            </button>
          ) : null}
        </div>
        {tokenOnce ? (
          <div className="sh-station-token">
            <div className="sh-settings-section-label">Bearer token (once)</div>
            <p className="sh-settings-mono sh-station-token-value">{tokenOnce}</p>
            <button
              type="button"
              className="sh-settings-link"
              onClick={() => {
                void navigator.clipboard?.writeText?.(tokenOnce);
                setMsg("Token copied.");
              }}
            >
              Copy token
            </button>
            {qrDataUrl ? <img className="sh-station-qr" src={qrDataUrl} alt="Station token QR" width={180} height={180} /> : null}
          </div>
        ) : view.hasToken ? (
          <p className="sh-settings-hint">A token is already stored. Disable and enable again to mint a new one.</p>
        ) : null}
      </section>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">Push (ntfy)</div>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Topic</span>
            <span className="sh-settings-hint">Long random topic. Only as private as it is unguessable.</span>
          </span>
          <input
            className="sh-input"
            value={view.ntfyTopic}
            onChange={(e) => setView((v) => ({ ...v, ntfyTopic: e.target.value }))}
            onBlur={() => savePatch({ ntfyTopic: view.ntfyTopic })}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Server URL</span>
          </span>
          <input
            className="sh-input"
            value={view.ntfyUrl}
            onChange={(e) => setView((v) => ({ ...v, ntfyUrl: e.target.value }))}
            onBlur={() => savePatch({ ntfyUrl: view.ntfyUrl })}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Include details in push</span>
            <span className="sh-settings-hint">Off by default. Scores and titles stay on the Tailscale dashboard.</span>
          </span>
          <input
            type="checkbox"
            className="sh-switch"
            checked={view.pushDetails}
            onChange={(e) => {
              const on = e.target.checked;
              setView((v) => ({ ...v, pushDetails: on }));
              void savePatch({ pushDetails: on });
            }}
          />
        </label>
      </section>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">AI + schedule</div>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Daily AI cap (cents)</span>
          </span>
          <input
            className="sh-input sh-settings-mono"
            type="number"
            min={0}
            value={view.aiCapCents}
            onChange={(e) => setView((v) => ({ ...v, aiCapCents: Number(e.target.value) }))}
            onBlur={() => savePatch({ aiCapCents: view.aiCapCents })}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Prefer local model</span>
            <span className="sh-settings-hint">Try Ollama first; fall back to cloud when needed.</span>
          </span>
          <input
            type="checkbox"
            className="sh-switch"
            checked={view.preferLocal}
            onChange={(e) => {
              const preferLocal = e.target.checked;
              setView((v) => ({ ...v, preferLocal }));
              savePatch({ preferLocal });
            }}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Local model</span>
          </span>
          <input
            className="sh-input"
            value={view.localModel}
            onChange={(e) => setView((v) => ({ ...v, localModel: e.target.value }))}
            onBlur={() => savePatch({ localModel: view.localModel })}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Cloud model</span>
          </span>
          <input
            className="sh-input"
            value={view.cloudModel}
            onChange={(e) => setView((v) => ({ ...v, cloudModel: e.target.value }))}
            onBlur={() => savePatch({ cloudModel: view.cloudModel })}
          />
        </label>
        <label className="sh-settings-row">
          <span>
            <span className="sh-settings-row-title">Morning brief at</span>
          </span>
          <input
            className="sh-input sh-settings-mono"
            value={view.morningBriefAt}
            onChange={(e) => setView((v) => ({ ...v, morningBriefAt: e.target.value }))}
            onBlur={() => savePatch({ morningBriefAt: view.morningBriefAt })}
          />
        </label>
      </section>

      <section className="sh-settings-section">
        <div className="sh-settings-section-label">Draft mode per course</div>
        {view.courseDraftModes.length === 0 ? (
          <p className="sh-settings-hint">No courses yet. Sync Blackboard first.</p>
        ) : (
          view.courseDraftModes.map((c) => (
            <label key={c.courseUuid} className="sh-settings-row">
              <span>
                <span className="sh-settings-row-title">{c.name}</span>
              </span>
              <select
                className="sh-input"
                value={c.mode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setView((v) => ({
                    ...v,
                    courseDraftModes: v.courseDraftModes.map((row) =>
                      row.courseUuid === c.courseUuid ? { ...row, mode } : row,
                    ),
                  }));
                  void savePatch({ draftModes: { [c.courseUuid]: mode } });
                }}
              >
                {DRAFT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ))
        )}
      </section>

      {msg ? <p className="sh-settings-msg">{msg}</p> : null}
      {err ? <p className="sh-settings-msg sh-settings-msg--error">{err}</p> : null}
    </>
  );
}
