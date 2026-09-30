import { useState } from "react";
import { HudPanel } from "./HudPanel.jsx";
import { courseStore } from "../../../db/courseStore.js";
import { BLOCK_REASONS } from "../blocked.js";

const MAX_DOTS = 4;

async function setBlocked(day, reason) {
  await courseStore.companionRemember([{ key: `blocked:${day.key}`, value: reason ? { date: day.key, reason } : null, source: "told" }], {
    notify: true,
  });
  if (reason) window.dispatchEvent(new CustomEvent("studyhub-companion-blocked", { detail: { days: [day.key], reason } }));
}

function setGameDay(day, on) {
  return courseStore.companionRemember([{ key: `gameday:${day.key}`, value: on ? { date: day.key } : null, source: "told" }], { notify: true });
}

export function WeekStrip({ week, onCalendar, index = 0 }) {
  const [picking, setPicking] = useState(null);
  const day = picking ? week.days.find((d) => d.key === picking) : null;

  return (
    <HudPanel className="sh-week" index={index} aria-label="This week" data-tour-id="today-week" data-nova-anchor="panel.week" data-perch>
      <header className="sh-panel-head">
        <h2 className="sh-hud-title">THIS WEEK</h2>
        <button type="button" className="sh-link-btn" onClick={onCalendar}>
          Calendar
        </button>
      </header>
      <div className="sh-week-days">
        {week.days.map((d) => (
          <button
            type="button"
            key={d.offset}
            className={[
              "sh-week-day",
              d.isToday ? "sh-week-day--today" : "",
              d.blocked ? "sh-week-day--blocked" : "",
              d.gameday ? "sh-week-day--gameday" : "",
              picking === d.key ? "sh-week-day--picking" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${d.weekday} ${d.dayNum}: ${d.dots.length} due${d.blocked ? ", blocked" : ""}${d.gameday ? ", game day" : ""}. Mark this day`}
            aria-expanded={picking === d.key}
            title={d.blocked ? "Blocked. Click to change" : "Busy this day? Click to block it"}
            onClick={() => setPicking((k) => (k === d.key ? null : d.key))}
          >
            <span className="sh-week-dow">{d.weekday}</span>
            <span className="sh-week-num">{d.dayNum}</span>
            <span className="sh-week-dots">
              {d.blocked ? <span className="sh-week-off">OFF</span> : null}
              {d.gameday ? <span className="sh-week-game" title="Game day">A</span> : null}
              {d.dots.slice(0, MAX_DOTS).map((dot) => (
                <span key={dot.uuid} className={`sh-week-dot sh-week-dot--${dot.state === "warn" ? "warn" : "accent"}`} title={dot.title} />
              ))}
              {d.dots.length > MAX_DOTS ? <span className="sh-week-dot-more">+</span> : null}
            </span>
          </button>
        ))}
      </div>
      {day ? (
        <div className="sh-week-block" role="group" aria-label={`Mark ${day.weekday} ${day.dayNum}`}>
          <span className="sh-week-block-label">
            {day.blocked ? "BLOCKED" : "MARK"} {day.weekday} {day.dayNum}
          </span>
          {BLOCK_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="sh-week-block-btn"
              onClick={() => {
                setPicking(null);
                void setBlocked(day, r.id);
              }}
            >
              {r.label}
            </button>
          ))}
          {day.blocked ? (
            <button
              type="button"
              className="sh-week-block-btn sh-week-block-btn--clear"
              onClick={() => {
                setPicking(null);
                void setBlocked(day, null);
              }}
            >
              Unblock
            </button>
          ) : null}
          <button
            type="button"
            className={`sh-week-block-btn sh-week-block-btn--game${day.gameday ? " is-on" : ""}`}
            aria-pressed={day.gameday}
            onClick={() => {
              setPicking(null);
              void setGameDay(day, !day.gameday);
            }}
          >
            Game day
          </button>
        </div>
      ) : null}
      {week.later.length ? (
        <ul className="sh-week-list">
          {week.later.map((it) => (
            <li key={it.uuid} className="sh-week-item">
              <span className="sh-week-item-day">{it.dayLabel}</span>
              <div className="sh-week-item-main">
                <div className="sh-week-item-title" title={it.title}>
                  {it.title}
                </div>
                <div className="sh-week-item-meta">
                  <span className="sh-mono">{it.courseLabel}</span> · <span className="sh-mono">{it.time}</span>
                  {it.inTonight ? (
                    <>
                      {" · "}
                      <span className="sh-week-in-tonight">in Tonight</span>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sh-week-empty">Nothing else due this week.</p>
      )}
    </HudPanel>
  );
}
