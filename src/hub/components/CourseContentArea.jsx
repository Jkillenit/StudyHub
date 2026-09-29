import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const FlashcardDeck = lazy(() => import("../../study/flashcards/FlashcardDeck.jsx"));
const UserCourseTipTapNotesEditor = lazy(() => import("../UserCourseTipTapNotesEditor.jsx"));
const GradesTab = lazy(() => import("./GradesTab.jsx"));
const AssignmentsView = lazy(() =>
  import("../../features/mirror/AssignmentsView.jsx").then((m) => ({ default: m.AssignmentsView }))
);
const AnnouncementsView = lazy(() =>
  import("../../features/mirror/AnnouncementsView.jsx").then((m) => ({ default: m.AnnouncementsView }))
);
const BbContentView = lazy(() =>
  import("../../features/mirror/BbContentView.jsx").then((m) => ({ default: m.BbContentView }))
);

const COURSE_VIEWS = {
  "course-assignments": AssignmentsView,
  "course-announcements": AnnouncementsView,
  "course-bb-content": BbContentView,
};

const COLLAPSE_THRESHOLD = 120;
const VISIBLE_DEFAULT = 4;

const itemText = (item) => (item && typeof item === "object" ? String(item.text ?? item.label ?? "") : String(item ?? ""));

function confidenceColor(g) {
  return g.confidence === "high" ? "var(--sh-green)" : g.confidence === "medium" ? "var(--sh-amber)" : "var(--sh-text-dim)";
}

function DefinitionCard({ item, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTerm, setDraftTerm] = useState(item.term);
  const [draftDef, setDraftDef] = useState(item.definition);
  const definition = String(item?.definition || "");
  const shouldCollapse = definition.length > COLLAPSE_THRESHOLD;
  const preview = shouldCollapse ? `${definition.slice(0, COLLAPSE_THRESHOLD).replace(/\s\S+$/, "")}...` : definition;
  const tier = item.confidence === "low" || item.confidence === "medium" ? item.confidence : "high";

  useEffect(() => {
    setDraftTerm(item.term);
    setDraftDef(item.definition);
  }, [item.term, item.definition]);

  const cancel = () => {
    setDraftTerm(item.term);
    setDraftDef(item.definition);
    setIsEditing(false);
  };

  function handleSave() {
    if (draftTerm.trim() && draftDef.trim()) onEdit?.({ ...item, term: draftTerm.trim(), definition: draftDef.trim() });
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
          onKeyDown={(event) => event.key === "Escape" && cancel()}
        />
        <textarea
          className="sh-inline-edit-input sh-def-body-input"
          value={draftDef}
          onChange={(event) => setDraftDef(event.target.value)}
          placeholder="Definition"
          rows={3}
          onKeyDown={(event) => event.key === "Escape" && cancel()}
        />
        <div className="sh-def-edit-actions">
          <button className="sh-btn-ghost sh-btn-green sh-btn-xs" onClick={handleSave}>
            SAVE
          </button>
          <button className="sh-btn-ghost sh-btn-xs" onClick={cancel}>
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`def-card sh-pptx-card sh-tier-${tier}`}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: tier === "low" ? "var(--sh-border)" : "var(--sh-green)",
        opacity: tier === "low" ? 0.75 : 1,
      }}
    >
      <div className="def-card-header">
        <div className="def-term" style={{ opacity: tier === "high" ? 1 : tier === "medium" ? 0.85 : 0.6 }}>
          {item.term}
          {item.enhancedByAI ? <span className="sh-ai-badge">✦ AI</span> : null}
        </div>
        <div className="sh-card-actions">
          {tier !== "high" ? (
            <div
              className="sh-confidence-dot"
              title={`${tier} confidence — verify this term`}
              style={{ background: tier === "medium" ? "var(--sh-amber)" : "var(--sh-text-dim)" }}
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
  if (items.filter((i) => /^\d+[.)]\s/.test(i)).length >= items.length * 0.6) return "numbered";
  if (items.filter((i) => /^[A-Z][^:]{2,40}:\s+\S/.test(i)).length >= items.length * 0.5) return "deflist";
  return "bullets";
}

