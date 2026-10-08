import { useEffect, useMemo, useState } from "react";
import { relativeTime } from "../dashboard/dateLabels.js";
import { deckBreakdown, moduleBreakdown } from "./deckBreakdown.js";
import { courseStore } from "../../db/courseStore.js";

const KIND_LABEL = { drill: "Drill", test: "Test" };

function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Stat({ value, label }) {
  return (
    <div className="sh-today-stat">
      <span className="sh-today-stat-value">{value}</span>
      <span className="sh-today-stat-label">{label}</span>
    </div>
  );
}

function ActivityBars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.reviewed));
  return (
    <div className="sh-prog-bars" role="img" aria-label="Cards reviewed per day, last 14 days">
      {days.map((d) => (
        <div key={d.day} className="sh-prog-bar-col" title={`${d.day}: ${d.reviewed}`}>
          <div className="sh-prog-bar" style={{ height: `${(d.reviewed / max) * 100}%` }} />
          <span className="sh-prog-bar-label mono">{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

function DeckSplit({ b }) {
  const parts = [
    ["mastered", b.mastered, "MASTERED"],
    ["learning", b.learning, "LEARNING"],
    ["weak", b.weak, "WEAK"],
    ["fresh", b.fresh, "NEW"],
  ];
  return (
    <>
      <div className="sh-prog-split">
        {parts.map(([k, n]) =>
          n ? <span key={k} className={`sh-prog-split-seg sh-prog-split-seg--${k}`} style={{ flexGrow: n }} /> : null
        )}
      </div>
      <div className="sh-prog-legend mono">
        {parts.map(([k, n, label]) => (
          <span key={k}>
            <span className={`sh-prog-swatch sh-prog-split-seg--${k}`} />
            {label} {n}
          </span>
        ))}
      </div>
    </>
  );
}

export function ProgressView({ course }) {
  const courseUuid = course?.uuid || course?.id;
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const deck = useMemo(() => deckBreakdown(course?.flashcards), [course?.flashcards]);
  const modules = useMemo(() => moduleBreakdown(course), [course]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      courseStore.getSessionStats(courseUuid),
      courseStore.getSessionHistory({ courseUuid, limit: 15 }),
    ]).then(([s, h]) => {
      if (!alive) return;
      setStats(s || {});
      setHistory(Array.isArray(h) ? h : []);
    });
    return () => {
      alive = false;
    };
  }, [courseUuid]);

  if (!stats) return <div className="sh-skeleton-pulse" style={{ height: 240 }} />;

  const answered = (stats.correct || 0) + (stats.incorrect || 0);
  const accuracy = answered ? `${Math.round((stats.correct / answered) * 100)}%` : "—";

  return (
    <div className="main-content sh-mirror-view">
      <div className="sh-mirror-head">
        <div className="sh-section-label">Progress</div>
      </div>

      <div className="sh-prog-stats">
        <Stat value={stats.streak || 0} label="Day streak" />
        <Stat value={stats.sessions || 0} label="Sessions" />
        <Stat value={stats.reviewed || 0} label="Cards reviewed" />
        <Stat value={accuracy} label="Accuracy" />
        <Stat value={formatDuration(stats.seconds)} label="Time studied" />
      </div>

      <div className="sh-mirror-group">
        <div className="sh-hub-section-label">Last 14 days</div>
        <ActivityBars days={stats.last14 || []} />
      </div>

      {deck.total ? (
        <div className="sh-mirror-group">
          <div className="sh-hub-section-label">
            DECK · {deck.total} CARDS · {deck.due} DUE
          </div>
          <DeckSplit b={deck} />
        </div>
      ) : null}

      {modules.length ? (
        <div className="sh-mirror-group">
          <div className="sh-hub-section-label">By module</div>
          <ul className="sh-today-list">
            {modules.map((m) => (
              <li key={m.id} className="sh-today-row">
                <span className="sh-today-row-main">
                  <span className="sh-today-row-title">{m.title}</span>
                  <span className="sh-today-row-sub">
                    {m.total} CARDS{m.weak ? ` · ${m.weak} WEAK` : ""}
                    {m.due ? ` · ${m.due} DUE` : ""}
                  </span>
                </span>
                <span className="sh-prog-meter">
                  <span className="sh-prog-meter-fill" style={{ width: `${m.pct}%` }} />
                </span>
                <span className="sh-today-score">{m.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sh-mirror-group">
        <div className="sh-hub-section-label">Recent sessions</div>
        {!history.length ? (
          <p className="sh-today-empty">No sessions yet. Drill the deck or take a practice test.</p>
        ) : (
          <ul className="sh-today-list">
            {history.map((s) => {
              const total = s.correct + s.incorrect;
              const pct = total ? Math.round((s.correct / total) * 100) : null;
              const secs = s.ended_at ? (new Date(s.ended_at) - new Date(s.started_at)) / 1000 : 0;
              return (
                <li key={s.uuid} className="sh-today-row">
                  <span className="sh-today-tag sh-prog-kind">{KIND_LABEL[s.kind] || String(s.kind)}</span>
                  <span className="sh-today-row-main">
                    <span className="sh-today-row-title">
                      {s.cards_reviewed} {s.kind === "test" ? "questions" : "cards"}
                      {secs > 0 ? ` · ${formatDuration(secs)}` : ""}
                    </span>
                    <span className="sh-today-row-sub">{relativeTime(s.started_at)}</span>
                  </span>
                  {pct != null ? <span className="sh-today-score">{pct}%</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
