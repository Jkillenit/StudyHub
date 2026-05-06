import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const FlashcardDeck = lazy(() => import("../../study/flashcards/FlashcardDeck.jsx"));
const UserCourseTipTapNotesEditor = lazy(() => import("../UserCourseTipTapNotesEditor.jsx"));
const GradesTab = lazy(() => import("./GradesTab.jsx"));

const COLLAPSE_THRESHOLD = 120;
const VISIBLE_DEFAULT = 4;

function confidenceColor(g) {
  return g.confidence === "high"
    ? "var(--sh-green)"
    : g.confidence === "medium"
      ? "var(--sh-amber)"
      : "var(--sh-text-dim)";
}

function DefinitionCard({ item, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTerm, setDraftTerm] = useState(item.term);
  const [draftDef, setDraftDef] = useState(item.definition);
  const definition = String(item?.definition || "");
  const shouldCollapse = definition.length > COLLAPSE_THRESHOLD;
  const preview = shouldCollapse ? `${definition.slice(0, COLLAPSE_THRESHOLD).replace(/\s\S+$/, "")}...` : definition;

  useEffect(() => {
    setDraftTerm(item.term);
    setDraftDef(item.definition);
  }, [item.term, item.definition]);

  function handleSave() {
    if (draftTerm.trim() && draftDef.trim()) {
      onEdit?.({
        ...item,
        term: draftTerm.trim(),
        definition: draftDef.trim(),
      });
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="def-card sh-def-card--editing">
        <input
          autoFocus
          className="sh-inline-edit-input sh-def-term-input"
          value={draftTerm}
          onChange={(event) => setDraftTerm(event.target.value)}
          placeholder="Term"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraftTerm(item.term);
              setDraftDef(item.definition);
              setIsEditing(false);
            }
          }}
        />
        <textarea
          className="sh-inline-edit-input sh-def-body-input"
          value={draftDef}
          onChange={(event) => setDraftDef(event.target.value)}
          placeholder="Definition"
          rows={3}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraftTerm(item.term);
              setDraftDef(item.definition);
              setIsEditing(false);
            }
          }}
        />
        <div className="sh-def-edit-actions">
          <button className="sh-btn-ghost sh-btn-green sh-btn-xs" onClick={handleSave}>
            SAVE
          </button>
          <button
            className="sh-btn-ghost sh-btn-xs"
            onClick={() => {
              setDraftTerm(item.term);
              setDraftDef(item.definition);
              setIsEditing(false);
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="def-card sh-pptx-card">
      <div className="def-card-header">
        <div className="def-term">{item.term}</div>
        <div className="sh-card-actions">
          {item.confidence ? (
            <div
              className="sh-confidence-dot"
              style={{
                background:
                  item.confidence === "high"
                    ? "var(--sh-green)"
                    : item.confidence === "medium"
                      ? "var(--sh-amber)"
                      : "var(--sh-text-dim)",
              }}
            />
          ) : null}
          <button className="sh-card-action-btn" onClick={() => setIsEditing(true)} title="Edit">
            ✎
          </button>
          <button className="sh-card-action-btn sh-card-action-btn--delete" onClick={() => onDelete?.(item)} title="Delete">
            ✕
          </button>
        </div>
      </div>
      <div className="def-body">
        {!expanded ? preview : definition}
        {shouldCollapse ? (
          <span className="sh-expand-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? " ← less" : " more →"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function detectSectionType(items) {
  if (!items?.length) return "empty";
  const numbered = items.filter((i) => /^\d+[\.\)]\s/.test(i));
  if (numbered.length >= items.length * 0.6) return "numbered";
  const defLike = items.filter((i) => /^[A-Z][^:]{2,40}:\s+\S/.test(i));
  if (defLike.length >= items.length * 0.5) return "deflist";
  return "bullets";
}

function SectionBlock({ section }) {
  const [showAll, setShowAll] = useState(false);
  const items = (section.items || []).filter((i) => String(i || "").length > 5);
  const type = detectSectionType(items);
  const hasMore = items.length > VISIBLE_DEFAULT;
  const visible = showAll ? items : items.slice(0, VISIBLE_DEFAULT);
  if (!items.length) return null;
  return (
    <div className="sh-content-section">
      <div className="sh-section-label">{String(section.title || "SECTION").toUpperCase()}</div>
      <div className={`sh-section-block sh-section-${type}`}>
        {visible.map((item, i) => (
          <div key={i} className="sh-section-item sh-section-item--bullet">
            <span className="sh-item-bullet">—</span>
            <span className="sh-item-text">{item}</span>
          </div>
        ))}
        {hasMore ? (
          <button className="sh-section-expand" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "← show less" : `+ ${items.length - VISIBLE_DEFAULT} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NeedsReviewSection({ items, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sh-needs-review">
      <button className="sh-needs-review-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="sh-section-label" style={{ color: "var(--sh-amber)", marginBottom: 0 }}>
          NEEDS REVIEW — {items.length} TERM{items.length !== 1 ? "S" : ""}
        </span>
      </button>
      {open ? (
        <div className="sh-needs-review-body">
          {items.map((item) => (
            <DefinitionCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GlossaryCard({ g, onRemove, muted = false }) {
  return (
    <div className={`def-card sh-glossary-card ${muted ? "sh-glossary-card--other" : ""}`}>
      <div className="def-card-header">
        <div className="def-term">{g.term}</div>
        <div className="sh-confidence-dot" style={{ background: confidenceColor(g) }} />
      </div>
      <div className="def-body">{g.definition}</div>
      <div className="sh-glossary-meta">
        <span className="sh-glossary-source">{g.source === "pptx" ? "↓ IMPORTED" : "✎ MANUAL"}</span>
        {!muted ? (
          <button className="sh-glossary-remove" onClick={() => onRemove(g.id)}>
            ✕
          </button>
        ) : <span />}
      </div>
    </div>
  );
}

export default function CourseContentArea({
  course,
  currentModule,
  mainTab,
  onTabChange,
  onChangeCourse,
  courseGlossaryTerms,
  notesStatus,
  onImportFile,
  activeItem,
  sourceFilter,
  onSourceFilterChange,
  onSaveCards,
  reviewMeta,
  enhancing,
  onEnhanceReview,
  onMoveReviewToContent,
  onUpdateModuleBody,
  onRemoveGlossaryTerm,
  onSaveGradeComponents,
  onUpdateContentData,
  flashcardEditTriggerRef,
}) {
  const userFlashcards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  const localFlashcardEditRef = useRef(null);

  useEffect(() => {
    if (!flashcardEditTriggerRef) return;
    flashcardEditTriggerRef.current = () => {
      localFlashcardEditRef.current?.();
    };
  }, [flashcardEditTriggerRef]);

  function handleEditCard(updatedItem) {
    const newData = currentModule?.contentData?.map((section) => {
      if (section.type !== "definitions") return section;
      return {
        ...section,
        items: section.items.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
      };
    });
    onUpdateContentData?.(newData || []);
  }

  function handleDeleteCard(item) {
    const newData = currentModule?.contentData?.map((section) => {
      if (section.type !== "definitions") return section;
      return {
        ...section,
        items: section.items.filter((i) => i.id !== item.id),
      };
    });
    onUpdateContentData?.(newData || []);
  }

  const renderContentData = (contentData) => {
    if (!contentData?.length) {
      return (
        <div className="sh-chapter-empty">
          <pre className="sh-empty-ascii">{`┌─────────────────────┐
│   NO CONTENT YET    │
│                     │
│   DROP A FILE  →    │
│   OR WRITE NOTES    │
└─────────────────────┘`}</pre>
          <div className="sh-empty-actions">
            <button className="sh-btn-ghost sh-btn-ghost-amber" onClick={onImportFile}>+ IMPORT FILE</button>
            <button className="sh-btn-ghost" onClick={() => onTabChange("notes")}>✎ WRITE NOTES</button>
          </div>
        </div>
      );
    }

    const highMedItems = [];
    const lowItems = [];
    contentData.forEach((section, i) => {
      if (section.type === "definitions") {
        const high = (section.items || []).filter((item) => item.confidence !== "low");
        const low = (section.items || []).filter((item) => item.confidence === "low");
        if (high.length > 0) {
          highMedItems.push(
            <div key={i} className="sh-content-section">
              <div className="sh-section-label">DEFINITIONS</div>
              {high.map((item) => (
                <DefinitionCard key={item.id} item={item} onEdit={handleEditCard} onDelete={handleDeleteCard} />
              ))}
            </div>
          );
        }
        if (low.length > 0) lowItems.push(...low);
      } else if (section.type === "section") {
        highMedItems.push(<SectionBlock key={i} section={section} />);
      }
    });
    return (
      <>
        {highMedItems}
        {lowItems.length > 0 ? <NeedsReviewSection items={lowItems} onEdit={handleEditCard} onDelete={handleDeleteCard} /> : null}
      </>
    );
  };

  const renderGlossary = useMemo(() => {
    const moduleTerms = (course?.glossary || []).filter((g) => g.moduleId === currentModule?.id);
    const otherTerms = (course?.glossary || []).filter((g) => g.moduleId !== currentModule?.id);
    return (
      <div className="sh-glossary-view">
        {moduleTerms.length > 0 ? (
          <div className="sh-content-section">
            <div className="sh-section-label">THIS CHAPTER</div>
            {moduleTerms.map((g) => <GlossaryCard key={g.id} g={g} onRemove={onRemoveGlossaryTerm} />)}
          </div>
        ) : null}
        {otherTerms.length > 0 ? (
          <div className="sh-content-section">
            <div className="sh-section-label">OTHER CHAPTERS</div>
            {otherTerms.map((g) => <GlossaryCard key={g.id} g={g} onRemove={onRemoveGlossaryTerm} muted />)}
          </div>
        ) : null}
      </div>
    );
  }, [course?.glossary, currentModule?.id, onRemoveGlossaryTerm]);

  return (
    <>
      <div className="sh-main-header">
        <div className="sh-tab-row">
          <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "content" ? "active" : ""}`} onClick={() => onTabChange("content")}>CONTENT</button>
          <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "notes" ? "active" : ""}`} onClick={() => onTabChange("notes")}>NOTES</button>
          <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "glossary" ? "active" : ""}`} onClick={() => onTabChange("glossary")}>GLOSSARY</button>
          <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "grades" ? "active" : ""}`} onClick={() => onTabChange("grades")}>GRADES</button>
        </div>
      </div>
      <div className="sh-main-body sh-scroll-hover position-relative">
        {mainTab === "content" ? (
          activeItem === "qz-deck" ? (
            <Suspense fallback={null}>
              <FlashcardDeck
                key={`${course?.id}-qz`}
                cards={userFlashcards}
                courseId={course?.id}
                showMasteryButtons={true}
                sourceFilter={sourceFilter}
                onSourceFilterChange={onSourceFilterChange}
                onSaveCards={onSaveCards}
                editTriggerRef={localFlashcardEditRef}
              />
            </Suspense>
          ) : (
            <div className="main-content">{renderContentData(currentModule?.contentData)}</div>
          )
        ) : mainTab === "notes" ? (
          <>
            {reviewMeta ? (
              <div className="sh-review-banner">
                <span>{`REVIEW NEEDED — ${reviewMeta.slideCount} slides could not be auto-classified. Edit below, then click MOVE TO CONTENT.`}</span>
                <div className="d-flex gap-2 align-items-center">
                  <button type="button" className="sh-review-move-btn" style={{ opacity: 0.7 }} onClick={() => void onEnhanceReview()} disabled={enhancing}>
                    {enhancing ? "ENHANCING..." : "✦ ENHANCE WITH AI"}
                  </button>
                  <button type="button" className="sh-review-move-btn" onClick={onMoveReviewToContent}>MOVE TO CONTENT</button>
                </div>
              </div>
            ) : null}
            <Suspense fallback={null}>
              <UserCourseTipTapNotesEditor
                key={currentModule?.id}
                sectionId={currentModule?.id}
                value={currentModule?.body || reviewMeta?.text || ""}
                glossaryTerms={courseGlossaryTerms}
                onAutosaveStatus={notesStatus}
                onChangeValue={onUpdateModuleBody}
              />
            </Suspense>
          </>
        ) : mainTab === "glossary" ? (
          <div className="main-content">{renderGlossary}</div>
        ) : (
          <Suspense fallback={<div className="sh-skeleton-pulse" style={{ height: 300 }} />}>
            <GradesTab course={course} onSaveComponents={onSaveGradeComponents} />
          </Suspense>
        )}
      </div>
    </>
  );
}
