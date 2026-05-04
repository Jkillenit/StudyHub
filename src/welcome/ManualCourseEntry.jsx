import { useEffect, useRef, useState } from "react";

/** Shared manual course name flow (Fix 2): underline input, ghost CREATE, ← BACK */
export function ManualCourseEntry({ onCreate, onBack }) {
  const [name, setName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const n = name.trim();
    if (n.length < 2) return;
    onCreate(n);
  };

  return (
    <div className="sh-manual-entry d-flex flex-column align-items-center">
      <div className="sh-manual-entry-label">NEW COURSE</div>
      <div className="sh-manual-entry-input-wrap">
        <span className="sh-manual-entry-prompt" aria-hidden>
          ›
        </span>
        <input
          ref={inputRef}
          type="text"
          className="sh-manual-entry-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim().length >= 2) submit();
          }}
          autoComplete="off"
          aria-label="Course name"
        />
      </div>
      <div className="sh-manual-entry-hint">COURSE NAME</div>
      <button
        type="button"
        className="sh-manual-entry-create sh-btn-ghost"
        disabled={name.trim().length < 2}
        onClick={submit}
      >
        CREATE
      </button>
      <button type="button" className="sh-manual-entry-back mono" onClick={onBack}>
        ← BACK
      </button>
    </div>
  );
}
