import { useCallback, useEffect, useMemo, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { loadJson, saveJson } from "../../lib/storage.js";
import { AssignmentForm } from "../mirror/AssignmentForm.jsx";
import { KindTag } from "./KindTag.jsx";
import { shortCourse } from "./courseLabel.js";
import { dayKey, groupByDay, itemEdge, monthGrid, rangeFor, shiftWeek, weekDays, weekStart } from "./calendarWeek.js";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MODE_KEY = "studyHub.v2.prefs.calendarMode";

const timeOf = (a) => new Date(a.due_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function weekLabel(days) {
  const first = days[0];
  const last = days[6];
  const fmt = (d, withYear) =>
    d.toLocaleDateString([], { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  return `${fmt(first, first.getFullYear() !== last.getFullYear())} – ${fmt(last, true)}`.toUpperCase();
}

export function CalendarView({ userCourses }) {
  const [mode, setMode] = useState(() => (loadJson(MODE_KEY, "week") === "month" ? "month" : "week"));
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [adding, setAdding] = useState(false);

  const days = useMemo(() => (mode === "week" ? weekDays(week) : monthGrid(month)), [mode, week, month]);

  const load = useCallback(async () => {
    const { from, to } = rangeFor(days);
    const res = await window.studyHub?.db?.assignments?.getRange?.({ from: from.toISOString(), to: to.toISOString() });
    setItems(Array.isArray(res) ? res : []);
  }, [days]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("studyhub-mirror-changed", onChange);
    window.addEventListener("studyhub-bb-synced", onChange);
    return () => {
      window.removeEventListener("studyhub-mirror-changed", onChange);
      window.removeEventListener("studyhub-bb-synced", onChange);
    };
  }, [load]);

  const byDay = useMemo(() => groupByDay(items), [items]);

  const toggle = (a) => courseStore.setAssignmentCompleted(a.uuid, !a.completed);

  const pickMode = (next) => {
    setMode(next);
    saveJson(MODE_KEY, next);
    const sel = new Date(`${selected}T12:00`);
    if (next === "week") setWeek(weekStart(sel));
    else setMonth(new Date(sel.getFullYear(), sel.getMonth(), 1));
  };

  // Keep the selected day inside the visible range so the detail list matches the grid.
  const shift = (delta) => {
    if (mode === "week") {
      setWeek(shiftWeek(week, delta));
      setSelected(dayKey(shiftWeek(new Date(`${selected}T12:00`), delta)));
    } else {
      const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
      const now = new Date();
      setMonth(next);
      setSelected(dayKey(next.getMonth() === now.getMonth() && next.getFullYear() === now.getFullYear() ? now : next));
    }
  };

  const todayKey = dayKey(new Date());
  const selectedItems = byDay.get(selected) || [];
  const courses = userCourses.map((c) => ({ uuid: c.uuid || c.id, name: c.name }));
  const selectedLabel = new Date(`${selected}T12:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const unit = mode === "week" ? "week" : "month";
  const rangeLabel =
    mode === "week" ? weekLabel(days) : month.toLocaleDateString([], { month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="sh-cal">
      <div className="sh-cal-head">
        <div className="sh-cal-modes" role="tablist" aria-label="Calendar view">
          {["week", "month"].map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`sh-tab${mode === m ? " active" : ""}`}
              onClick={() => pickMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="sh-cal-nav">
          <button type="button" className="sh-asg-action" onClick={() => shift(-1)} aria-label={`Previous ${unit}`}>
            ‹
          </button>
          <span className="sh-cal-month">{rangeLabel}</span>
          <button type="button" className="sh-asg-action" onClick={() => shift(1)} aria-label={`Next ${unit}`}>
            ›
          </button>
        </div>
      </div>

      {mode === "week" ? (
        <div className="sh-calw-grid">
          {days.map((d, i) => {
            const key = dayKey(d);
            const list = byDay.get(key) || [];
            const cls = [
              "sh-calw-day",
              key === todayKey ? "sh-calw-day--today" : "",
              key === selected ? "sh-calw-day--selected" : "",
            ].join(" ");
            return (
              <button key={key} type="button" className={cls} onClick={() => setSelected(key)}>
                <span className="sh-calw-dayhead">
                  <span className="sh-calw-weekday">{WEEKDAYS[i]}</span>
                  <span className="sh-calw-date">{d.getDate()}</span>
                </span>
                {list.map((a) => (
                  <span key={a.uuid} className={`sh-calw-item sh-calw-item--${itemEdge(a)}`}>
                    <span className="sh-calw-time">{timeOf(a)}</span>
                    <span className="sh-calw-title">{a.title}</span>
                    {a.course_name ? <span className="sh-calw-course">{shortCourse(a.course_name)}</span> : null}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="sh-cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="sh-cal-weekday">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const key = dayKey(d);
            const list = byDay.get(key) || [];
            const cls = [
              "sh-cal-day",
              d.getMonth() !== month.getMonth() ? "sh-cal-day--outside" : "",
              key === todayKey ? "sh-cal-day--today" : "",
              key === selected ? "sh-cal-day--selected" : "",
            ].join(" ");
            return (
              <button key={key} type="button" className={cls} onClick={() => setSelected(key)}>
                <span className="sh-cal-date">{d.getDate()}</span>
                {list.slice(0, 3).map((a) => (
                  <span key={a.uuid} className={`sh-cal-chip sh-cal-chip--${itemEdge(a)}`}>
                    {a.title}
                  </span>
                ))}
                {list.length > 3 ? <span className="sh-cal-more">+{list.length - 3}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="sh-cal-detail">
        <div className="sh-mirror-head">
          <div className="sh-hub-section-label">{selectedLabel.toUpperCase()}</div>
          {!adding && courses.length ? (
            <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={() => setAdding(true)}>
              + ADD
            </button>
          ) : null}
        </div>
        {adding ? (
          <AssignmentForm
            courses={courses}
            defaultDate={selected}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
        {selectedItems.length ? (
          <ul className="sh-today-list">
            {selectedItems.map((a) => (
              <li key={a.uuid} className={`sh-today-row${a.completed ? " sh-asg-row--done" : ""}`}>
                <input
                  type="checkbox"
                  className="sh-today-check"
                  aria-label={`Mark ${a.title} ${a.completed ? "not done" : "done"}`}
                  checked={!!a.completed}
                  onChange={() => void toggle(a)}
                />
                <span className="sh-today-row-main">
                  <span className="sh-today-row-title">
                    <KindTag kind={a.kind} />
                    {a.title}
                  </span>
                  <span className="sh-today-row-sub">{a.course_name}</span>
                </span>
                <span className="sh-today-when">{timeOf(a)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sh-today-empty">Nothing due.</p>
        )}
      </div>
    </div>
  );
}
