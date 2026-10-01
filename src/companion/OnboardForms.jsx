import { useState } from "react";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Month + day inside Nova's bubble. No year: she only needs to know when to make a fuss. */
export function BirthdayForm({ onSave, onSkip }) {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const m = month === "" ? null : Number(month);
  return (
    <form
      className="sc-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (m != null && day) onSave({ month: m + 1, day: Number(day) });
      }}
    >
      <div className="sc-onboard-row">
        <select className="sc-name-input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Birth month" autoFocus>
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select className="sc-name-input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Birth day">
          <option value="">Day</option>
          {Array.from({ length: m == null ? 31 : DAYS_IN[m] }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div className="sc-bubble-actions">
        <button type="submit" className="sc-bubble-btn sc-bubble-btn--primary mono" disabled={m == null || !day}>
          SAVE
        </button>
        <button type="button" className="sc-bubble-btn mono" onClick={onSkip}>
          SKIP
        </button>
      </div>
    </form>
  );
}

/** Things she can leave alone, as Director intent ids. */
export const NEVER_BUG = [
  { id: "dueCards", label: "Due flashcards" },
  { id: "overdue", label: "Overdue work" },
  { id: "briefingOffer", label: "Morning briefing offers" },
  { id: "callback", label: "Bringing up the past" },
];

export function NeverBugForm({ initial = [], onSave }) {
  const [picked, setPicked] = useState(() => new Set(initial));
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <form
      className="sc-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave([...picked]);
      }}
    >
      <div className="sc-onboard-checks">
        {NEVER_BUG.map((o) => (
          <label key={o.id} className="sc-onboard-check">
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="sc-bubble-actions">
        <button type="submit" className="sc-bubble-btn sc-bubble-btn--primary mono" autoFocus>
          {picked.size ? "DONE" : "NOTHING, BRING IT"}
        </button>
      </div>
    </form>
  );
}
