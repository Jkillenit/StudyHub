import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterContentSkeleton } from "../om300/ChapterContentSkeleton.jsx";
import { CourseSidebarSkeleton } from "../om300/CourseSidebarSkeleton.jsx";
import { useDelayedSkeletonVisible } from "../hooks/useDelayedSkeletonVisible.js";
import { FONT_STEPS } from "../constants/fontSteps.js";
import { loadJson, saveJson, STORAGE } from "../lib/storage.js";
import { appendMaterialPaths, ensureUserCourse, uid } from "./userCourseModel.js";
import { useShell } from "../shell/ShellContext.jsx";
import { usePptxImport } from "../pptx/usePptxImport.js";
import { buildOutput } from "../pptx/pptxOutputBuilder.js";
import { classifySlides, textToSlides } from "../pptx/pptxClassifier.js";
import { UserCourseTipTapNotesEditor } from "./UserCourseTipTapNotesEditor.jsx";
import Om300Flashcards from "../om300/flashcards/Om300Flashcards.jsx";
import { hasApiKey } from "../ai/apiKeyUtils.js";
import { enhanceWithClaude } from "../ai/pptxEnhancer.js";
import { mergeEnhancedOutput } from "../ai/mergeEnhancedOutput.js";

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

  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ctxCollapsed, setCtxCollapsed] = useState(false);
  const [mainTab, setMainTab] = useState("content");
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
        window.setTimeout(() => setToastMsg(""), 4500);
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
      window.setTimeout(() => setToastMsg(""), 4500);
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
      window.setTimeout(() => setToastMsg(""), 3000);
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
      window.setTimeout(() => setToastMsg(""), 3000);
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
        window.setTimeout(() => setToastMsg(""), 2500);
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
      window.setTimeout(() => setToastMsg(""), 3500);
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

  const currentModule = c.modules.find((m) => m.id === active);
  const courseGlossaryTerms = useMemo(
    () =>
      (c.glossary || [])
        .filter((g) => g.confidence !== "low")
        .map((g) => ({ term: g.term, definition: g.definition })),
    [c.glossary]
  );
  const userFlashcards = Array.isArray(c.flashcards) ? c.flashcards : [];
  const filteredFlashcards =
    sourceFilter === "all"
      ? userFlashcards
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
  const masteryPct = totalVisible ? Math.round((completedCount / totalVisible) * 100) : 0;

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

  useEffect(() => {
    console.log(
      "[CONTENT] activeModule contentData:",
      currentModule?.contentData?.length,
      currentModule?.contentData?.[0]
    );
  }, [currentModule]);

  const handleImportFile = useCallback(() => {
    void runChapterExpressImport();
  }, [runChapterExpressImport]);

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
            <>
              <div className="sh-sidebar-head">
                <div className="sh-sidebar-label">ACTIVE COURSE</div>
                <div className="sh-sidebar-course">{c.name}</div>
                <div className="sh-sidebar-meta mono">
                  {(c.subtitle || "NOTES").toUpperCase()} · {totalVisible} MODULES
                </div>
              </div>
              <div className="sh-sidebar-search">
                <span className="sh-sidebar-search-prefix" style={{ color: "var(--sh-cyan)" }} aria-hidden>
                  ›
                </span>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="FILTER" aria-label="Filter modules" />
              </div>
              <div className="sh-sidebar-scroll sh-scroll-hover">
                <div className="sh-sidebar-section-label">MODULES</div>
                {filteredChapters.length === 0 ? (
                  <pre className="sh-empty-ascii mono px-2">
                    {`┌─────────────────┐
│   NO CHAPTERS   │
│  ADD MODULE →   │
└─────────────────┘`}
                  </pre>
                ) : (
                  filteredChapters.map((ch) => {
                    const isAct = activeItem === `module:${ch.id}`;
                    const done = completedIds.has(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className={`ch-item ${isAct ? "active" : ""} ${done ? "ch-item--complete" : ""}`}
                        onClick={() => {
                          setActive(ch.id);
                          setActiveItem(`module:${ch.id}`);
                          setMainTab("content");
                        }}
                      >
                        <span className="ch-num">{chNum(ch.id)}</span>
                        <span className="ch-title">{ch.title}</span>
                      </button>
                    );
                  })
                )}
                <div className="ch-divider mono">DRILL</div>
                <button
                  type="button"
                  className={`ch-item ${activeItem === "qz-deck" ? "active" : ""}`}
                  onClick={() => {
                    setActiveItem("qz-deck");
                    setMainTab("content");
                  }}
                >
                  <span className="ch-num mono qz-prefix">QZ·01</span>
                  <span className="ch-title">Flashcard Deck</span>
                </button>
              </div>
            </>
          )}
        </aside>

        <main className="sh-main">
          <div className="sh-main-header">
            <div className="sh-title-row">
              <h1 className="sh-main-title">{activeItem === "qz-deck" ? "Flashcard Deck" : currentModule?.title || "Notes"}</h1>
              <span className="sh-ch-tag">{activeItem === "qz-deck" ? "QZ·01" : currentModule ? chNum(currentModule.id) : ""}</span>
            </div>
            <div className="sh-tab-row">
              <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "content" ? "active" : ""}`} onClick={() => setMainTab("content")}>
                CONTENT
              </button>
              <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "notes" ? "active" : ""}`} onClick={() => setMainTab("notes")}>
                NOTES
              </button>
              <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "glossary" ? "active" : ""}`} onClick={() => setMainTab("glossary")}>
                GLOSSARY
              </button>
            </div>
          </div>
          <div className="sh-main-body sh-scroll-hover position-relative">
            {toastMsg ? (
              <div
                className="mono position-absolute top-0 end-0 m-2 px-2 py-1"
                style={{
                  fontSize: 10,
                  color: "var(--sh-green)",
                  border: "1px solid var(--sh-green)",
                  background: "var(--sh-surface)",
                  zIndex: 2,
                  maxWidth: "min(320px, 90%)",
                }}
                role="status"
              >
                {toastMsg}
              </div>
            ) : null}
            {shellSkelVis ? (
              <ChapterContentSkeleton />
            ) : expressBusy ? (
              <div className={`sh-main-empty-wrap ${mainEnterClass}`}>
                <div className="sh-import-processing" aria-busy="true">
                  <div className="sh-import-filename">{expressLabel}</div>
                  <div className="sh-import-dots mono" aria-hidden>
                    <span className="sh-pulse">●</span> <span className="sh-pulse">●</span> <span className="sh-pulse">●</span>{" "}
                    <span>○</span> <span>○</span>
                  </div>
                  <div className="sh-import-label">{progress || "READING FILE..."}</div>
                </div>
              </div>
            ) : importError ? (
              <div className={`sh-main-empty-wrap ${mainEnterClass}`}>
                <pre className="sh-empty-ascii-box sh-import-error-box">{importError}</pre>
                <div className="sh-empty-actions">
                  <button type="button" className="sh-btn-ghost sh-btn-ghost-amber ctx-btn" onClick={() => void runChapterExpressImport()}>
                    TRY AGAIN
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`font-sans ${mainEnterClass}`}
                style={{
                  fontSize: `calc(15px * ${fontScale})`,
                  lineHeight: contentLineHeight,
                }}
              >
                {mainTab === "content" ? (
                  <>
                    <div className="ctx-label" style={{ marginBottom: 12 }}>
                      {activeItem === "qz-deck" ? "QZ DECK (LOCAL)" : "CONTENT (LOCAL)"}
                    </div>
                    {activeItem === "qz-deck" ? (
                      <div className="main-content">
                        <Om300Flashcards
                          key={`${c.id}-qz`}
                          cards={userFlashcards}
                          courseId={c.id}
                          showMasteryButtons={true}
                          sourceFilter={sourceFilter}
                          onSourceFilterChange={setSourceFilter}
                          onSaveCards={(updatedCards) => {
                            const cur = ensureUserCourse(courseRef.current);
                            onChangeCourse({
                              ...cur,
                              flashcards: (updatedCards || []).map((card) => ({
                                ...card,
                                source: card.source || "manual",
                                moduleId: card.moduleId || active,
                                addedAt: card.addedAt || new Date().toISOString(),
                              })),
                              disabledModuleIds: [...disabledIds],
                              completedModuleIds: [...completedIds],
                              activeModuleId: active,
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <div className="main-content">{renderContentData(currentModule?.contentData)}</div>
                    )}
                  </>
                ) : mainTab === "notes" ? (
                  <>
                    <div className="ctx-label" style={{ marginBottom: 12 }}>
                      NOTES (LOCAL)
                    </div>
                    {reviewMeta ? (
                      <div className="sh-review-banner">
                        <span>{`REVIEW NEEDED — ${reviewMeta.slideCount} slides could not be auto-classified. Edit below, then click MOVE TO CONTENT.`}</span>
                        <div className="d-flex gap-2 align-items-center">
                          <button
                            type="button"
                            className="sh-review-move-btn"
                            style={{ opacity: 0.7 }}
                            onClick={() => void handleEnhanceReview()}
                            disabled={enhancing}
                          >
                            {enhancing ? "ENHANCING..." : "✦ ENHANCE WITH AI"}
                          </button>
                          <button type="button" className="sh-review-move-btn" onClick={moveReviewToContent}>
                            MOVE TO CONTENT
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <UserCourseTipTapNotesEditor
                      key={currentModule?.id}
                      sectionId={currentModule?.id}
                      value={currentModule?.body || reviewMeta?.text || ""}
                      glossaryTerms={courseGlossaryTerms}
                      onAutosaveStatus={() => {}}
                      onChangeValue={updateModuleBody}
                    />
                  </>
                ) : (
                  <div className="main-content">{renderGlossary(c, currentModule?.id)}</div>
                )}
              </div>
            )}
          </div>
        </main>

        <aside className={`sh-ctx sh-scroll-hover ${ctxCollapsed ? "collapsed" : ""}`}>
          <div className="sh-ctx-scroll sh-scroll-hover">
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
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`sh-btn-ghost ${sourceFilter === opt.id ? "sh-btn-ghost--active" : ""}`}
                        style={{ width: "auto", marginBottom: 0, padding: "4px 8px", fontSize: 10 }}
                        onClick={() => setSourceFilter(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="mono mb-2" style={{ fontSize: 10, color: "var(--sh-text-dim)" }}>
                    {filteredFlashcards.length}/{userFlashcards.length} cards
                  </p>
                </>
              ) : null}
              {(c.materialPaths || []).length > 0 ? (
                <p className="mono mb-2" style={{ fontSize: 10, color: "var(--sh-text-dim)" }}>
                  MATERIALS · {(c.materialPaths || []).length} FILE(S)
                </p>
              ) : null}
              <button type="button" className="sh-btn-ghost sh-btn-ghost-cyan ctx-btn" onClick={addModule}>
                + MODULE
              </button>
              <button type="button" className="sh-btn-ghost sh-btn-ghost-cyan ctx-btn" onClick={() => setSettingsOpen((v) => !v)}>
                {settingsOpen ? "CLOSE SETTINGS" : "SETTINGS"}
              </button>
              <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={() => setSidebarCollapsed((v) => !v)}>
                {sidebarCollapsed ? "SHOW SIDEBAR" : "HIDE SIDEBAR"}
              </button>
              <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={() => setCtxCollapsed((v) => !v)}>
                {ctxCollapsed ? "SHOW PANEL" : "HIDE PANEL"}
              </button>
              <button
                type="button"
                className="sh-btn-ghost sh-btn-danger-ghost"
                disabled={c.modules.length <= 1}
                onClick={() => {
                  if (c.modules.length <= 1 || !currentModule) return;
                  if (window.confirm(`Delete module "${currentModule.title}"?`)) removeModule(currentModule.id);
                }}
              >
                DELETE MODULE
              </button>
              <button
                type="button"
                className="sh-btn-ghost sh-btn-danger-ghost"
                onClick={() => {
                  if (window.confirm("Delete this entire course and all notes?")) onDeleteCourse(c.id);
                }}
              >
                DELETE COURSE
              </button>
            </div>
            {settingsOpen ? (
              <div className="ctx-section border-0">
                <div className="ctx-label">ADD COURSE</div>
                <button
                  type="button"
                  className="sh-btn-ghost ctx-btn"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("studyhub-open-welcome"));
                  }}
                >
                  ADD NEW COURSE (WELCOME)
                </button>
                <div className="ctx-label mt-3">MODULE VISIBILITY</div>
                {chapters.map((ch) => {
                  const enabled = !disabledIds.has(ch.id);
                  const onlyOne = chapters.length - disabledIds.size <= 1 && enabled;
                  return (
                    <label key={ch.id} className="mono d-flex align-items-center gap-2 mb-1" style={{ fontSize: 10 }}>
                      <input type="checkbox" checked={enabled} disabled={onlyOne} onChange={() => toggleModuleDisabled(ch.id)} />
                      <span style={{ color: "var(--sh-text-secondary)" }}>
                        {ch.label} — {ch.title}
                      </span>
                    </label>
                  );
                })}
                <div className="ctx-label mt-3">ACTIVE LABELS</div>
                {currentModule && (
                  <div className="d-flex flex-column gap-2">
                    <input
                      className="sh-input mono"
                      value={currentModule.label}
                      onChange={(e) => renameModule(currentModule.id, "label", e.target.value)}
                      placeholder="TAB"
                    />
                    <input
                      className="sh-input mono"
                      value={currentModule.title}
                      onChange={(e) => renameModule(currentModule.id, "title", e.target.value)}
                      placeholder="TITLE"
                    />
                    <button type="button" className="sh-btn-ghost sh-btn-danger-ghost" onClick={() => removeModule(currentModule.id)} disabled={c.modules.length <= 1}>
                      REMOVE TAB
                    </button>
                  </div>
                )}
                <label className="mono d-flex align-items-center gap-2 mt-2 mb-2" style={{ fontSize: 10 }}>
                  <input type="checkbox" checked={comfortable} onChange={(e) => setComfortable(e.target.checked)} />
                  COMFORT SPACING
                </label>
                <div className="d-flex align-items-center gap-2 mono" style={{ fontSize: 10 }}>
                  <span className="sh-kv-key">TEXT</span>
                  <button type="button" className="sh-btn-ghost sh-btn-ghost-cyan" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep <= 0} onClick={() => setFontStep((s) => Math.max(0, s - 1))}>
                    A−
                  </button>
                  <button type="button" className="sh-btn-ghost sh-btn-ghost-cyan" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep >= FONT_STEPS.length - 1} onClick={() => setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1))}>
                    A+
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
