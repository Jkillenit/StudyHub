import { useEffect, useRef, useState } from "react";

export default function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline = false,
  suffix = "",
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }
  }, [editing]);

  function handleSave() {
    const trimmed = (draft || "").trim();
    if (trimmed && trimmed !== value) {
      onSave?.(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      handleSave();
    }
    if (event.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    const sharedProps = {
      ref: inputRef,
      className: `sh-inline-edit-input ${className || ""}`,
      value: draft || "",
      placeholder: placeholder || "",
      onChange: (event) => setDraft(event.target.value),
      onBlur: handleSave,
      onKeyDown: handleKeyDown,
    };
    return multiline ? <textarea {...sharedProps} rows={3} /> : <input {...sharedProps} type="text" />;
  }

  return (
    <span className={`sh-inline-edit-trigger ${className || ""}`} onClick={() => setEditing(true)} title="Click to rename">
      {value}
      {suffix}
    </span>
  );
}
