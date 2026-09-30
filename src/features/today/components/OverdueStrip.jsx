import { useEffect, useRef, useState } from "react";

const CHIPS_SHOWN = 3;

/** One slim red row for late work. Renders nothing when there is none. */
export function OverdueStrip({ items, onMarkSubmitted, onOpen, index = 0 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!items.length) setOpen(false);
  }, [items.length]);

  if (!items.length) return null;
  const extra = items.length - CHIPS_SHOWN;

  return (
    <div ref={ref} className="sh-overdue sh-arrive" style={{ "--i": index }} role="region" aria-label="Overdue" data-brief-target="overdue">
      <span className="sh-overdue-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6" />
          <path d="M12 16.5v0.5" />
        </svg>
        OVERDUE {items.length}
      </span>
      <div className="sh-overdue-chips">
        {items.slice(0, CHIPS_SHOWN).map((it) => (
          <button key={it.uuid} type="button" className="sh-overdue-chip" title={it.title} onClick={() => onOpen(it)}>
            <span className="sh-overdue-chip-title">{it.title}</span>
            <span className="sh-overdue-chip-meta">
              {it.courseLabel} · {it.daysLate}d
            </span>
          </button>
        ))}
        {extra > 0 ? <span className="sh-overdue-more">+{extra}</span> : null}
      </div>
      <button type="button" className="sh-overdue-action" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Mark submitted
      </button>
      {open ? (
        <div className="sh-overdue-pop" role="dialog" aria-label="Mark overdue items submitted">
          <ul>
            {items.map((it) => (
              <li key={it.uuid}>
                <label>
                  <input type="checkbox" onChange={() => onMarkSubmitted(it.uuid)} />
                  <span className="sh-overdue-pop-title">{it.title}</span>
                  <span className="sh-overdue-pop-meta">
                    {it.courseLabel} · {it.daysLate}d late
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
