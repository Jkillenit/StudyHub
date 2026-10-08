import { useEffect, useState } from "react";

export function BlackboardTab() {
  const bb = window.studyHub?.blackboard;
  const desktop = typeof bb?.getStatus === "function";
  const [status, setStatus] = useState({ loggedIn: false, windowOpen: false });

  useEffect(() => {
    if (!desktop) return undefined;
    async function checkStatus() {
      const s = await bb.getStatus();
      if (s) setStatus(s);
    }
    void checkStatus();
    window.addEventListener("focus", checkStatus);
    return () => window.removeEventListener("focus", checkStatus);
  }, [bb, desktop]);

  async function handleOpen() {
    await bb.open();
    setTimeout(async () => {
      const s = await bb.getStatus();
      if (s) setStatus(s);
    }, 1000);
  }

  async function handleDisconnect() {
    await bb.disconnect();
    setStatus({ loggedIn: false, windowOpen: false });
  }

  return (
    <section className="sh-settings-section">
      <div className="sh-settings-section-label">Blackboard</div>
      <div className="sh-settings-kv">
        <span>Status</span>
        <span className={`sh-settings-mono${status.loggedIn ? " sh-settings-on" : ""}`}>{status.loggedIn ? "● Connected" : "○ Not connected"}</span>
      </div>
      <p className="sh-settings-hint">
        {desktop
          ? "Read only. You sign in on Blackboard's own page; Study Hub never stores your password, and your data stays on this computer."
          : "Blackboard connects in the desktop app."}
      </p>
      <div className="sh-settings-buttons">
        <button type="button" className="sh-btn-outline" disabled={!desktop} onClick={handleOpen}>
          {status.loggedIn ? "Open Blackboard" : "Connect Blackboard"}
        </button>
        {status.loggedIn ? (
          <button type="button" className="sh-btn-quiet" onClick={handleDisconnect}>
            Disconnect
          </button>
        ) : null}
      </div>
    </section>
  );
}
