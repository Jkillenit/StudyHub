import { Fragment, useCallback, useEffect, useState } from "react";
import { known, memoryMap } from "../companion/memory/derive.js";
import { courseStore } from "../db/courseStore.js";
import { loadJson, saveJson } from "../lib/storage.js";
import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";
import { RoundTally } from "./RoundTally.jsx";
import { useShell } from "./ShellContext.jsx";

const PIN_KEY = "sh-rail-pinned";
const PIN_COURSE_KEY = "sh-rail-pinned-course";

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
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
      <path d="M10 20v-5.5h4V20" />
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
      <path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" />
      <path d="M12 6.5V20" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19.5c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5" />
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

/** The student's initial from the name Nova asked for, or a person outline. */
function RailAvatar() {
  const [name, setName] = useState(null);
  useEffect(() => {
    const load = () => void courseStore.companionMemory().then((rows) => setName(known(memoryMap(rows), "name")?.name || null));
    load();
    window.addEventListener("studyhub-companion-memory-changed", load);
    return () => window.removeEventListener("studyhub-companion-memory-changed", load);
  }, []);
  return (
    <span className="sh-rail-avatar" title={name || undefined} aria-hidden="true">
      {name ? name.trim().charAt(0).toUpperCase() : <Icon>{ICONS.person}</Icon>}
    </span>
  );
}

function splitCode(code) {
  const s = String(code || "").trim();
  const i = s.indexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

function CourseSubNav({ nav }) {
  return (
    <div className="sh-rail-subnav">
      <div className="sh-rail-subnav-inner">
        {nav.groups.map((g) =>
          g.items.length ? (
            <div key={g.key} className="sh-rail-subgroup" data-tour-id={g.tourId}>
              {g.label ? <div className="sh-rail-subgroup-label">{g.label}</div> : null}
              {g.items.map((item) => {
                const active = nav.activeId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sh-rail-subitem${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => nav.onSelect(item.id)}
                    title={item.label}
                  >
                    <span className={`sh-rail-subitem-prefix${item.tone === "amber" ? " is-amber" : ""}`}>{item.prefix}</span>
                    <span className="sh-rail-subitem-label">{item.label}</span>
                    {item.complete ? <span className="sh-rail-subitem-done" aria-label="Complete">✓</span> : null}
                    {item.badge ? <span className="sh-rail-subitem-badge">{item.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

export function AppRail({ onHub, hubView, courseId, courses, onNavigate, onOpenCourse, onSearch }) {
  const { courseNav, session } = useShell();
  const [pinnedHub, setPinnedHub] = useState(() => loadJson(PIN_KEY, false) === true);
  const [pinnedCourse, setPinnedCourse] = useState(() => loadJson(PIN_COURSE_KEY, true) !== false);
  const showPinned = !session && (onHub ? pinnedHub : pinnedCourse);
  const togglePinned = useCallback(() => (onHub ? setPinnedHub : setPinnedCourse)((v) => !v), [onHub]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "b") return;
      if (session || isTypingTarget(e.target) || paletteOpen()) return;
      e.preventDefault();
      togglePinned();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePinned, session]);

  useEffect(() => saveJson(PIN_KEY, pinnedHub), [pinnedHub]);
  useEffect(() => saveJson(PIN_COURSE_KEY, pinnedCourse), [pinnedCourse]);

  const kbd = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "") ? "⌘ K" : "Ctrl K";

  return (
    <nav className={`sh-rail${showPinned ? " sh-rail--pinned" : ""}${session ? " sh-rail--session" : ""}`} aria-label="Main" inert={session ? "" : undefined} data-dissolve>
      <div className="sh-rail-panel">
        <div className="sh-rail-logo">
          <button type="button" className="sh-rail-brand" onClick={() => onNavigate("today")} title="Today">
            <svg className="sh-rail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            <span className="sh-rail-label sh-rail-wordmark">Study Hub</span>
          </button>
          <button
            type="button"
            className="sh-rail-pin"
            aria-pressed={showPinned}
            onClick={togglePinned}
            title={showPinned ? "Unpin sidebar (Ctrl B)" : "Pin sidebar (Ctrl B)"}
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
          <RailItem icon="decks" label="Decks" active={onHub && hubView === "decks"} onClick={() => onNavigate("decks")} data-tour-id="nav-decks" />
          <RailItem icon="grades" label="Grades" active={onHub && hubView === "grades"} onClick={() => onNavigate("grades")} data-tour-id="nav-grades" />
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
            <span className="sh-rail-label">Courses</span>
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
              <Fragment key={c.id}>
                <button
                  type="button"
                  className={`sh-rail-item sh-rail-course${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenCourse(c.id)}
                  title={c.code}
                >
                  <span className="sh-rail-code-pre">{pre}</span>
                  <span className="sh-rail-label sh-rail-code-num">{num}</span>
                </button>
                {courseNav && courseNav.courseId === c.id ? <CourseSubNav nav={courseNav} /> : null}
              </Fragment>
            );
          })}
        </div>

        <div className="sh-rail-spacer" />
        <div className="sh-rail-divider" />

        <div className="sh-rail-group">
          <RailItem icon="yours" label="Make it yours" onClick={() => onNavigate("settings", { tab: "theme" })} />
          <RailItem
            icon="settings"
            label="Settings"
            hint={<RoundTally variant="rail" />}
            active={onHub && hubView === "settings"}
            onClick={() => onNavigate("settings", { tab: "general" })}
            data-tour-id="titlebar-scout"
          />
        </div>
        <RailAvatar />
      </div>
    </nav>
  );
}
