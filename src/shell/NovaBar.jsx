import { useMemo, useRef, useState } from "react";
import { describeCommand, parseCommand } from "../nova/commands.js";
import { searchFaq } from "../companion/faq.js";
import { slashMatches } from "../nova/slash.js";

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

const Hex = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <path d="M12 2l8 5v10l-8 5-8-5V7z" />
  </svg>
);

/** The message box: commands run through Nova (studyhub-nova-run), questions open her answer bubble (studyhub-nova-answer). */
export function NovaBar({ courses, placeholder = "Message Nova, or type / for commands" }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const slash = slashMatches(q);
  const text = q.trim().replace(/^\//, "");
  const cmd = useMemo(() => (slash.length || !text ? null : parseCommand(text, { courses })), [slash.length, text, courses]);
  const preview = describeCommand(cmd);
  const faqs = useMemo(
    () => (text && !slash.length && cmd?.id !== "talk" ? searchFaq(text, preview ? 3 : 4) : []),
    [text, slash.length, cmd, preview]
  );

  const done = () => {
    setQ("");
    inputRef.current?.blur();
  };
  const run = (c) => {
    emit("studyhub-nova-run", c);
    done();
  };
  const answer = (f) => {
    emit("studyhub-nova-answer", f);
    done();
  };
  const fill = (t) => {
    setQ(t);
    inputRef.current?.focus();
  };
  const submit = () => {
    if (slash[0]) fill(slash[0].text);
    else if (cmd) run(cmd);
    else if (faqs[0]) answer(faqs[0]);
  };

  const showList = focused && (slash.length > 0 || !!preview || faqs.length > 0);
  return (
    <div className={`sh-novabar${focused ? " sh-novabar--open" : ""}`}>
      {showList ? (
        <ul className="sh-novabar-list">
          {slash.map((s) => (
            <li key={s.cmd}>
              <button type="button" className="sh-novabar-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => fill(s.text)}>
                <span className="sh-novabar-slash">{s.cmd}</span> {s.hint}
              </button>
            </li>
          ))}
          {preview ? (
            <li>
              <button type="button" className="sh-novabar-opt sh-novabar-opt--run" onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)}>
                ▸ {preview}
              </button>
            </li>
          ) : null}
          {faqs.map((f) => (
            <li key={f.id}>
              <button type="button" className="sh-novabar-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => answer(f)}>
                {f.q}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sh-cut">
        <div className="sh-cut-fill sh-hex">
          <div className="sh-novabar-row">
            <span className="sh-novabar-glyph">
              <Hex />
              <span className="sh-novabar-portrait" data-nova-portrait />
            </span>
            <input
              ref={inputRef}
              className="sh-novabar-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") done();
              }}
              placeholder={placeholder}
              aria-label="Message Nova"
            />
            <kbd className="sh-novabar-key">Ctrl /</kbd>
          </div>
          {focused ? (
            <div className="sh-novabar-tools">
              <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "quiz" })}>
                Quiz me
              </button>
              <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "focus", minutes: 25 })}>
                Focus 25
              </button>
              <span className="sh-novabar-hint">Enter to send</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
