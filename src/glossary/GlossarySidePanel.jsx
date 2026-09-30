import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import { glossaryById } from "./courseData.js";
import { useGlossarySplit } from "./GlossarySplitContext.jsx";

const byId = glossaryById();

export function GlossarySidePanel({ layout = "split" }) {
  const { splitOpen, activeTermId, closeSplit } = useGlossarySplit();
  const entryRef = useRef(null);
  const entry = activeTermId ? byId[activeTermId] : null;
  const stack = layout === "stack";

  useEffect(() => {
    if (!splitOpen || !activeTermId) return;
    entryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [splitOpen, activeTermId]);

  if (!splitOpen) return null;

  return (
    <aside
      aria-label="Glossary panel"
      style={{
        width: stack ? "100%" : "min(420px, 42vw)",
        minWidth: stack ? undefined : 260,
        flexShrink: 0,
        borderLeft: stack ? "none" : "1px solid var(--sh-border)",
        borderTop: stack ? "1px solid var(--sh-border)" : "none",
        background: "var(--sh-panel-solid)",
        display: "flex",
        flexDirection: "column",
        maxHeight: stack ? "min(46vh, 380px)" : "calc(100vh - 168px)",
        marginTop: stack ? 12 : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--sh-border)",
          position: "sticky",
          top: 0,
          background: "var(--sh-panel-solid)",
          zIndex: 2,
        }}
      >
        <span style={{ fontFamily: "var(--sh-font-hud)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--sh-text-3)" }}>
          GLOSSARY
        </span>
        <Button type="button" variant="outline-secondary" size="sm" onClick={closeSplit}>
          Exit
        </Button>
      </div>

      <div style={{ overflowY: "auto", padding: "12px 14px 20px", flex: 1 }}>
        {entry ? (
          <article ref={entryRef}>
            <h2
              style={{
                fontSize: "1.1em",
                fontWeight: 700,
                color: "var(--sh-text)",
                margin: "0 0 12px",
                lineHeight: 1.35,
              }}
            >
              {entry.term}
            </h2>
            {entry.detail.map((p, i) => (
              <p
                key={i}
                style={{
                  fontSize: "0.95em",
                  color: "var(--sh-text-2)",
                  margin: "0 0 12px",
                  lineHeight: 1.65,
                }}
              >
                {p}
              </p>
            ))}
          </article>
        ) : (
          <p style={{ color: "var(--sh-text-3)", fontSize: 13 }}>
            Select a highlighted term in any chapter or the Final review.
          </p>
        )}
      </div>
    </aside>
  );
}
