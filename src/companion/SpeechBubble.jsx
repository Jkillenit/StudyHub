import { useEffect, useLayoutEffect, useRef, useState } from "react";

const EDGE = 8;
const TYPE_MS = 18;

function prefersReducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Reveals `text` a few characters per frame; clicking the bubble finishes it. */
function useTypewriter(text) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text || "" : ""));
  const doneRef = useRef(false);

  useEffect(() => {
    const full = text || "";
    if (prefersReducedMotion() || !full) {
      setShown(full);
      return undefined;
    }
    doneRef.current = false;
    setShown("");
    let i = 0;
    const t = window.setInterval(() => {
      i += 2;
      if (i >= full.length || doneRef.current) {
        setShown(full);
        window.clearInterval(t);
        return;
      }
      setShown(full.slice(0, i));
    }, TYPE_MS * 2);
    return () => window.clearInterval(t);
  }, [text]);

  const finish = () => {
    doneRef.current = true;
    setShown(text || "");
  };
  return [shown, finish, shown.length < (text || "").length];
}

/**
 * Nova's comm panel, anchored beside her. `h` is the side it opens toward, `v` whether it sits
 * above or below; it then nudges itself back inside the window. `tone` tints it: warm, harsh,
 * or rampant. The full text is laid out invisibly first so typing never reflows the panel.
 */
export function SpeechBubble({ title, text, actions = [], h = "left", v = "above", wide = false, tone = null, children, footer }) {
  const ref = useRef(null);
  const [typed, finish, typing] = useTypewriter(text);

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
  }, [text, title, h, v, wide, actions.length, footer, children]);

  if (!text && !children) return null;
  return (
    <div
      ref={ref}
      className={[
        "sc-bubble",
        `sc-bubble--${h}`,
        `sc-bubble--${v}`,
        wide ? "sc-bubble--wide" : "",
        tone ? `sc-bubble--${tone}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={typing ? finish : undefined}
    >
      <span className="sc-bubble-corner sc-bubble-corner--tl" aria-hidden />
      <span className="sc-bubble-corner sc-bubble-corner--br" aria-hidden />
      <span className="sc-bubble-tail" aria-hidden />
      <div className="sc-bubble-head mono">
        <span className="sc-bubble-live" aria-hidden />
        <span>NOVA</span>
        {title ? <span className="sc-bubble-title">· {title}</span> : null}
      </div>
      {text ? (
        <p className="sc-bubble-text">
          <span className="sc-sr">{text}</span>
          <span className="sc-type-ghost" aria-hidden>
            {text}
          </span>
          <span className="sc-type-live" aria-hidden>
            {typed}
            {typing ? <span className="sc-type-caret" aria-hidden /> : null}
          </span>
        </p>
      ) : null}
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
