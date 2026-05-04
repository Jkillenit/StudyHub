import { useEffect, useRef } from "react";
import { glossaryById } from "./om300Data.js";
import { useGlossarySplit } from "./GlossarySplitContext.jsx";

const byId = glossaryById();

export function GlossaryContextBlock() {
  const { splitOpen, activeTermId, closeSplit } = useGlossarySplit();
  const entryRef = useRef(null);
  const entry = activeTermId ? byId[activeTermId] : null;

  useEffect(() => {
    if (!splitOpen || !activeTermId) return;
    entryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [splitOpen, activeTermId]);

  if (!splitOpen) return null;

  return (
    <div className="ctx-section">
      <div className="sh-ctx-glossary-head">
        <span className="sh-ctx-glossary-title">GLOSSARY</span>
        <button type="button" className="sh-btn-ghost" style={{ width: "auto", marginBottom: 0, padding: "4px 10px" }} onClick={closeSplit}>
          EXIT
        </button>
      </div>
      <div className="sh-ctx-scroll font-sans" style={{ maxHeight: 280, overflowY: "auto" }}>
        {entry ? (
          <article ref={entryRef}>
            <h2 className="font-sans fw-semibold mb-2 mb-0" style={{ fontSize: 13, color: "var(--sh-text-primary)" }}>
              {entry.term}
            </h2>
            {entry.detail.map((p, i) => (
              <p key={i} className="font-sans mb-2" style={{ fontSize: 12, color: "var(--sh-text-secondary)", lineHeight: 1.6 }}>
                {p}
              </p>
            ))}
          </article>
        ) : (
          <p className="mono" style={{ fontSize: 10, color: "var(--sh-text-dim)" }}>
            SELECT A TERM IN THE MAIN COLUMN.
          </p>
        )}
      </div>
    </div>
  );
}
