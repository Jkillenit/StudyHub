import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { describeCommand, parseCommand } from "../nova/commands.js";
import { searchFaq } from "../companion/faq.js";
import { slashMatches } from "../nova/slash.js";
import { paletteOpen } from "../lib/hotkeys.js";
import { fieldEmit, novaAttractor } from "./fieldEvents.js";

const NovaSprite = lazy(() => import("../companion/NovaSprite.jsx").then((m) => ({ default: m.NovaSprite })));

/** True when Nova took it (the listener called preventDefault). */
const emit = (name, detail) => !window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));

/** True while the companion layer has her tucked away (html[data-nova-tucked]). */
function useNovaTucked() {
  const root = document.documentElement;
  const [tucked, setTucked] = useState(() => "novaTucked" in root.dataset);
  useEffect(() => {
    const mo = new MutationObserver(() => setTucked("novaTucked" in root.dataset));
    mo.observe(root, { attributes: true, attributeFilter: ["data-nova-tucked"] });
    return () => mo.disconnect();
  }, [root]);
  return tucked;
}

/** The message box: commands run through Nova (studyhub-nova-run), questions open her answer bubble (studyhub-nova-answer). */
export function NovaBar({ courses, placeholder = "Message Nova, or type / for commands" }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const tucked = useNovaTucked();
  const slash = slashMatches(q);
  const text = q.trim().replace(/^\//, "");
  const cmd = useMemo(() => (slash.length || !text ? null : parseCommand(text, { courses })), [slash.length, text, courses]);
  const preview = describeCommand(cmd);
  const faqs = useMemo(
    () => (text && !slash.length && cmd?.id !== "talk" ? searchFaq(text, preview ? 3 : 4) : []),
    [text, slash.length, cmd, preview]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key.toLowerCase() !== "j" && e.key !== "/")) return;
      if (paletteOpen()) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const done = () => {
    setQ("");
    setNote(null);
    inputRef.current?.blur();
  };
  /** The message streams out of the box into Nova. */
  const sent = () => {
    const to = novaAttractor();
    if (to && boxRef.current) fieldEmit(boxRef.current.getBoundingClientRect(), to, 60);
    done();
  };
  const run = (c) => {
    if (emit("studyhub-nova-run", c)) sent();
    else setNote("Nova's busy right now. Try again in a moment.");
  };
  const answer = (f) => {
    if (emit("studyhub-nova-answer", f)) sent();
    else {
      setQ("");
      setNote(f.a);
    }
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
      <div className="sh-novabar-box" ref={boxRef}>
        <div className="sh-novabar-row">
          <span className="sh-novabar-portrait" data-nova-portrait>
            {tucked ? (
              <Suspense fallback={null}>
                <NovaSprite size={28} />
              </Suspense>
            ) : null}
          </span>
          <input
            ref={inputRef}
            className="sh-novabar-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setNote(null);
            }}
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
          <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "quiz" })}>
            Quiz me
          </button>
          <button type="button" className="sh-novabar-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run({ id: "focus", minutes: 25 })}>
            Focus 25
          </button>
          <button
            type="button"
            className="sh-novabar-send"
            aria-label="Send"
            disabled={!text}
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {note ? <p className="sh-novabar-note" role="status">{note}</p> : null}
      </div>
      {focused || q ? null : <kbd className="sh-novabar-key">Ctrl /</kbd>}
    </div>
  );
}
