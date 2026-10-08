import { useCallback, useEffect, useState } from "react";
import { courseStore } from "../db/courseStore.js";
import { factList } from "./memory/facts.js";
import { loadCompanionState } from "./companionStore.js";
import { rapportTier } from "../nova/mood.js";

/**
 * "What she knows": every fact Nova remembers, in plain words. Deleting a fact mutes it, so she
 * stops tracking and mentioning it until it's turned back on. Blocked days are simply unblocked.
 */
export function NovaMemoryView({ onBack }) {
  const [rows, setRows] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const [rapport, setRapport] = useState(null);
  const load = useCallback(async () => {
    const [memoryRows, state] = await Promise.all([courseStore.companionMemory(), loadCompanionState()]);
    setRows(memoryRows);
    setRapport(state.feelings?.rapport || 0);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("studyhub-companion-memory-changed", load);
    return () => window.removeEventListener("studyhub-companion-memory-changed", load);
  }, [load]);

  const forgetOne = (key) => {
    if (key.startsWith("blocked:")) void courseStore.companionRemember([{ key, value: null, source: "told" }], { notify: true });
    else void courseStore.companionMute(key, true);
  };

  const forgetAll = async () => {
    setConfirming(false);
    await courseStore.companionForget();
    window.dispatchEvent(new CustomEvent("studyhub-companion-forgot"));
  };

  const { known, muted } = factList(rows || []);

  return (
    <div className="sh-memory">
      <button type="button" className="sh-settings-link sh-memory-back" onClick={onBack}>
        ‹ Settings
      </button>
      <p className="sh-settings-hint sh-memory-intro">
        Everything Nova remembers about you. It stays on this computer and is never shared. Remove anything and she stops using it.
      </p>
      {rapport === null ? null : (
        <p className="sh-memory-rapport">
          <span className="sh-settings-section-label">You two</span> {rapportTier(rapport).label} · {rapport} {rapport === 1 ? "visit" : "visits"}
        </p>
      )}
      {rows === null ? null : known.length ? (
        <ul className="sh-memory-list">
          {known.map((f) => (
            <li key={f.key} className="sh-memory-item">
              <span className="sh-memory-text">{f.text}</span>
              <button type="button" className="sh-memory-del" onClick={() => forgetOne(f.key)} aria-label={`Forget: ${f.text}`} title="Forget this">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sh-memory-empty">Nothing yet. She learns as you study.</p>
      )}
      {muted.length ? (
        <>
          <div className="sh-settings-section-label sh-memory-muted-label">Not tracking</div>
          <ul className="sh-memory-list">
            {muted.map((f) => (
              <li key={f.key} className="sh-memory-item sh-memory-item--muted">
                <span className="sh-memory-text">{f.label}</span>
                <button type="button" className="sh-settings-link" onClick={() => void courseStore.companionMute(f.key, false)}>
                  Turn back on
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <button
        type="button"
        className={`sh-memory-forget${confirming ? " sh-memory-forget--confirm" : ""}`}
        onClick={() => (confirming ? void forgetAll() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? "Click again to forget everything" : "Forget everything"}
      </button>
    </div>
  );
}
