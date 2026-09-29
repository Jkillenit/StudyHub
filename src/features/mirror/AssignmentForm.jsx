import { useState } from "react";

const KINDS = [
  ["assignment", "ASSIGNMENT"],
  ["exam", "EXAM"],
  ["quiz", "QUIZ"],
  ["project", "PROJECT"],
  ["reading", "READING"],
  ["other", "OTHER"],
];

function toLocalIso(date, time) {
  if (!date) return null;
  const d = new Date(`${date}T${time || "23:59"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Manual assignment entry. `courses` enables a course picker (calendar); otherwise `courseUuid` is fixed. */
export function AssignmentForm({ courses, courseUuid, defaultDate = "", onSaved, onCancel }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("23:59");
  const [kind, setKind] = useState("assignment");
  const [targetCourse, setTargetCourse] = useState(courseUuid || courses?.[0]?.uuid || "");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const dueDate = toLocalIso(date, time);
    if (!title.trim() || !dueDate || !targetCourse) {
      setError("Title, course, and date are required.");
      return;
    }
    const res = await window.studyHub?.db?.assignments?.save?.({
      courseUuid: targetCourse,
      title: title.trim(),
      dueDate,
      kind,
    });
    if (!res?.success) {
      setError("Could not save.");
      return;
    }
    window.dispatchEvent(new CustomEvent("studyhub-mirror-changed", { detail: { courseUuid: targetCourse } }));
    onSaved?.();
  };

  return (
    <form className="sh-asg-form" onSubmit={submit}>
      <input
        className="sh-asg-input sh-asg-input--title"
        placeholder="What's due?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      {courses ? (
        <select className="sh-asg-input" value={targetCourse} onChange={(e) => setTargetCourse(e.target.value)}>
          {courses.map((c) => (
            <option key={c.uuid} value={c.uuid}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      <input className="sh-asg-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="sh-asg-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <select className="sh-asg-input" value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button type="submit" className="sh-btn-ghost sh-bb-sync-btn">
        SAVE
      </button>
      <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={onCancel}>
        CANCEL
      </button>
      {error ? <span className="sh-asg-error">{error}</span> : null}
    </form>
  );
}
