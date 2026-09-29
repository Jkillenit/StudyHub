import { useLayoutEffect, useRef } from "react";

const EDGE = 8;

/**
 * Bubble anchored to Scout. `h` is the side it opens toward (left/right of Scout),
 * `v` whether it sits above or below; it then nudges itself back inside the window.
 * Buttons are real buttons so the keyboard path works.
 */
export function SpeechBubble({ title, text, actions = [], h = "left", v = "above", wide = false, children, footer }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.translate = "";
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - r.right;
    if (r.left + dx < EDGE) dx = EDGE - r.left;
    if (r.bottom > window.innerHeight - EDGE) dy = window.innerHeight - EDGE - r.bottom;
    if (r.top + dy < 40) dy = 40 - r.top;
    if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
  });

  if (!text && !children) return null;
  return (
    <div
      ref={ref}
      className={`sc-bubble sc-bubble--${h} sc-bubble--${v}${wide ? " sc-bubble--wide" : ""}`}
      role="status"
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {title ? <div className="sc-bubble-title mono">{title}</div> : null}
      {text ? <p className="sc-bubble-text">{text}</p> : null}
      {children}
      {actions.length ? (
        <div className="sc-bubble-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`sc-bubble-btn mono${a.primary ? " sc-bubble-btn--primary" : ""}`}
              onClick={a.onClick}
              disabled={a.disabled}
              autoFocus={!!a.autoFocus}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {footer ? <div className="sc-bubble-footer mono">{footer}</div> : null}
    </div>
  );
}
