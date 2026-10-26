import { useEffect, useState } from "react";
import { buildBriefingView } from "./briefingView.js";
import { useStationBriefingSpeech } from "./useStationBriefingSpeech.js";

/**
 * PC Briefing panel fed by station:getBriefing + live station:briefing events.
 * Mount useStationBriefingSpeech so Nova speaks each briefing.ready headline.
 */
export function StationBriefingPanel() {
  const [briefing, setBriefing] = useState(null);
  const [err, setErr] = useState(null);

  useStationBriefingSpeech();

  useEffect(() => {
    let alive = true;
    const api = window.studyHub?.station;
    if (!api?.getBriefing) return undefined;

    api
      .getBriefing()
      .then((b) => {
        if (alive) setBriefing(b);
      })
      .catch(() => {
        if (alive) setErr("Could not load briefing");
      });

    const off = api.onBriefing?.((b) => {
      if (alive) {
        setBriefing(b);
        setErr(null);
      }
    });

    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, []);

  const view = buildBriefingView(briefing);

  return (
    <section className="sh-panel sh-hub-block sh-station-briefing" aria-label="Station briefing" data-perch data-nova-anchor="panel.station-briefing">
      <h2 className="sh-hud-title">Station briefing</h2>
      {!view ? (
        <p className="sh-settings-hint">{err || "No briefing yet. Enable Station and run a sync, or rebuild from the jobs drawer."}</p>
      ) : (
        <>
          <p className="sh-station-briefing-headline" aria-live="polite">
            {view.headline}
          </p>
          <div className="sh-settings-kv">
            <span>Session</span>
            <span className="sh-settings-mono">{view.session.label}</span>
          </div>
          <div className="sh-settings-kv">
            <span>Jobs</span>
            <span className="sh-settings-mono">{view.jobsSummary}</span>
          </div>
          <div className="sh-settings-kv">
            <span>AI spend</span>
            <span className="sh-settings-mono">{view.aiSpend.label}</span>
          </div>
          {view.sections.map((section) => (
            <section key={section.id} className="sh-settings-section">
              <div className="sh-settings-section-label">{section.title}</div>
              <ul className="sh-station-list">
                {section.items.map((item, i) => (
                  <li key={`${section.id}-${i}`}>
                    <span className="sh-station-list-primary">{item.primary}</span>
                    {item.secondary ? <span className="sh-settings-hint">{item.secondary}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