function SectionItem({ text, type, index }) {
  if (type === "numbered") {
    return (
      <div className="sh-section-item sh-section-item--numbered">
        <span className="sh-item-number mono">{String(index + 1).padStart(2, "0")}</span>
        <span className="sh-item-text">{text.replace(/^\d+[.)]\s*/, "")}</span>
      </div>
    );
  }
  if (type === "deflist") {
    const match = text.match(/^([^:]+):\s+(.+)$/);
    if (match) {
      return (
        <div className="sh-section-item sh-section-item--def">
          <span className="sh-item-sublabel">{match[1].trim()}</span>
          <span className="sh-item-text">{match[2].trim()}</span>
        </div>
      );
    }
  }
  return (
    <div className="sh-section-item sh-section-item--bullet">
      <span className="sh-item-bullet">—</span>
      <span className="sh-item-text">{text}</span>
    </div>
  );
}

function SectionBlock({ section }) {
  const [showAll, setShowAll] = useState(false);
  const items = (section.items || []).map(itemText).filter((t) => t.length > 5);
  const type = detectSectionType(items);
  const hasMore = items.length > VISIBLE_DEFAULT;
  const visible = showAll ? items : items.slice(0, VISIBLE_DEFAULT);
  if (!items.length) return null;
  return (
    <div className="sh-content-section">
      <div className="sh-section-label">{String(section.title || "SECTION").toUpperCase()}</div>
      <div className={`sh-section-block sh-section-${type}`}>
        {visible.map((text, i) => (
          <SectionItem key={i} text={text} type={type} index={i} />
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

function FormulaBlock({ section }) {
  const items = section.items || [];
  if (!items.length) return null;
  return (
    <div className="sh-content-section">
      <div className="sh-section-label">{String(section.title || "FORMULAS").toUpperCase()}</div>
      {items.map((item, j) => (
        <div key={item.id || j} className="def-card sh-formula-block">
          <div className="def-term mono">{item.formula}</div>
          {item.context ? <div className="def-body">{item.context}</div> : null}
        </div>
      ))}
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
        <span className="sh-expand-btn" style={{ color: "var(--sh-amber)" }}>
          {open ? "↑ hide" : "↓ show"}
        </span>
      </button>
      {open ? (
        <div className="sh-needs-review-body">
          <div className="sh-needs-review-note">
            These terms were detected with low confidence. Verify against your source material before studying.
          </div>
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
        <span className="sh-glossary-source">{g.source === "manual" ? "✎ MANUAL" : "↓ IMPORTED"}</span>
        {!muted ? (
          <button className="sh-glossary-remove" onClick={() => onRemove(g.id)}>
            ✕
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

const byTerm = (a, b) => String(a.term || "").localeCompare(String(b.term || ""));

export default function CourseContentArea({
  course,
  currentModule,
  mainTab,
  onTabChange,
  courseGlossaryTerms,
  onImportFile,
  activeItem,
  sourceFilter,
  onSaveCards,
  reviewMeta,
  enhancing,
  onEnhanceReview,
  onMoveReviewToContent,
  onUpdateModuleBody,
  onRemoveGlossaryTerm,
  onGradesChange,
  onUpdateContentData,
  flashcardEditTriggerRef,
}) {
  const userFlashcards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  const localFlashcardEditRef = useRef(null);

  useEffect(() => {
    if (!flashcardEditTriggerRef) return;
    flashcardEditTriggerRef.current = () => localFlashcardEditRef.current?.();
  }, [flashcardEditTriggerRef]);

  const mapDefinitions = (fn) =>
    onUpdateContentData?.(
      (currentModule?.contentData || []).map((section) =>
        section.type === "definitions" ? { ...section, items: fn(section.items || []) } : section
      )
    );
  const handleEditCard = (updated) => mapDefinitions((items) => items.map((i) => (i.id === updated.id ? updated : i)));
  const handleDeleteCard = (item) => mapDefinitions((items) => items.filter((i) => i.id !== item.id));

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
            <button className="sh-btn-ghost sh-btn-ghost-amber" onClick={onImportFile}>
              + IMPORT FILE
            </button>
            <button className="sh-btn-ghost" onClick={() => onTabChange("notes")}>
              ✎ WRITE NOTES
            </button>
          </div>
        </div>
      );
    }
    const blocks = [];
    const lowItems = [];
    contentData.forEach((section, i) => {
      const key = section.id || `${section.type}-${i}`;
      if (section.type === "definitions") {
        const high = (section.items || []).filter((item) => item.confidence !== "low");
        lowItems.push(...(section.items || []).filter((item) => item.confidence === "low"));
        if (high.length) {
          blocks.push(
            <div key={key} className="sh-content-section">
              <div className="sh-section-label">{String(section.title || "DEFINITIONS").toUpperCase()}</div>
              {high.map((item) => (
                <DefinitionCard key={item.id} item={item} onEdit={handleEditCard} onDelete={handleDeleteCard} />
              ))}
            </div>
          );
        }
      } else if (section.type === "section") {
        blocks.push(<SectionBlock key={key} section={section} />);
      } else if (section.type === "formulas") {
        blocks.push(<FormulaBlock key={key} section={section} />);
      }
    });
    return (
      <>
        {blocks}
        {lowItems.length ? <NeedsReviewSection items={lowItems} onEdit={handleEditCard} onDelete={handleDeleteCard} /> : null}
      </>
    );
  };

  const glossaryView = useMemo(() => {
    const all = course?.glossary || [];
    const moduleTerms = all.filter((g) => g.moduleId === currentModule?.id).sort(byTerm);
    const otherTerms = all.filter((g) => g.moduleId !== currentModule?.id).sort(byTerm);
    if (!moduleTerms.length && !otherTerms.length) {
      return (
        <div className="sh-chapter-empty">
          <pre className="sh-empty-ascii">{`┌─────────────────────┐
│   NO TERMS YET      │
│                     │
│   IMPORT A FILE  →  │
└─────────────────────┘`}</pre>
        </div>
      );
    }
    return (
      <div className="sh-glossary-view">
        {moduleTerms.length ? (
          <div className="sh-content-section">
            <div className="sh-section-label">THIS CHAPTER</div>
            {moduleTerms.map((g) => (
              <GlossaryCard key={g.id} g={g} onRemove={onRemoveGlossaryTerm} />
            ))}
          </div>
        ) : null}
        {otherTerms.length ? (
          <div className="sh-content-section">
            <div className="sh-section-label">OTHER CHAPTERS</div>
            {otherTerms.map((g) => (
              <GlossaryCard key={g.id} g={g} onRemove={onRemoveGlossaryTerm} muted />
            ))}
          </div>
        ) : null}
      </div>
    );
  }, [course?.glossary, currentModule?.id, onRemoveGlossaryTerm]);

  const tabs = ["content", "notes", "glossary", "grades"];

  const CourseView = COURSE_VIEWS[activeItem];
  if (CourseView) {
    return (
      <div className="sh-main-body sh-scroll-hover position-relative">
        <Suspense fallback={<div className="sh-skeleton-pulse" style={{ height: 240 }} />}>
          <CourseView key={`${course?.id}-${activeItem}`} courseUuid={course?.uuid || course?.id} />
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <div className="sh-main-header">
        <div className="sh-tab-row">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`sh-tab sh-usercourse-tab ${mainTab === tab ? "active" : ""}`}
              onClick={() => onTabChange(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="sh-main-body sh-scroll-hover position-relative">
        {mainTab === "content" ? (
          activeItem === "qz-deck" ? (
            <Suspense fallback={null}>
              <FlashcardDeck
                key={`${course?.id}-qz`}
                cards={userFlashcards}
                courseId={course?.uuid || course?.id}
                moduleId={currentModule?.id}
                showMasteryButtons
                sourceFilter={sourceFilter}
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
                  <button
                    type="button"
                    className="sh-review-move-btn"
                    style={{ opacity: 0.7 }}
                    onClick={() => void onEnhanceReview()}
                    disabled={enhancing}
                  >
                    {enhancing ? "ENHANCING..." : "✦ ENHANCE WITH AI"}
                  </button>
                  <button type="button" className="sh-review-move-btn" onClick={onMoveReviewToContent}>
                    MOVE TO CONTENT
                  </button>
                </div>
              </div>
            ) : null}
            <Suspense fallback={null}>
              <UserCourseTipTapNotesEditor
                key={currentModule?.id}
                sectionId={currentModule?.id}
                value={currentModule?.body || ""}
                glossaryTerms={courseGlossaryTerms}
                onChangeValue={onUpdateModuleBody}
              />
            </Suspense>
          </>
        ) : mainTab === "glossary" ? (
          <div className="main-content">{glossaryView}</div>
        ) : (
          <Suspense fallback={<div className="sh-skeleton-pulse" style={{ height: 300 }} />}>
            <GradesTab course={course} onComponentsChange={onGradesChange} />
          </Suspense>
        )}
      </div>
    </>
  );
}
