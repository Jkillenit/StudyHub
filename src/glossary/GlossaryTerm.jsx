import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glossaryById } from "./om300Data.js";
import { useGlossarySplit } from "./GlossarySplitContext.jsx";

const byId = glossaryById();

function scrollToGlossaryAnchor(sectionId) {
  if (!sectionId) return;
  const direct = document.getElementById(sectionId);
  if (direct) {
    direct.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const m = String(sectionId).match(/^final-sec-(.+)$/);
  if (m) {
    document.querySelector(`[data-glossary-chapter="${m[1]}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

/**
 * Inline glossary link: hover shows short definition; click opens split glossary panel and scrolls section anchor.
 */
export function GlossaryTerm({ id, sectionId, children }) {
  const { openTerm } = useGlossarySplit();
  const entry = byId[id];
  const hoverText = entry?.hover ?? "Open glossary";

  const anchorRef = useRef(null);
  const [tip, setTip] = useState(null);
  const hideTimer = useRef(null);
  const showTimerRef = useRef(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const showTip = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip({
      left: Math.min(r.left, window.innerWidth - 340),
      top: r.bottom + 8,
      text: hoverText,
    });
  }, [hoverText]);

  const scheduleHide = useCallback(() => {
    clearShowTimer();
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), 120);
  }, [clearShowTimer]);

  const onEnter = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      showTip();
    }, 200);
  }, [showTip, clearShowTimer]);

  useEffect(
    () => () => {
      clearShowTimer();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [clearShowTimer]
  );

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      openTerm(id);
      if (sectionId) {
        window.requestAnimationFrame(() => scrollToGlossaryAnchor(sectionId));
      }
    },
    [id, sectionId, openTerm]
  );

  const tipNode = useMemo(() => {
    if (!tip) return null;
    return createPortal(
      <div
        role="tooltip"
        style={{
          position: "fixed",
          left: tip.left,
          top: tip.top,
          maxWidth: 320,
          zIndex: 10050,
          background: "var(--sh-surface-1, #0b0b0e)",
          border: "1px solid var(--bs-border-color, #25252e)",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: "0.88em",
          lineHeight: 1.55,
          color: "#c8c8d0",
          pointerEvents: "none",
        }}
      >
        {tip.text}
      </div>,
      document.body
    );
  }, [tip]);

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        className="sh-glossary-btn"
        onMouseEnter={onEnter}
        onMouseLeave={scheduleHide}
        onFocus={showTip}
        onBlur={scheduleHide}
        onClick={onClick}
        aria-label={`Glossary: ${typeof children === "string" ? children : entry?.term ?? id}`}
      >
        {children}
      </button>
      {tipNode}
    </>
  );
}
