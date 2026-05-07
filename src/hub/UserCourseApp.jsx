import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CourseSidebarSkeleton } from "../study/CourseSidebarSkeleton.jsx";
import { useDelayedSkeletonVisible } from "../hooks/useDelayedSkeletonVisible.js";
import { FONT_STEPS } from "../constants/fontSteps.js";
import { loadJson, saveJson, STORAGE } from "../lib/storage.js";
import { appendMaterialPaths, ensureUserCourse, uid } from "./userCourseModel.js";
import { useShell } from "../shell/ShellContext.jsx";
import { usePptxImport } from "../pptx/usePptxImport.js";
import { buildOutput } from "../pptx/pptxOutputBuilder.js";
import { classifySlides, textToSlides } from "../pptx/pptxClassifier.js";
import { courseStore } from "../db/courseStore.js";
import CourseSidebar from "./components/CourseSidebar.jsx";
import CourseContentArea from "./components/CourseContentArea.jsx";
import CourseContextPanel from "./components/CourseContextPanel.jsx";
import { hasApiKey } from "../ai/apiKeyUtils.js";
import { enhanceWithClaude } from "../ai/pptxEnhancer.js";
import { mergeEnhancedOutput } from "../ai/mergeEnhancedOutput.js";
import { getDueCards, masteryPercent } from "../study/sm2.js";

const COLLAPSE_THRESHOLD = 120;
const VISIBLE_DEFAULT = 4;

function confidenceColor(g) {
  return g.confidence === "high"
    ? "var(--sh-green)"
    : g.confidence === "medium"
      ? "var(--sh-amber)"
      : "var(--sh-text-dim)";
}

function DefinitionCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const definition = String(item?.definition || "");
  const shouldCollapse = definition.length > COLLAPSE_THRESHOLD;
  const preview = shouldCollapse
    ? `${definition.slice(0, COLLAPSE_THRESHOLD).replace(/\s\S+$/, "")}...`
    : definition;
  const tier = item.confidence || "high";
  const tierStyles = {
    high: {
      borderColor: "var(--sh-green)",
      termOpacity: 1,
      showDot: false,
      dotColor: "var(--sh-green)",
    },
    medium: {
      borderColor: "var(--sh-green)",
      termOpacity: 0.85,
      showDot: true,
      dotColor: "var(--sh-amber)",
    },
    low: {
      borderColor: "var(--sh-border)",
      termOpacity: 0.6,
      showDot: true,
      dotColor: "var(--sh-text-dim)",
    },
  }[tier];

  return (
    <div
      className={`def-card sh-pptx-card sh-tier-${tier}`}
      style={{
        borderLeftColor: tierStyles.borderColor,
        borderLeftWidth: "3px",
        opacity: tier === "low" ? 0.75 : 1,
      }}
    >
      <div className="def-card-header">
        <div className="def-term" style={{ opacity: tierStyles.termOpacity }}>
          {item.term}
          {item.enhancedByAI ? <span className="sh-ai-badge">✦ AI</span> : null}
        </div>
        {tierStyles.showDot ? (
          <div
            className="sh-confidence-dot"
            style={{ background: tierStyles.dotColor }}
            title={`${tier} confidence — verify this term`}
          />
        ) : null}
      </div>
      <div className="def-body">
        {!expanded ? preview : definition}
        {shouldCollapse && !expanded ? (
          <span className="sh-expand-btn" onClick={() => setExpanded(true)}>
            {" "}more →
          </span>
        ) : null}
        {shouldCollapse && expanded ? (
          <span className="sh-expand-btn" onClick={() => setExpanded(false)}>
            {" "}← less
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

function SectionItem({ item, type, index }) {
  if (type === "numbered") {
    const text = String(item || "").replace(/^\d+[\.\)]\s*/, "");
    return (
      <div className="sh-section-item sh-section-item--numbered">
        <span className="sh-item-number mono">{String(index + 1).padStart(2, "0")}</span>
        <span className="sh-item-text">{text}</span>
      </div>
    );
  }
  if (type === "deflist") {
    const match = String(item || "").match(/^([^:]+):\s+(.+)$/);
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
      <span className="sh-item-text">{item}</span>
    </div>
  );
}

function SectionBlock({ section }) {
  const [showAll, setShowAll] = useState(false);
  const items = (section.items || []).filter((i) => String(i || "").length > 5);
  const type = detectSectionType(items);
  const hasMore = items.length > VISIBLE_DEFAULT;
  const visible = showAll ? items : items.slice(0, VISIBLE_DEFAULT);
  if (items.length === 0) return null;
  return (
    <div className="sh-content-section">
      <div className="sh-section-label">{String(section.title || "SECTION").toUpperCase()}</div>
      <div className={`sh-section-block sh-section-${type}`}>
        {visible.map((item, i) => (
          <SectionItem key={i} item={item} type={type} index={i} />
        ))}
        {hasMore && !showAll ? (
          <button className="sh-section-expand" onClick={() => setShowAll(true)}>
            + {items.length - VISIBLE_DEFAULT} more
          </button>
        ) : null}
        {hasMore && showAll ? (
          <button className="sh-section-expand" onClick={() => setShowAll(false)}>
            ← show less
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NeedsReviewSection({ items }) {
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
            <DefinitionCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GlossaryCard({ g, onRemove, muted = false }) {
  const [expanded, setExpanded] = useState(false);
  const definition = String(g?.definition || "");
  const shouldCollapse = definition.length > COLLAPSE_THRESHOLD;
  const preview = shouldCollapse
    ? `${definition.slice(0, COLLAPSE_THRESHOLD).replace(/\s\S+$/, "")}...`
    : definition;
  return (
    <div className={`def-card sh-glossary-card ${muted ? "sh-glossary-card--other" : ""}`}>
      <div className="def-card-header">
        <div className="def-term">{g.term}</div>
        <div className="sh-confidence-dot" style={{ background: confidenceColor(g) }} />
      </div>
      <div className="def-body">
        {!expanded ? preview : definition}
        {shouldCollapse && !expanded ? (
          <span className="sh-expand-btn" onClick={() => setExpanded(true)}>
            {" "}more →
          </span>
        ) : null}
        {shouldCollapse && expanded ? (
          <span className="sh-expand-btn" onClick={() => setExpanded(false)}>
            {" "}← less
          </span>
        ) : null}
      </div>
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

function addTermsToGlossary(courseData, moduleId, cards) {
  const existingTerms = new Set(
    (courseData?.glossary || []).map((g) => String(g.term || "").toLowerCase().trim())
  );
  const newTerms = (cards || [])
    .filter((card) => !existingTerms.has(String(card.term || "").toLowerCase().trim()))
    .map((card) => ({
      id: `gls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      term: card.term,
      definition: card.definition,
      confidence: card.confidence || "high",
      source: "pptx",
      moduleId,
      addedAt: new Date().toISOString(),
    }));
  return { ...courseData, glossary: [...(courseData?.glossary || []), ...newTerms] };
}

function mergeFlashcards(existingCards, newCards, moduleId) {
  const current = Array.isArray(existingCards) ? existingCards : [];
  const existingFronts = new Set(current.map((c) => String(c.front || "").toLowerCase().trim()));
  const dedupedNew = (newCards || [])
    .filter((card) => !existingFronts.has(String(card.front || "").toLowerCase().trim()))
    .map((card) => ({
      ...card,
      source: card.source || "pptx",
      moduleId,
      addedAt: new Date().toISOString(),
    }));
  return [...current, ...dedupedNew];
}

function cleanupEmptyDefaultModules(modules, protectedModuleId = null) {
  const defaultTitlePattern = /^(section\s+\d+|general)$/i;
  const list = Array.isArray(modules) ? modules : [];
  return list.filter((m) => {
    if (protectedModuleId && m.id === protectedModuleId) return true;
    const title = String(m?.title || "").trim();
    const hasDefaultTitle = defaultTitlePattern.test(title);
    const hasContent = Array.isArray(m?.contentData) && m.contentData.length > 0;
    const hasBody = String(m?.body || "").trim().length > 0;
    if (hasDefaultTitle && !hasContent && !hasBody) return false;
    return true;
  });
}

export function UserCourseApp({
  course,
  onChangeCourse,
  onDeleteCourse,
  courseShellLoad = false,
  onActiveChapterChange,
}) {
  const { setBreadcrumb, setStatusBar } = useShell();
  const courseRef = useRef(course);
  courseRef.current = course;
  const mountedRef = useRef(true);
  const sessionCardsRef = useRef(null);
  const flashcardEditTriggerRef = useRef(null);

  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ctxCollapsed, setCtxCollapsed] = useState(false);
  const [mainTab, setMainTab] = useState("content");
  const [hasGrades, setHasGrades] = useState(false);
  const [expressBusy, setExpressBusy] = useState(false);
  const [expressLabel, setExpressLabel] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [importError, setImportError] = useState("");
  const [reviewMeta, setReviewMeta] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [activeItem, setActiveItem] = useState(null);
  const wasShellLoading = useRef(false);
  const shellSkelVis = useDelayedSkeletonVisible(!!courseShellLoad, courseShellLoad ? "shell" : "");
  const [mainEnterClass, setMainEnterClass] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (courseShellLoad) {
      wasShellLoading.current = true;
      setMainEnterClass("");
      return;
    }
    if (wasShellLoading.current) {
      wasShellLoading.current = false;
      setMainEnterClass("sh-content-enter");
      const t = window.setTimeout(() => setMainEnterClass(""), 80);
      return () => window.clearTimeout(t);
    }
  }, [courseShellLoad]);
  const [fontStep, setFontStep] = useState(() => {
    const s = loadJson(STORAGE.fontStep, 1);
    return typeof s === "number" && s >= 0 && s < FONT_STEPS.length ? s : 1;
  });
  const [comfortable, setComfortable] = useState(() => loadJson(STORAGE.comfortable, true));
  const { importPptx, progress, error: pptxError, reset: resetPptx } = usePptxImport();

  useEffect(() => {
    saveJson(STORAGE.fontStep, fontStep);
  }, [fontStep]);
  useEffect(() => {
    saveJson(STORAGE.comfortable, comfortable);
  }, [comfortable]);

  const c = ensureUserCourse(course);
  const chapters = c.modules.map((m) => ({
    id: m.id,
    label: m.label || "Tab",
    title: m.title || "Section",
  }));

  const [disabledIds, setDisabledIds] = useState(() => new Set(c.disabledModuleIds || []));
  const [completedIds, setCompletedIds] = useState(() => new Set(c.completedModuleIds || []));
  const [active, setActive] = useState(c.activeModuleId);

  useEffect(() => {
    const ec = ensureUserCourse(course);
    setDisabledIds(new Set(ec.disabledModuleIds || []));
    setCompletedIds(new Set(ec.completedModuleIds || []));
    setActive(ec.activeModuleId);
    setActiveItem(`module:${ec.activeModuleId}`);
  }, [course.id]);

  useEffect(() => {
    setMainTab("content");
    setActiveItem((prev) => (prev === "qz-deck" ? prev : `module:${active}`));
  }, [active]);

  useEffect(() => {
    async function loadHasGrades() {
      const courseUuid = course?.uuid || course?.id;
      if (!courseUuid) {
        setHasGrades(false);
        return;
      }
      const rows = await window.studyHub?.db?.grades?.getComponents(courseUuid);
      setHasGrades(Array.isArray(rows) && rows.length > 0);
    }
    void loadHasGrades();
  }, [course?.uuid, course?.id]);

  useEffect(() => {
    const cur = ensureUserCourse(courseRef.current);
    const blocks = cur.pptxReviewBlocks || {};
    setReviewMeta(blocks[active] || null);
  }, [active, course.id]);

  useEffect(() => {
    const cur = ensureUserCourse(courseRef.current);
    const cleanedModules = cleanupEmptyDefaultModules(cur.modules, active);
    if (cleanedModules.length === cur.modules.length) return;
    onChangeCourse({
      ...cur,
      modules: cleanedModules,
      activeModuleId: cleanedModules.some((m) => m.id === cur.activeModuleId)
        ? cur.activeModuleId
        : cleanedModules[0]?.id,
      disabledModuleIds: [...disabledIds].filter((id) => cleanedModules.some((m) => m.id === id)),
      completedModuleIds: [...completedIds].filter((id) => cleanedModules.some((m) => m.id === id)),
    });
  }, [active, completedIds, disabledIds, onChangeCourse, course.id]);

  useEffect(() => {
    onActiveChapterChange?.(active);
  }, [active, onActiveChapterChange]);

  useEffect(() => {
    const onNav = (e) => {
      const d = e.detail;
      if (d?.courseId === course.id && d?.chapterId) {
        setActive(d.chapterId);
        setActiveItem(`module:${d.chapterId}`);
      }
    };
    window.addEventListener("studyhub-navigate-chapter", onNav);
    return () => window.removeEventListener("studyhub-navigate-chapter", onNav);
  }, [course.id]);

  useEffect(() => {
    const onTermNav = (e) => {
      const d = e.detail;
      if (d?.courseId !== course.id) return;
      if (d?.moduleId) {
        setActive(d.moduleId);
        setActiveItem(`module:${d.moduleId}`);
      }
      setMainTab(d?.tab || "content");
    };
    window.addEventListener("studyhub-open-content-tab", onTermNav);
    return () => window.removeEventListener("studyhub-open-content-tab", onTermNav);
  }, [course.id]);

  useEffect(() => {
    const onSettings = () => setSettingsOpen(true);
    window.addEventListener("studyhub-open-settings", onSettings);
    return () => window.removeEventListener("studyhub-open-settings", onSettings);
  }, []);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem("studyhub.pendingToast");
      if (msg) {
        sessionStorage.removeItem("studyhub.pendingToast");
        setToastMsg(msg);
        window.setTimeout(() => {
          if (mountedRef.current) {
            setToastMsg("");
          }
        }, 4500);
      }
    } catch {
      /* ignore */
    }
  }, [course.id]);

  const materialPathsKey = (ensureUserCourse(course).materialPaths || []).join("|");
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    const paths = ensureUserCourse(course).materialPaths || [];
    if (bridge?.registerMaterialPaths && paths.length) {
      void bridge.registerMaterialPaths(paths);
    }
  }, [course.id, materialPathsKey]);

  function buildChapterContent(output) {
    const sections = [];
    if ((output?.contentCards || []).length > 0) {
      sections.push({
        type: "definitions",
        title: "DEFINITIONS",
        items: output.contentCards.map((card) => ({
          term: card.term,
          definition: card.definition,
          id: card.id,
          confidence: card.confidence || "high",
          source: "pptx",
          enhancedByAI: !!card.enhancedByAI,
        })),
      });
    }
    for (const section of output?.contentSections || []) {
      sections.push({
        type: "section",
        title: section.title,
        items: section.items,
        source: "pptx",
      });
    }
    if ((output?.contentFormulas || []).length > 0) {
      sections.push({
        type: "formulas",
        title: "FORMULAS",
        items: output.contentFormulas.map((f) => ({
          formula: f.formula,
          context: f.context,
          source: "pptx",
        })),
      });
    }
    return sections;
  }

  const removeGlossaryTerm = useCallback(
    (termId) => {
      const cur = ensureUserCourse(courseRef.current);
      onChangeCourse({
        ...cur,
        glossary: (cur.glossary || []).filter((g) => g.id !== termId),
        disabledModuleIds: [...disabledIds],
        completedModuleIds: [...completedIds],
        activeModuleId: active,
      });
    },
    [active, completedIds, disabledIds, onChangeCourse]
  );

  function handleRenameCourse(newName) {
    onChangeCourse({
      ...c,
      name: newName,
    });
  }

  function handleRenameModule(moduleId, title) {
    onChangeCourse({
      ...c,
      modules: c.modules.map((m) => ((m.uuid || m.id) === moduleId ? { ...m, title } : m)),
    });
  }

  function handleContentDataChange(moduleId, newData) {
    onChangeCourse({
      ...c,
      modules: c.modules.map((m) => ((m.uuid || m.id) === moduleId ? { ...m, contentData: newData } : m)),
    });
  }

  function onContentDataChange(moduleId, newData) {
    handleContentDataChange(moduleId, newData);
  }

  async function handleUpdateContentData(newData) {
    const nextCourse = {
      ...c,
      modules: c.modules.map((m) => ((m.uuid || m.id) === activeModuleId ? { ...m, contentData: newData } : m)),
    };
    onContentDataChange(activeModuleId, newData);
    if (currentModule?.uuid || currentModule?.id) {
      await courseStore.syncCourse(nextCourse);
    }
  }

  function renderGlossary(courseData, moduleId) {
    const moduleTerms = (courseData?.glossary || []).filter((g) => g.moduleId === moduleId);
    const otherTerms = (courseData?.glossary || []).filter((g) => g.moduleId !== moduleId);
    if (moduleTerms.length === 0 && otherTerms.length === 0) {
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
        {moduleTerms.length > 0 ? (
          <div className="sh-content-section">
            <div className="sh-section-label">THIS CHAPTER</div>
            {moduleTerms
              .sort((a, b) => String(a.term || "").localeCompare(String(b.term || "")))
              .map((g) => <GlossaryCard key={g.id} g={g} onRemove={removeGlossaryTerm} />)}
          </div>
        ) : null}
        {otherTerms.length > 0 ? (
          <div className="sh-content-section">
            <div className="sh-section-label">OTHER CHAPTERS</div>
            {otherTerms
              .sort((a, b) => String(a.term || "").localeCompare(String(b.term || "")))
              .map((g) => <GlossaryCard key={g.id} g={g} onRemove={removeGlossaryTerm} muted />)}
          </div>
        ) : null}
      </div>
    );
  }

  const runChapterExpressImport = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.pickFiles) {
      window.alert("File import requires the Study Hub desktop app.");
      return;
    }
    try {
      const paths = await bridge.pickFiles([
        { name: "Slides & documents", extensions: ["pptx", "pdf"] },
        { name: "All files", extensions: ["*"] },
      ]);
      if (!paths?.length) return;
      const p = paths[0];
      if (!p || typeof p !== "string") {
        console.error("[PPTX] No file path available:", p);
        setImportError(
          "Drag-and-drop requires running in the Electron app. Click BROWSE FILES above to select your file."
        );
        return;
      }
      const base = p.split(/[/\\]/).pop() || p;
      const targetModuleId = active;
      setExpressLabel(base);
      setExpressBusy(true);
      setImportError("");
      const cur = ensureUserCourse(courseRef.current);
      let nextCourse = appendMaterialPaths(cur, [p]);
      if (bridge.registerMaterialPaths) void bridge.registerMaterialPaths([p]);
      const ext = (p.split(".").pop() || "").toLowerCase();
      console.log("[PPTX] absPath value:", p);
      console.log("[PPTX] absPath type:", typeof p);
      console.log("[PPTX] ext extracted:", ext);
      console.log("[PPTX] bridge.extractPptx exists:", !!bridge?.extractPptx);

      if (ext === "pptx") {
        const output = await importPptx(p, targetModuleId);
        console.log("[PPTX] Import output:", output);
        console.log("[PPTX] Taking pipeline path:", !!output);
        if (!output) {
          setImportError(`IMPORT FAILED\n${pptxError || "Could not parse this PPTX file."}\n\n[ TRY AGAIN ]`);
          setExpressBusy(false);
          return;
        }
        const contentData = buildChapterContent(output);
        console.log(
          "[CONTENT] Writing contentData to module:",
          targetModuleId,
          "cards:",
          output.contentCards.length
        );
        const modules = nextCourse.modules.map((m) => {
          if (m.id !== targetModuleId) return m;
          console.log("[PPTX] Applying to chapter:", targetModuleId);
          console.log("[PPTX] Cards to apply:", output.contentCards.length);
          const mergedContent = [...(Array.isArray(m.contentData) ? m.contentData : []), ...contentData];
          const reviewText = output.notesReviewBlock?.text || "";
          const sep = m.body?.trim() && reviewText ? "\n\n" : "";
          const body = reviewText ? `${reviewText}${sep}${m.body || ""}`.trim() : m.body || "";
          const pptxTitle = String(output?.pptxMeta?.firstSlideTitle || "").trim();
          const hasMeaningfulTitle =
            pptxTitle &&
            pptxTitle.length > 3 &&
            pptxTitle.length < 120 &&
            !/^slide\s*\d+$/i.test(pptxTitle);
          return { ...m, contentData: mergedContent, body, title: hasMeaningfulTitle ? pptxTitle : m.title };
        });
        const blocks = { ...(nextCourse.pptxReviewBlocks || {}) };
        if (output.notesReviewBlock) {
          blocks[targetModuleId] = {
            slideCount: output.notesReviewBlock.slideCount,
            text: output.notesReviewBlock.text,
          };
          setReviewMeta(blocks[targetModuleId]);
        } else {
          delete blocks[targetModuleId];
          setReviewMeta(null);
        }
        const taggedCards = (output.flashcards || []).map((card) => ({ ...card, source: "pptx" }));
        const flashcards = mergeFlashcards(nextCourse.flashcards || [], taggedCards, targetModuleId);
        nextCourse = {
          ...nextCourse,
          modules: cleanupEmptyDefaultModules(modules, targetModuleId),
          pptxReviewBlocks: blocks,
          flashcards,
        };
        nextCourse = addTermsToGlossary(nextCourse, targetModuleId, output.contentCards || []);
        console.log("[INTEGRATION] course.glossary length:", nextCourse.glossary?.length);
        console.log("[INTEGRATION] course.glossary sample:", nextCourse.glossary?.[0]);
        console.log(
          "[INTEGRATION] course flashcards:",
          nextCourse.flashcards?.length || nextCourse.pptxFlashcards?.length
        );
        console.log(
          "[INTEGRATION] modules:",
          nextCourse.modules?.map((m) => ({
            id: m.id,
            title: m.title,
            contentDataLength: m.contentData?.length,
          }))
        );
        console.log("[PPTX] Routing:", {
          contentCards: output.contentCards.length,
          toContentTab: true,
          reviewBlock: !!output.notesReviewBlock,
          toNotesTab: !!output.notesReviewBlock,
          flashcards: output.flashcards.length,
          toQzDeck: output.flashcards.length > 0,
        });
        if (output.notesReviewBlock) setMainTab("notes");
        setToastMsg(
          `IMPORT COMPLETE\n✓ ${output.stats.cards} cards  ✓ ${output.flashcards.length} flashcards${
            output.stats.unclassified ? `\n↻ ${output.stats.unclassified} slides need review` : ""
          }`
        );
      } else {
        setToastMsg("File attached to Materials.");
      }

      onChangeCourse({
        ...nextCourse,
        disabledModuleIds: [...(cur.disabledModuleIds || [])],
        completedModuleIds: [...(cur.completedModuleIds || [])],
        activeModuleId: targetModuleId,
      });
      window.setTimeout(() => {
        if (mountedRef.current) {
          setToastMsg("");
        }
      }, 4500);
      setExpressBusy(false);
      setExpressLabel("");
      resetPptx();
    } catch {
      /* ignore */
      setImportError("IMPORT FAILED\nUnexpected error during import.\n\n[ TRY AGAIN ]");
      setExpressBusy(false);
    }
  }, [active, importPptx, onChangeCourse, resetPptx]);

  const moveReviewToContent = useCallback(() => {
    const activeModule = ensureUserCourse(courseRef.current).modules.find((m) => m.id === active);
    const sourceText = String(activeModule?.body || reviewMeta?.text || "").trim();
    if (!sourceText) return;
    const slides = textToSlides(sourceText, activeModule?.title || "Notes Review");
    const classified = classifySlides(slides);
    const output = buildOutput(classified);
    const contentData = buildChapterContent(output);
    if (contentData.length) {
      const cur = ensureUserCourse(courseRef.current);
      const modules = cur.modules.map((m) => {
        if (m.id !== active) return m;
        const mergedContent = [...(Array.isArray(m.contentData) ? m.contentData : []), ...contentData];
        const remainingText = output.notesReviewBlock?.text || "";
        return { ...m, contentData: mergedContent, body: remainingText };
      });
      const blocks = { ...(cur.pptxReviewBlocks || {}) };
      if (output.notesReviewBlock?.text) {
        blocks[active] = { slideCount: output.notesReviewBlock.slideCount, text: output.notesReviewBlock.text };
        setReviewMeta(blocks[active]);
      } else {
        delete blocks[active];
        setReviewMeta(null);
      }
      const taggedCards = (output.flashcards || []).map((card) => ({ ...card, source: "pptx" }));
      const flashcards = mergeFlashcards(cur.flashcards || [], taggedCards, active);
      let nextCourse = { ...cur, modules, pptxReviewBlocks: blocks, flashcards };
      nextCourse = addTermsToGlossary(nextCourse, active, output.contentCards || []);
      setToastMsg(`CONTENT UPDATED · ${output.contentCards.length} cards added`);
      window.setTimeout(() => {
        if (mountedRef.current) {
          setToastMsg("");
        }
      }, 3000);
      onChangeCourse({
        ...nextCourse,
        disabledModuleIds: [...disabledIds],
        completedModuleIds: [...completedIds],
        activeModuleId: active,
      });
    }
  }, [active, completedIds, disabledIds, onChangeCourse, reviewMeta]);

  const handleEnhanceReview = useCallback(async () => {
    const cur = ensureUserCourse(courseRef.current);
    const module = cur.modules.find((m) => m.id === active);
    if (!module) return;
    if (!hasApiKey()) {
      setToastMsg("Add API key in Settings to use AI enhancement");
      window.setTimeout(() => {
        if (mountedRef.current) {
          setToastMsg("");
        }
      }, 3000);
      return;
    }

    setEnhancing(true);
    try {
      const currentOutput = {
        contentCards:
          module.contentData
            ?.flatMap((s) => s.items || [])
            .filter((i) => i && i.term && i.definition)
            .map((i) => ({
              id: i.id || uid("pptx"),
              term: i.term,
              definition: i.definition,
              confidence: i.confidence || "high",
              source: i.source || "pptx",
              enhancedByAI: !!i.enhancedByAI,
            })) || [],
        notesReviewBlock: { html: module.body || "" },
        flashcards: [],
      };

      const aiResult = await enhanceWithClaude(currentOutput);
      const merged = mergeEnhancedOutput(currentOutput, aiResult);
      if (!aiResult) {
        setToastMsg("No AI changes were returned");
        window.setTimeout(() => {
          if (mountedRef.current) {
            setToastMsg("");
          }
        }, 2500);
        return;
      }

      const rebuiltContent = buildChapterContent(merged);
      const modules = cur.modules.map((m) => (m.id === module.id ? { ...m, contentData: rebuiltContent } : m));
      let nextCourse = { ...cur, modules };
      nextCourse = addTermsToGlossary(nextCourse, module.id, merged.contentCards || []);
      const taggedCards = (merged.flashcards || []).map((card) => ({ ...card, source: "pptx" }));
      nextCourse = { ...nextCourse, flashcards: mergeFlashcards(cur.flashcards || [], taggedCards, module.id) };
      onChangeCourse({
        ...nextCourse,
        disabledModuleIds: [...disabledIds],
        completedModuleIds: [...completedIds],
        activeModuleId: active,
      });
      setToastMsg(
        `AI enhanced ${aiResult.definitions?.length || 0} terms, found ${aiResult.newDefinitions?.length || 0} new`
      );
      window.setTimeout(() => {
        if (mountedRef.current) {
          setToastMsg("");
        }
      }, 3500);
    } finally {
      setEnhancing(false);
    }
  }, [active, completedIds, disabledIds, onChangeCourse]);

  useEffect(() => {
    const cur = ensureUserCourse(courseRef.current);
    onChangeCourse({
      ...cur,
      disabledModuleIds: [...disabledIds],
      completedModuleIds: [...completedIds],
      activeModuleId: active,
    });
  }, [disabledIds, completedIds, active, onChangeCourse]);

  const visibleChapters = useMemo(
    () => chapters.filter((ch) => !disabledIds.has(ch.id)),
    [chapters, disabledIds]
  );

  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleChapters;
    return visibleChapters.filter(
      (x) => x.title.toLowerCase().includes(q) || x.label.toLowerCase().includes(q)
    );
  }, [visibleChapters, search]);

  useEffect(() => {
    if (!visibleChapters.length) return;
    if (!visibleChapters.some((ch) => ch.id === active)) {
      setActive(visibleChapters[0].id);
    }
  }, [visibleChapters, active]);

  const activeModuleId = active;
  const currentModule = useMemo(
    () => c.modules.find((m) => (m.uuid || m.id) === activeModuleId),
    [c.modules, activeModuleId]
  );
  const courseGlossaryTerms = useMemo(
    () =>
      (c.glossary || [])
        .filter((g) => g.confidence !== "low")
        .map((g) => ({ term: g.term, definition: g.definition })),
    [c.glossary]
  );
  const userFlashcards = Array.isArray(c.flashcards) ? c.flashcards : [];
  const dueCount = useMemo(() => getDueCards(c.flashcards || []).length, [c.flashcards]);
  const filteredFlashcards =
    sourceFilter === "all"
      ? userFlashcards
      : sourceFilter === "due"
        ? getDueCards(userFlashcards)
      : userFlashcards.filter((card) =>
          sourceFilter === "manual" ? (card.source || "manual") === "manual" : card.source === "pptx"
        );
  const currentContentData = Array.isArray(currentModule?.contentData) ? currentModule.contentData : [];
  const bodyEmpty = !(currentModule?.body || "").trim();
  const showChapterEmpty = currentContentData.length === 0 && bodyEmpty;
  const fontScale = FONT_STEPS[fontStep];
  const contentLineHeight = comfortable ? 1.75 : 1.55;
  const totalVisible = visibleChapters.length;
  const completedCount = [...completedIds].filter((id) => visibleChapters.some((ch) => ch.id === id)).length;
  const masteryPct = useMemo(() => masteryPercent(c.flashcards || []), [c.flashcards]);

  const chNum = (id) => {
    const i = chapters.findIndex((x) => x.id === id);
    return `CH·${String(i + 1).padStart(2, "0")}`;
  };

  useEffect(() => {
    const mod = currentModule;
    const tag = mod ? chNum(mod.id) : "";
    setBreadcrumb([c.name.toUpperCase(), (c.subtitle || "USER COURSE").toUpperCase(), tag]);
  }, [c.name, c.subtitle, currentModule, setBreadcrumb]);

  useEffect(() => {
    setStatusBar({
      left: ["●", c.name, `${completedCount}/${totalVisible}`, currentModule?.label ?? ""],
      right: ["USER", "LOCAL"],
    });
  }, [c.name, completedCount, totalVisible, currentModule, setStatusBar]);

  const updateModuleBody = (text) => {
    const cur = ensureUserCourse(courseRef.current);
    const modules = cur.modules.map((m) => (m.id === active ? { ...m, body: text } : m));
    onChangeCourse({
      ...cur,
      modules,
      disabledModuleIds: [...disabledIds],
      completedModuleIds: [...completedIds],
      activeModuleId: active,
    });
  };

  const toggleModuleDisabled = (id) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      const isDisabled = next.has(id);
      const enabledCount = chapters.length - prev.size;
      if (isDisabled) next.delete(id);
      else {
        if (enabledCount <= 1) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const addModule = () => {
    const cur = ensureUserCourse(courseRef.current);
    const n = cur.modules.length + 1;
    const mid = uid("m");
    const modules = [...cur.modules, { id: mid, label: "Notes " + n, title: "Section " + n, body: "" }];
    setActive(mid);
    onChangeCourse({
      ...cur,
      modules,
      activeModuleId: mid,
      disabledModuleIds: [...disabledIds],
      completedModuleIds: [...completedIds],
    });
  };

  const renameModule = (id, field, value) => {
    const cur = ensureUserCourse(courseRef.current);
    const modules = cur.modules.map((m) => (m.id === id ? { ...m, [field]: value } : m));
    onChangeCourse({
      ...cur,
      modules,
      disabledModuleIds: [...disabledIds],
      completedModuleIds: [...completedIds],
      activeModuleId: active,
    });
  };

  const removeModule = (id) => {
    const cur = ensureUserCourse(courseRef.current);
    if (cur.modules.length <= 1) return;
    const modules = cur.modules.filter((m) => m.id !== id);
    let nextActive = active;
    if (id === active) nextActive = modules[0].id;
    setDisabledIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setActive(nextActive);
    setActiveItem(`module:${nextActive}`);
    onChangeCourse({
      ...cur,
      modules,
      activeModuleId: nextActive,
      disabledModuleIds: [...disabledIds].filter((x) => x !== id),
      completedModuleIds: [...completedIds].filter((x) => x !== id),
    });
  };

  const markComplete = useCallback(() => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(active)) next.delete(active);
      else next.add(active);
      return next;
    });
  }, [active]);

  useEffect(() => {
    const onMark = () => markComplete();
    window.addEventListener("studyhub-mark-chapter-reviewed", onMark);
    return () => window.removeEventListener("studyhub-mark-chapter-reviewed", onMark);
  }, [markComplete]);

  const goChapter = useCallback(
    (delta) => {
      const list = filteredChapters;
      if (!list.length) return;
      let i = list.findIndex((ch) => ch.id === active);
      if (i < 0) i = 0;
      const ni = (i + delta + list.length) % list.length;
      setActive(list[ni].id);
      setActiveItem(`module:${list[ni].id}`);
    },
    [filteredChapters, active]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (activeItem === "qz-deck") return;
      if (e.key === "ArrowLeft") goChapter(-1);
      if (e.key === "ArrowRight") goChapter(1);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        markComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeItem, goChapter, markComplete]);

  const handleImportFile = useCallback(() => {
    void runChapterExpressImport();
  }, [runChapterExpressImport]);

  const handleSaveCards = useCallback(
    (updatedCards) => {
      const nextCards = (updatedCards || []).map((card) => ({
        ...card,
        source: card.source || "manual",
        moduleId: card.moduleId || active,
        addedAt: card.addedAt || new Date().toISOString(),
      }));
      sessionCardsRef.current = nextCards;
      window.studyHub?.db?.flashcards
        ?.saveMany({
          courseUuid: course?.uuid || course?.id,
          moduleUuid: null,
          cards: nextCards,
        })
        .catch((err) => console.warn("[CARDS] Save:", err));
    },
    [active, course?.uuid, course?.id]
  );

  useEffect(() => {
    if (activeItem !== "qz-deck") return undefined;
    return () => {
      if (!sessionCardsRef.current) return;
      const cur = ensureUserCourse(courseRef.current);
      onChangeCourse({
        ...cur,
        flashcards: sessionCardsRef.current,
        disabledModuleIds: [...disabledIds],
        completedModuleIds: [...completedIds],
        activeModuleId: active,
      });
      sessionCardsRef.current = null;
    };
  }, [activeItem, active, completedIds, disabledIds, onChangeCourse]);

  function renderContentData(contentData) {
    if (!contentData || contentData.length === 0) {
      return (
        <div className="sh-chapter-empty">
          <pre className="sh-empty-ascii">{`┌─────────────────────┐
│   NO CONTENT YET    │
│                     │
│   DROP A FILE  →    │
│   OR WRITE NOTES    │
└─────────────────────┘`}</pre>
          <div className="sh-empty-actions">
            <button className="sh-btn-ghost sh-btn-ghost-amber" onClick={handleImportFile}>
              + IMPORT FILE
            </button>
            <button className="sh-btn-ghost" onClick={() => setMainTab("notes")}>
              ✎ WRITE NOTES
            </button>
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
                <DefinitionCard key={item.id} item={item} />
              ))}
            </div>
          );
        }
        if (low.length > 0) lowItems.push(...low);
        return;
      }

      if (section.type === "section") {
        highMedItems.push(<SectionBlock key={i} section={section} />);
        return;
      }

      if (section.type === "formulas") {
        highMedItems.push(
          <div key={i} className="sh-content-section">
            <div className="sh-section-label">{section.title}</div>
            {section.items.map((item, j) => (
              <div key={j} className="def-card sh-formula-block">
                <div className="def-term" style={{ fontFamily: "monospace" }}>
                  {item.formula}
                </div>
                {item.context ? <div className="def-body">{item.context}</div> : null}
              </div>
            ))}
          </div>
        );
      }
    });

    return (
      <>
        {highMedItems}
        {lowItems.length > 0 ? <NeedsReviewSection items={lowItems} /> : null}
      </>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .sh-sidebar, .sh-ctx, .sh-topbar, .sh-statusbar { display: none !important; }
        }
      `}</style>
      <div className="sh-workspace sh-workspace--cyan sh-app-usercourse">
        <aside className={`sh-sidebar sh-scroll-hover ${sidebarCollapsed ? "collapsed" : ""}`}>
          {shellSkelVis ? (
            <CourseSidebarSkeleton />
          ) : (
            <CourseSidebar
              course={c}
              activeItem={activeItem}
              onRenameCourse={handleRenameCourse}
              onRenameModule={handleRenameModule}
              onActiveChange={(nextActiveItem) => {
                setActiveItem(nextActiveItem);
                if (nextActiveItem.startsWith("module:")) {
                  const moduleId = nextActiveItem.replace("module:", "");
                  setActive(moduleId);
                  setMainTab("content");
                }
                if (nextActiveItem === "qz-deck") setMainTab("content");
              }}
            />
          )}
        </aside>

        <main className="sh-main">
          <CourseContentArea
            course={c}
            currentModule={currentModule}
            mainTab={mainTab}
            onTabChange={setMainTab}
            onChangeCourse={onChangeCourse}
            courseGlossaryTerms={courseGlossaryTerms}
            notesStatus={() => {}}
            onImportFile={handleImportFile}
            activeItem={activeItem}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            onSaveCards={handleSaveCards}
            flashcardEditTriggerRef={flashcardEditTriggerRef}
            reviewMeta={reviewMeta}
            enhancing={enhancing}
            onEnhanceReview={handleEnhanceReview}
            onMoveReviewToContent={moveReviewToContent}
            onUpdateModuleBody={updateModuleBody}
            onRemoveGlossaryTerm={removeGlossaryTerm}
            onSaveGradeComponents={async (components) => {
              const courseUuid = c.uuid || c.id;
              const existing = await window.studyHub?.db?.grades?.getComponents(courseUuid);
              await window.studyHub?.db?.grades?.saveComponents({
                courseUuid,
                components: components.map((component) => ({
                  name: component.name,
                  weight: component.weight,
                  category: component.category || "other",
                })),
              });
              const refreshed = await window.studyHub?.db?.grades?.getComponents(courseUuid);
              const mapByKey = new Map(
                refreshed.map((row) => [`${String(row.name).toLowerCase()}|${row.position}`, row.id])
              );
              const priorMap = new Map(
                (existing || []).map((row) => [`${String(row.name).toLowerCase()}|${row.position}`, row.id])
              );
              await Promise.all(
                components.map(async (component, index) => {
                  if (component.score === null || component.score === undefined) return;
                  const key = `${String(component.name).toLowerCase()}|${index}`;
                  const componentId = mapByKey.get(key) || priorMap.get(key) || component.id;
                  if (!componentId) return;
                  await window.studyHub?.db?.grades?.upsertEntry({
                    courseUuid,
                    componentId,
                    score: component.score,
                    label: component.label || null,
                  });
                })
              );
              setHasGrades(Array.isArray(components) && components.length > 0);
            }}
            onUpdateContentData={handleUpdateContentData}
          />
        </main>

        <aside className={`sh-ctx sh-scroll-hover ${ctxCollapsed ? "collapsed" : ""}`}>
          <div className="sh-ctx-scroll sh-scroll-hover">
            <CourseContextPanel
              course={c}
              currentModule={currentModule}
              activeItem={activeItem}
              sourceFilter={sourceFilter}
              onSourceFilterChange={setSourceFilter}
              masteryPct={masteryPct}
              dueCount={dueCount}
              onAddModule={addModule}
              onDeleteModule={(moduleId) => {
                if (!moduleId || c.modules.length <= 1) return;
                if (window.confirm(`Delete module "${currentModule?.title}"?`)) removeModule(moduleId);
              }}
              onDeleteCourse={() => {
                if (window.confirm("Delete this entire course and all notes?")) onDeleteCourse(c.uuid || c.id);
              }}
              onHideSidebar={() => setSidebarCollapsed((v) => !v)}
              onHidePanel={() => setCtxCollapsed((v) => !v)}
              onTabChange={setMainTab}
              hasGrades={hasGrades}
              onEditCard={() => flashcardEditTriggerRef.current?.()}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
