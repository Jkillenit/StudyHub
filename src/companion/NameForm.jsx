import { useState } from "react";

const MAX_NAME = 40;

/** Inline "what should I call you?" field inside Nova's bubble. */
export function NameForm({ onSave, onSkip }) {
  const [value, setValue] = useState("");
  const name = value.trim().slice(0, MAX_NAME);
  return (
    <form
      className="sc-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name) onSave(name);
      }}
    >
      <input
        className="sc-name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX_NAME}
        placeholder="Your name"
        aria-label="What Nova should call you"
        autoFocus
      />
      <div className="sc-bubble-actions">
        <button type="submit" className="sc-bubble-btn sc-bubble-btn--primary mono" disabled={!name}>
          THAT&apos;S ME
        </button>
        <button type="button" className="sc-bubble-btn mono" onClick={onSkip}>
          SKIP
        </button>
      </div>
    </form>
  );
}
