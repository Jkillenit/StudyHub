import { useEffect, useRef, useState } from "react";
import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";
import { usePack } from "../shell/pack.js";
import { earnedMedals } from "./shield.js";
import { earnedPowerUps } from "./powerups.js";
import { PowerUpDrop } from "./PowerUpDrop.jsx";
import { formatDuration, resultSummary } from "./results.js";
import { MARKS_PER_ROUND, recordMark } from "./rounds.js";

const MEDAL_ICON = { unbroken: "◆", perfect: "✓" };

/** Closes every session: adds its tally mark, then accuracy, medals, mastery change and what's next. */
export function SessionResults({ crumb, shield, stats, comeBack = 0, deltas = [], missedCount = 0, extra = null, onReviewMissed, onAnother, onToday }) {
  const markRef = useRef(null);
  const [tally, setTally] = useState(null);
  const zombies = usePack() === "zombies";

  useEffect(() => {
    let alive = true;
    if (!markRef.current) markRef.current = recordMark();
    void markRef.current.then((r) => {
      if (alive) setTally(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const primary = missedCount > 0 ? onReviewMissed : onAnother;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter" || paletteOpen() || isTypingTarget(e.target) || e.target?.closest?.("button")) return;
      e.preventDefault();
      primaryRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const medals = zombies ? [] : earnedMedals(stats);
  const powerUps = zombies && tally ? earnedPowerUps({ ...stats, closedRound: tally.closedRound }) : [];
  const filled = tally ? (tally.closedRound ? MARKS_PER_ROUND : tally.inRound) : 0;

  return (
    <div className="sh-results" data-sprite-avoid>
      <div className="sh-results-head">
        <div className="sh-results-titles">
          <div className="sh-results-crumb">{crumb}</div>
          <h2 className="sh-results-title">{tally ? (tally.closedRound ? `ROUND ${tally.closedRound} COMPLETE` : "SESSION COMPLETE") : "\u00a0"}</h2>
        </div>
        {tally ? (
          <div className="sh-results-tally" aria-label={`Round ${tally.closedRound ?? tally.round}: ${filled} of ${MARKS_PER_ROUND} sessions`}>
            {Array.from({ length: MARKS_PER_ROUND }, (_, i) => (
              <i key={i} data-on={i < filled || undefined} data-new={i === filled - 1 || undefined} />
            ))}
            <span>ROUND {tally.closedRound ?? tally.round}</span>
          </div>
        ) : null}
      </div>
      <p className="sh-results-summary">{resultSummary({ wentDown: stats.wentDown, downCount: stats.downCount, comeBack })}</p>
      {extra ? <div className="sh-results-extra">{extra}</div> : null}

      <dl className="sh-results-stats">
        <div>
          <dt>Accuracy</dt>
          <dd className="sh-results-accent">{accuracy}%</dd>
        </div>
        <div>
          <dt>Shield at end</dt>
          <dd>{shield.shield}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{stats.best}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatDuration(stats.endedAt - stats.startedAt)}</dd>
        </div>
      </dl>

      {medals.length ? (
        <ul className="sh-results-medals">
          {medals.map((m) => (
            <li key={m.id} className="sh-medal" data-kind={m.id}>
              <span className="sh-medal-hex" aria-hidden="true">
                <span>{m.badge || MEDAL_ICON[m.id]}</span>
              </span>
              <span>
                <span className="sh-medal-label">{m.label}</span>
                <span className="sh-medal-detail">{m.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {powerUps.length ? (
        <ul className="sh-results-powerups" aria-label="Power-ups">
          {powerUps.map((p, i) => (
            <PowerUpDrop key={p.id} powerUp={p} index={i} lead={i === 0} />
          ))}
        </ul>
      ) : null}

      {deltas.length ? (
        <ul className="sh-results-mastery">
          {deltas.slice(0, 4).map((d) => (
            <li key={d.topic}>
              <span className="sh-results-topic">{d.topic}</span>
              <span className="sh-results-bar" aria-hidden="true">
                <i style={{ width: `${d.after}%` }} />
              </span>
              <span className={`sh-results-delta${d.delta > 0 ? "" : " sh-results-delta--flat"}`}>
                {d.delta > 0 ? `+${d.delta}%` : d.delta < 0 ? `${d.delta}%` : "±0%"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="sh-results-actions">
        {missedCount > 0 ? (
          <button type="button" className="sh-btn-accent sh-session-btn" onClick={onReviewMissed}>
            Review {missedCount} missed
          </button>
        ) : null}
        <button type="button" className={`${missedCount > 0 ? "sh-btn-outline" : "sh-btn-accent"} sh-session-btn`} onClick={onAnother}>
          Another round
        </button>
        <button type="button" className="sh-btn-outline sh-session-btn" onClick={onToday}>
          Back to Today
        </button>
      </div>
    </div>
  );
}
