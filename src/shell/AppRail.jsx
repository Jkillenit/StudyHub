import { useEffect, useState } from "react";
import { loadJson, saveJson } from "../lib/storage.js";
import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";

const PIN_KEY = "sh-rail-pinned";

function Icon({ children }) {
  return (
    <svg className="sh-rail-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  today: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  decks: (
    <>
      <rect x="5" y="4" width="14" height="16" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  grades: <path d="M4 20h16M7 17v-5M12 17V7M17 17v-8" />,
  yours: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

function RailItem({ icon, label, active, hint, ...rest }) {
  return (
    <button type="button" className={`sh-rail-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} {...rest}>
      <Icon>{ICONS[icon]}</Icon>
      <span className="sh-rail-label">{label}</span>
      {hint ? <span className="sh-rail-hint">{hint}</span> : null}
    </button>
  );
}

function splitCode(code) {
  const s = String(code || "").trim();
  const i = s.indexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

export function AppRail({ onHub, hubView, courseId, courses, onNavigate, onOpenCourse, onSearch, onOpenSettings }) {
  const [pinned, setPinned] = useState(() => loadJson(PIN_KEY, false) === true);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "b") return;
      if (isTypingTarget(e.target) || paletteOpen()) return;
      e.preventDefault();
      setPinned((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => saveJson(PIN_KEY, pinned), [pinned]);

  const showPinned = pinned && onHub;
  const kbd = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "") ? "⌘ K" : "Ctrl K";

  return (
    <nav className={`sh-rail${showPinned ? " sh-rail--pinned" : ""}`} aria-label="Main">
      <div className="sh-rail-panel">
        <div className="sh-rail-logo">
          <button type="button" className="sh-rail-brand" onClick={() => onNavigate("today")} title="Today">
            <svg className="sh-rail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            <span className="sh-rail-label sh-rail-wordmark">STUDY HUB</span>
          </button>
          <button
            type="button"
            className="sh-rail-pin"
            aria-pressed={pinned}
            onClick={() => setPinned((v) => !v)}
            title={pinned ? "Unpin sidebar (Ctrl B)" : "Pin sidebar (Ctrl B)"}
          >
            Pin
          </button>
        </div>

        <div className="sh-rail-group">
          <RailItem icon="search" label="Search" hint={kbd} onClick={onSearch} data-tour-id="titlebar-palette" />
          <RailItem
            icon="plus"
            label="New session"
            onClick={() => window.dispatchEvent(new CustomEvent("studyhub-nova-run", { detail: { id: "quiz" } }))}
          />
          <RailItem icon="today" label="Today" active={onHub && (hubView === "today" || hubView === "plan")} onClick={() => onNavigate("today")} />
          <RailItem icon="calendar" label="Calendar" active={onHub && hubView === "calendar"} onClick={() => onNavigate("calendar")} data-tour-id="nav-calendar" />
          <RailItem icon="decks" label="Decks" disabled title="Coming soon" />
          <RailItem icon="grades" label="Grades" disabled title="Coming soon" />
        </div>

        <div className="sh-rail-divider" />

        <div className="sh-rail-courses-head">
          <button
            type="button"
            className={`sh-rail-courses-title${onHub && hubView === "courses" ? " is-active" : ""}`}
            aria-current={onHub && hubView === "courses" ? "page" : undefined}
            onClick={() => onNavigate("courses")}
            data-tour-id="nav-courses"
          >
            <span className="sh-rail-label">COURSES</span>
          </button>
          <button type="button" className="sh-rail-add" onClick={() => onNavigate("courses")} title="Add a course" aria-label="Add a course">
            +
          </button>
        </div>

        <div className="sh-rail-group sh-rail-course-list">
          {courses.map((c) => {
            const [pre, num] = splitCode(c.code);
            const active = courseId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`sh-rail-item sh-rail-course${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onOpenCourse(c.id)}
                title={c.code}
              >
                <span className="sh-rail-code-pre">{pre}</span>
                <span className="sh-rail-label sh-rail-code-num">{num}</span>
              </button>
            );
          })}
        </div>

        <div className="sh-rail-spacer" />
        <div className="sh-rail-divider" />

        <div className="sh-rail-group">
          <RailItem icon="yours" label="Make it yours" onClick={onOpenSettings} />
          <RailItem icon="settings" label="Settings" onClick={onOpenSettings} data-tour-id="titlebar-scout" />
        </div>
      </div>
    </nav>
  );
}
