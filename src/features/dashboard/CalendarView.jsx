import { useCallback, useEffect, useMemo, useState } from "react";
import { AssignmentForm } from "../mirror/AssignmentForm.jsx";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Six-week grid starting on the Sunday on/before the 1st of the month. */
function gridDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function CalendarView({ userCourses }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [adding, setAdding] = useState(false);

  const days = useMemo(() => gridDays(month), [month]);

  const load = useCallback(async () => {
    const from = days[0];
    const to = new Date(days[days.length - 1]);
    to.setDate(to.getDate() + 1);
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

  const byDay = useMemo(() => {
    const map = new Map();
    for (const a of items) {
      const key = dayKey(new Date(a.due_date));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return map;
  }, [items]);

  const toggle = async (a) => {
    await window.studyHub?.db?.assignments?.setCompleted?.({ uuid: a.uuid, completed: !a.completed });
    window.dispatchEvent(new CustomEvent("studyhub-mirror-changed", { detail: { courseUuid: a.course_uuid } }));
  };

  const shiftMonth = (delta) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const todayKey = dayKey(new Date());
  const selectedItems = byDay.get(selected) || [];
  const courses = userCourses.map((c) => ({ uuid: c.uuid || c.id, name: c.name }));
  const selectedLabel = new Date(`${selected}T12:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="sh-cal">
      <div className="sh-cal-head">
        <button type="button" className="sh-asg-action" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="sh-cal-month">
          {month.toLocaleDateString([], { month: "long", year: "numeric" }).toUpperCase()}
        </span>
        <button type="button" className="sh-asg-action" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>
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
                <span
                  key={a.uuid}
                  className={`sh-cal-chip${a.kind === "exam" ? " sh-cal-chip--exam" : ""}${a.completed ? " sh-cal-chip--done" : ""}`}
                >
                  {a.title}
                </span>
              ))}
              {list.length > 3 ? <span className="sh-cal-more">+{list.length - 3}</span> : null}
            </button>
          );
        })}
      </div>

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
                  onChange={() => toggle(a)}
                />
                <span className="sh-today-row-main">
                  <span className="sh-today-row-title">
                    {a.kind === "exam" ? <span className="sh-today-tag sh-today-tag--exam">EXAM</span> : null}
                    {a.title}
                  </span>
                  <span className="sh-today-row-sub">{a.course_name}</span>
                </span>
                <span className="sh-today-when">
                  {new Date(a.due_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
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
