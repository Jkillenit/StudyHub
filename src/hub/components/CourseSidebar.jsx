import React, { useMemo, useState } from "react";
import InlineEdit from "./InlineEdit";

function CourseSidebar({ course, activeItem, onActiveChange, onRenameCourse, onRenameModule }) {
  const [search, setSearch] = useState("");
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const completedIds = new Set(course?.completedModuleIds || []);

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter((m) => {
      const label = String(m?.label || "").toLowerCase();
      const title = String(m?.title || "").toLowerCase();
      return label.includes(q) || title.includes(q);
    });
  }, [modules, search]);

  const chapterTag = (id) => {
    const idx = modules.findIndex((m) => m.id === id);
    return `CH·${String(idx + 1).padStart(2, "0")}`;
  };

  return (
    <>
      <div className="sh-sidebar-head">
        <div className="sh-sidebar-label">ACTIVE COURSE</div>
        <div className="sh-sidebar-course">
          <InlineEdit
            value={course?.name || ""}
            className="sh-course-name-edit"
            onSave={async (newName) => {
              await window.studyHub?.db?.courses?.update({
                uuid: course?.uuid || course?.id,
                name: newName,
              });
              onRenameCourse?.(newName);
            }}
          />
        </div>
        <div className="sh-sidebar-meta mono">
          {(course?.subtitle || "NOTES").toUpperCase()} · {modules.length} MODULES
        </div>
      </div>
      <div className="sh-sidebar-search">
        <span className="sh-sidebar-search-prefix" style={{ color: "var(--sh-cyan)" }} aria-hidden>
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
        <div className="sh-sidebar-section-label">MODULES</div>
        {filteredModules.length === 0 ? (
          <pre className="sh-empty-ascii mono px-2">{`┌─────────────────┐
│   NO CHAPTERS   │
│  ADD MODULE →   │
└─────────────────┘`}</pre>
        ) : (
          filteredModules.map((m) => {
            const moduleId = m?.uuid || m?.id;
            const isActive = activeItem === `module:${moduleId}`;
            const done = completedIds.has(moduleId);
            return (
              <button
                key={moduleId}
                type="button"
                className={`ch-item ${isActive ? "active" : ""} ${done ? "ch-item--complete" : ""}`}
                onClick={() => onActiveChange(`module:${moduleId}`)}
              >
                <span className="ch-num">{chapterTag(moduleId)}</span>
                <span className="ch-title">
                  <InlineEdit
                    value={m?.title || ""}
                    className="ch-title-edit"
                    onSave={async (newTitle) => {
                      await window.studyHub?.db?.modules?.update({
                        uuid: moduleId,
                        title: newTitle,
                      });
                      onRenameModule?.(moduleId, newTitle);
                    }}
                  />
                </span>
              </button>
            );
          })
        )}
        <div className="ch-divider mono">DRILL</div>
        <button
          type="button"
          className={`ch-item ${activeItem === "qz-deck" ? "active" : ""}`}
          onClick={() => onActiveChange("qz-deck")}
        >
          <span className="ch-num mono qz-prefix">QZ·01</span>
          <span className="ch-title">Flashcard Deck</span>
        </button>
      </div>
    </>
  );
}

export default React.memo(CourseSidebar);
