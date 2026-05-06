import React from "react";

function CourseContextPanel({
  course,
  currentModule,
  activeItem,
  sourceFilter,
  onSourceFilterChange,
  masteryPct,
  dueCount,
  onAddModule,
  onDeleteModule,
  onDeleteCourse,
  onHideSidebar,
  onHidePanel,
  onTabChange,
  hasGrades,
}) {
  const userFlashcards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  const filteredFlashcards =
    sourceFilter === "all"
      ? userFlashcards
      : sourceFilter === "due"
        ? userFlashcards.filter((c) => c?.dueAt)
        : userFlashcards.filter((card) =>
            sourceFilter === "manual" ? (card.source || "manual") === "manual" : card.source === "pptx"
          );

  return (
    <div className="ctx-section">
      <div className="ctx-label">MASTERY</div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <div className="sh-meter-track flex-grow-1">
          <div className="sh-meter-fill" style={{ width: `${masteryPct}%`, background: "var(--sh-cyan)" }} />
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--sh-cyan)" }}>
          {masteryPct}%
        </span>
      </div>

      <div className="ctx-section">
        <div className="ctx-label">SHORTCUTS</div>
        <div className="kbd-row">
          <span>Module</span>
          <span className="kbd">← →</span>
        </div>
        <div className="kbd-row">
          <span>Reviewed</span>
          <span className="kbd">⌘R</span>
        </div>
      </div>

      <div className="ctx-section">
        <div className="ctx-label">QUICK</div>
        {activeItem === "qz-deck" && userFlashcards.length > 0 ? (
          <>
            <div className="ctx-label">QZ SOURCES</div>
            <div className="d-flex gap-2 mb-2">
              {[
                { id: "all", label: "ALL" },
                { id: "manual", label: "MANUAL" },
                { id: "pptx", label: "IMPORTED" },
                { id: "due", label: "DUE" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`sh-btn-ghost ${sourceFilter === opt.id ? "sh-btn-ghost--active" : ""}`}
                  style={{ width: "auto", marginBottom: 0, padding: "4px 8px", fontSize: 10 }}
                  onClick={() => onSourceFilterChange(opt.id)}
                >
                  {opt.id === "due" ? (
                    <>
                      DUE{" "}
                      {dueCount > 0 ? (
                        <span className="sh-due-badge" style={{ color: "var(--sh-amber)" }}>
                          · {dueCount}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    opt.label
                  )}
                </button>
              ))}
            </div>
            <p className="mono mb-2" style={{ fontSize: 10, color: "var(--sh-text-dim)" }}>
              {filteredFlashcards.length}/{userFlashcards.length} cards{" "}
              <span style={{ color: dueCount > 0 ? "var(--sh-amber)" : "var(--sh-text-dim)" }}>· {dueCount} due</span>
            </p>
          </>
        ) : null}

        {(course?.materialPaths || []).length > 0 ? (
          <p className="mono mb-2" style={{ fontSize: 10, color: "var(--sh-text-dim)" }}>
            MATERIALS · {(course?.materialPaths || []).length} FILE(S)
          </p>
        ) : null}

        {!hasGrades ? (
          <div className="sh-panel-section">
            <div className="sh-section-label">GRADES</div>
            <button
              type="button"
              className="sh-panel-action sh-panel-action--highlight"
              onClick={() => onTabChange?.("grades")}
            >
              + SET UP GRADES
            </button>
          </div>
        ) : null}

        <button type="button" className="sh-btn-ghost sh-btn-ghost-cyan ctx-btn" onClick={onAddModule}>
          + MODULE
        </button>
        <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={onHideSidebar}>
          HIDE SIDEBAR
        </button>
        <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={onHidePanel}>
          HIDE PANEL
        </button>
        <button
          type="button"
          className="sh-btn-ghost sh-btn-danger-ghost"
          disabled={!currentModule || (course?.modules || []).length <= 1}
          onClick={() => onDeleteModule(currentModule?.id)}
        >
          DELETE MODULE
        </button>
        <button type="button" className="sh-btn-ghost sh-btn-danger-ghost" onClick={onDeleteCourse}>
          DELETE COURSE
        </button>
      </div>
    </div>
  );
}

export default React.memo(CourseContextPanel);
