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

function getFirstSentence(text) {
  const match = String(text || "").match(/^[^.!?]+[.!?]/);
  return match ? match[0] : String(text || "");
}

function DefinitionCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const firstSentence = getFirstSentence(item.definition);
  const hasMore = String(item.definition || "").length > firstSentence.length + 2;
  const confidenceColor = {
    high: "var(--sh-green)",
    medium: "var(--sh-amber)",
    low: "var(--sh-text-dim)",
  }[item.confidence || "high"];

  return (
    <div className="def-card sh-pptx-card">
      <div className="def-card-header">
        <div className="def-term">{item.term}</div>
        <div
          className="sh-confidence-dot"
          style={{ background: confidenceColor }}
          title={`${item.confidence || "high"} confidence`}
        />
      </div>
      <div className="def-body">
        {firstSentence}
        {hasMore && !expanded ? (
          <span className="sh-expand-btn" onClick={() => setExpanded(true)}>
            {" "}more →
          </span>
        ) : null}
        {expanded ? (
          <span>
            {String(item.definition || "").slice(firstSentence.length)}
            <span className="sh-expand-btn" onClick={() => setExpanded(false)}>
              {" "}← less
            </span>
          </span>
        ) : null}
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
  const [apiConfigured, setApiConfigured] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const notesRef = useRef(null);
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
  }, [course.id]);

  useEffect(() => {
    setMainTab("content");
  }, [active]);

  useEffect(() => {
    const cur = ensureUserCourse(courseRef.current);
    const blocks = cur.pptxReviewBlocks || {};
    setReviewMeta(blocks[active] || null);
  }, [active, course.id]);

  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.ai?.getStatus) return;
    bridge.ai
      .getStatus()
      .then((s) => setApiConfigured(!!s?.configured))
      .catch(() => setApiConfigured(false));
  }, []);

  useEffect(() => {
    onActiveChapterChange?.(active);
  }, [active, onActiveChapterChange]);

  useEffect(() => {
    const onNav = (e) => {
      const d = e.detail;
      if (d?.courseId === course.id && d?.chapterId) {
        setActive(d.chapterId);
      }
    };
    window.addEventListener("studyhub-navigate-chapter", onNav);
    return () => window.removeEventListener("studyhub-navigate-chapter", onNav);
  }, [course.id]);

  useEffect(() => {
    const onTermNav = (e) => {
      const d = e.detail;
      if (d?.courseId !== course.id) return;
      if (d?.moduleId) setActive(d.moduleId);
      setMainTab("content");
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
          return { ...m, contentData: mergedContent, body };
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
        nextCourse = { ...nextCourse, modules, pptxReviewBlocks: blocks, flashcards };
        nextCourse = addTermsToGlossary(nextCourse, targetModuleId, output.contentCards || []);
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
    },
    [filteredChapters, active]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goChapter(-1);
      if (e.key === "ArrowRight") goChapter(1);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        markComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goChapter, markComplete]);

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

    return contentData.map((section, i) => {
      if (section.type === "definitions") {
        return (
          <div key={i} className="sh-content-section">
            <div className="sh-section-label">{section.title}</div>
            {section.items.map((item) => (
              <DefinitionCard key={item.id} item={item} />
            ))}
          </div>
        );
      }

      if (section.type === "section") {
        return (
          <div key={i} className="sh-content-section">
            <div className="sh-section-label">{section.title}</div>
            <div className="def-card">
              {section.items.map((item, j) => (
                <div key={j} className="def-body" style={{ marginBottom: 4 }}>
                  • {item}
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (section.type === "formulas") {
        return (
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

      return null;
    });
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
                    const isAct = active === ch.id;
                    const done = completedIds.has(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className={`ch-item ${isAct ? "active" : ""} ${done ? "ch-item--complete" : ""}`}
                        onClick={() => setActive(ch.id)}
                      >
                        <span className="ch-num">{chNum(ch.id)}</span>
                        <span className="ch-title">{ch.title}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </aside>

        <main className="sh-main">
          <div className="sh-main-header">
            <div className="sh-title-row">
              <h1 className="sh-main-title">{currentModule?.title || "Notes"}</h1>
              <span className="sh-ch-tag">{currentModule ? chNum(currentModule.id) : ""}</span>
            </div>
            <div className="sh-tab-row">
              <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "content" ? "active" : ""}`} onClick={() => setMainTab("content")}>
                CONTENT
              </button>
              <button type="button" className={`sh-tab sh-usercourse-tab ${mainTab === "notes" ? "active" : ""}`} onClick={() => setMainTab("notes")}>
                NOTES
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
                      CONTENT (LOCAL)
                    </div>
                    <div className="main-content">{renderContentData(currentModule?.contentData)}</div>
                  </>
                ) : (
                  <>
                    <div className="ctx-label" style={{ marginBottom: 12 }}>
                      NOTES (LOCAL)
                    </div>
                    {reviewMeta ? (
                      <div className="sh-review-banner">
                        <span>{`REVIEW NEEDED — ${reviewMeta.slideCount} slides could not be auto-classified. Edit below, then click MOVE TO CONTENT.`}</span>
                        <div className="d-flex gap-2 align-items-center">
                          {apiConfigured ? (
                            <button
                              type="button"
                              className="sh-review-move-btn"
                              style={{ opacity: 0.7 }}
                              onClick={() => {
                                setToastMsg("AI enhancement coming in Phase 1b-B");
                                window.setTimeout(() => setToastMsg(""), 3000);
                              }}
                            >
                              ✦ ENHANCE WITH AI
                            </button>
                          ) : null}
                          <button type="button" className="sh-review-move-btn" onClick={moveReviewToContent}>
                            MOVE TO CONTENT
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <textarea
                      ref={notesRef}
                      value={currentModule?.body || reviewMeta?.text || ""}
                      onChange={(e) => updateModuleBody(e.target.value)}
                      className="sh-input font-sans w-100"
                      placeholder="TYPE NOTES…"
                      style={{
                        minHeight: "55vh",
                        resize: "vertical",
                        border: "1px solid var(--sh-border)",
                        background: "var(--sh-base)",
                        color: "var(--sh-text-secondary)",
                        borderRadius: 2,
                        padding: 12,
                      }}
                    />
                  </>
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
              {userFlashcards.length > 0 ? (
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
