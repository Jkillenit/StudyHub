import { HudPanel } from "./HudPanel.jsx";

const MAX_DOTS = 4;

export function WeekStrip({ week, onCalendar, index = 0 }) {
  return (
    <HudPanel className="sh-week" index={index} aria-label="This week" data-tour-id="today-week" data-perch>
      <header className="sh-panel-head">
        <h2 className="sh-hud-title">THIS WEEK</h2>
        <button type="button" className="sh-link-btn" onClick={onCalendar}>
          Calendar
        </button>
      </header>
      <div className="sh-week-days">
        {week.days.map((d) => (
          <div key={d.offset} className={`sh-week-day${d.isToday ? " sh-week-day--today" : ""}`} aria-label={`${d.weekday} ${d.dayNum}: ${d.dots.length} due`}>
            <span className="sh-week-dow">{d.weekday}</span>
            <span className="sh-week-num">{d.dayNum}</span>
            <span className="sh-week-dots">
              {d.dots.slice(0, MAX_DOTS).map((dot) => (
                <span key={dot.uuid} className={`sh-week-dot sh-week-dot--${dot.state === "warn" ? "warn" : "accent"}`} title={dot.title} />
              ))}
              {d.dots.length > MAX_DOTS ? <span className="sh-week-dot-more">+</span> : null}
            </span>
          </div>
        ))}
      </div>
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
