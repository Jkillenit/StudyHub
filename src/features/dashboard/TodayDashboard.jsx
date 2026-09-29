import { useCallback, useEffect, useState } from "react";
import { daysFromToday, dueLabel, shortDate } from "./dateLabels.js";
import { CalendarView } from "./CalendarView.jsx";

const EMPTY = { upcoming: [], announcements: [], dueCards: [], recentGrades: [], stats: null };

function pct(score, possible) {
  if (score == null || !possible) return null;
  return Math.round((score / possible) * 100);
}

function DueSoon({ items, onToggle, onOpenCourse }) {
  if (!items.length) return <p className="sh-today-empty">Nothing due in the next two weeks.</p>;
  return (
    <ul className="sh-today-list">
      {items.slice(0, 8).map((a) => {
        const overdue = (daysFromToday(a.due_date) ?? 0) < 0;
        return (
          <li key={a.uuid} className="sh-today-row">
            <input
              type="checkbox"
              className="sh-today-check"
              aria-label={`Mark ${a.title} complete`}
              checked={!!a.completed}
              onChange={() => onToggle(a)}
            />
            <button type="button" className="sh-today-row-main" onClick={() => onOpenCourse(a.course_uuid)}>
              <span className="sh-today-row-title">
                {a.kind === "exam" ? <span className="sh-today-tag sh-today-tag--exam">EXAM</span> : null}
                {a.title}
              </span>
              <span className="sh-today-row-sub">{a.course_name}</span>
            </button>
            <span className={`sh-today-when${overdue ? " sh-today-when--overdue" : ""}`}>{dueLabel(a.due_date)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CardsDue({ rows, onOpenCourse }) {
  if (!rows.length) return <p className="sh-today-empty">No flashcards yet.</p>;
  return (
    <ul className="sh-today-list">
      {rows.map((r) => (
        <li key={r.course_uuid}>
          <button type="button" className="sh-today-row sh-today-row--button" onClick={() => onOpenCourse(r.course_uuid)}>
            <span className="sh-today-row-main">
              <span className="sh-today-row-title">{r.course_name}</span>
              <span className="sh-today-row-sub">{r.total} CARDS</span>
            </span>
            <span className={`sh-today-count${r.due ? " sh-today-count--due" : ""}`}>{r.due || 0} DUE</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Announcements({ items, onRead }) {
  const [openId, setOpenId] = useState(null);
  if (!items.length) return <p className="sh-today-empty">No announcements synced.</p>;
  return (
    <ul className="sh-today-list">
      {items.map((a) => {
        const open = openId === a.uuid;
        return (
          <li key={a.uuid}>
            <button
              type="button"
              className="sh-today-row sh-today-row--button"
              aria-expanded={open}
              onClick={() => {
                setOpenId(open ? null : a.uuid);
                if (!a.read) onRead(a);
              }}
            >
              <span className={`sh-today-dot${a.read ? "" : " sh-today-dot--unread"}`} />
              <span className="sh-today-row-main">
                <span className="sh-today-row-title">{a.title}</span>
                <span className="sh-today-row-sub">
                  {a.course_name}
                  {a.posted_at ? ` · ${shortDate(a.posted_at)}` : ""}
                </span>
              </span>
            </button>
            {open && a.body ? <p className="sh-today-ann-body">{a.body}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function RecentGrades({ items }) {
  if (!items.length) return <p className="sh-today-empty">No grades synced.</p>;
  return (
    <ul className="sh-today-list">
      {items.map((g, i) => {
        const p = pct(g.score, g.points_possible);
        return (
          <li key={`${g.course_uuid}-${g.name}-${i}`} className="sh-today-row">
            <span className="sh-today-row-main">
              <span className="sh-today-row-title">{g.name}</span>
              <span className="sh-today-row-sub">{g.course_name}</span>
            </span>
            <span className="sh-today-score">
              {g.score}
              {g.points_possible ? `/${g.points_possible}` : ""}
              {p != null ? <span className="sh-today-score-pct"> {p}%</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TodayDashboard({ refreshKey = 0, onOpenCourse, userCourses = [] }) {
  const [data, setData] = useState(EMPTY);
  const [view, setView] = useState("today");

  const load = useCallback(async () => {
    const res = await window.studyHub?.db?.dashboard?.get?.();
    if (res) setData({ ...EMPTY, ...res });
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener("studyhub-mirror-changed", onChange);
    window.addEventListener("studyhub-bb-synced", onChange);
    return () => {
      window.removeEventListener("studyhub-mirror-changed", onChange);
      window.removeEventListener("studyhub-bb-synced", onChange);
    };
  }, [load]);

  const toggleComplete = async (a) => {
    await window.studyHub?.db?.assignments?.setCompleted?.({ uuid: a.uuid, completed: !a.completed });
    void load();
  };

  const markRead = async (a) => {
    await window.studyHub?.db?.announcements?.markRead?.(a.uuid);
    setData((d) => ({ ...d, announcements: d.announcements.map((x) => (x.uuid === a.uuid ? { ...x, read: 1 } : x)) }));
  };

  const totalDue = data.dueCards.reduce((sum, r) => sum + (r.due || 0), 0);
  const weekCount = data.upcoming.filter((a) => {
    const d = daysFromToday(a.due_date);
    return d !== null && d >= 0 && d < 7;
  }).length;
  const streak = data.stats?.streak || 0;
  const today = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();

  return (
    <section className="sh-today" aria-label="Today">
      <header className="sh-today-header">
        <div>
          <div className="sh-today-views" role="tablist">
            {[
              ["today", "TODAY"],
              ["calendar", "CALENDAR"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                className={`sh-today-view-tab${view === id ? " active" : ""}`}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="sh-today-date">{today}</div>
        </div>
        <div className="sh-today-stats">
          <div className="sh-today-stat">
            <span className="sh-today-stat-value">{weekCount}</span>
            <span className="sh-today-stat-label">DUE THIS WEEK</span>
          </div>
          <div className="sh-today-stat">
            <span className="sh-today-stat-value">{totalDue}</span>
            <span className="sh-today-stat-label">CARDS DUE</span>
          </div>
          <div className="sh-today-stat">
            <span className="sh-today-stat-value">{streak}</span>
            <span className="sh-today-stat-label">DAY STREAK</span>
          </div>
        </div>
      </header>

      {view === "calendar" ? <CalendarView userCourses={userCourses} /> : null}
      {view === "today" ? (
        <div className="sh-today-grid">
          <div className="sh-today-card">
            <div className="sh-hub-section-label">DUE SOON</div>
            <DueSoon items={data.upcoming} onToggle={toggleComplete} onOpenCourse={onOpenCourse} />
          </div>
          <div className="sh-today-card">
            <div className="sh-hub-section-label">FLASHCARDS</div>
            <CardsDue rows={data.dueCards} onOpenCourse={onOpenCourse} />
          </div>
          <div className="sh-today-card">
            <div className="sh-hub-section-label">ANNOUNCEMENTS</div>
            <Announcements items={data.announcements} onRead={markRead} />
          </div>
          <div className="sh-today-card">
            <div className="sh-hub-section-label">RECENT GRADES</div>
            <RecentGrades items={data.recentGrades} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
