import React, { useMemo, useState } from "react";
import InlineEdit from "./InlineEdit";

export const COURSE_ITEMS = [
  { id: "course-assignments", prefix: "AS·01", label: "Assignments" },
  { id: "course-announcements", prefix: "AN·02", label: "Announcements" },
  { id: "course-bb-content", prefix: "BB·03", label: "Blackboard Content" },
];

export const STUDY_ITEMS = [
  { id: "qz-deck", prefix: "QZ·01", label: "Flashcard Deck" },
  { id: "study-test", prefix: "PT·02", label: "Practice Test" },
  { id: "study-guide", prefix: "SG·03", label: "Study Guide" },
  { id: "study-progress", prefix: "ST·04", label: "Progress" },
];

function ItemButton({ item, activeItem, onActiveChange, badge }) {
  return (
    <button
      type="button"
      className={`ch-item ${activeItem === item.id ? "active" : ""}`}
      onClick={() => onActiveChange(item.id)}
    >
      <span className="ch-num mono qz-prefix">{item.prefix}</span>
      <span className="ch-title">
        {item.label}
        {badge ? <span className="sh-due-badge mono"> · {badge}</span> : null}
      </span>
    </button>
  );
}

function CourseSidebar({ course, activeItem, onActiveChange, onRenameCourse, onRenameModule, badges = {} }) {
  const [search, setSearch] = useState("");
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const completedIds = new Set(course?.completedModuleIds || []);
  const disabledIds = new Set(course?.disabledModuleIds || []);

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = modules.filter((m) => !disabledIds.has(m.id));
    if (!q) return visible;
    return visible.filter((m) => `${m?.label || ""} ${m?.title || ""}`.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, search, course?.disabledModuleIds]);

  const chapterTag = (id) => `CH·${String(modules.findIndex((m) => m.id === id) + 1).padStart(2, "0")}`;

  return (
    <>
      <div className="sh-sidebar-head">
        <div className="sh-sidebar-label">ACTIVE COURSE</div>
        <div className="sh-sidebar-course">
          <InlineEdit value={course?.name || ""} className="sh-course-name-edit" onSave={(name) => onRenameCourse?.(name)} />
        </div>
        <div className="sh-sidebar-meta mono">
          {(course?.courseCode || course?.subtitle || "NOTES").toUpperCase()} · {modules.length} MODULES
        </div>
      </div>
      <div className="sh-sidebar-search">
        <span className="sh-sidebar-search-prefix" style={{ color: "var(--sh-accent)" }} aria-hidden>
          ›
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="FILTER"
          aria-label="Filter modules"
        />
      </div>
      <div className="sh-sidebar-scroll sh-scroll-hover">
        <div data-tour-id="course-modules">
        <div className="sh-sidebar-section-label">MODULES</div>
        {filteredModules.length === 0 ? (
          <pre className="sh-empty-ascii mono px-2">{`┌─────────────────┐
│   NO CHAPTERS   │
│  ADD MODULE →   │
└─────────────────┘`}</pre>
        ) : (
          filteredModules.map((m) => {
            const isActive = activeItem === `module:${m.id}`;
            return (
              <button
                key={m.id}
                type="button"
                className={`ch-item ${isActive ? "active" : ""} ${completedIds.has(m.id) ? "ch-item--complete" : ""}`}
                onClick={() => onActiveChange(`module:${m.id}`)}
              >
                <span className="ch-num">{chapterTag(m.id)}</span>
                <span className="ch-title">
                  <InlineEdit value={m?.title || ""} className="ch-title-edit" onSave={(title) => onRenameModule?.(m.id, title)} />
                </span>
              </button>
            );
          })
        )}
        </div>
        <div data-tour-id="course-mirror">
          {COURSE_ITEMS.length ? <div className="ch-divider mono">COURSE</div> : null}
          {COURSE_ITEMS.map((item) => (
            <ItemButton key={item.id} item={item} activeItem={activeItem} onActiveChange={onActiveChange} badge={badges[item.id]} />
          ))}
        </div>
        <div data-tour-id="course-drill">
          <div className="ch-divider mono">DRILL</div>
          {STUDY_ITEMS.map((item) => (
            <ItemButton key={item.id} item={item} activeItem={activeItem} onActiveChange={onActiveChange} badge={badges[item.id]} />
          ))}
        </div>
      </div>
    </>
  );
}

export default React.memo(CourseSidebar);
