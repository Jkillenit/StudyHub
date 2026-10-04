import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendMaterialPaths, ensureUserCourse, uid } from "./userCourseModel.js";
import { useShell } from "../shell/ShellContext.jsx";
import { NovaBar } from "../shell/NovaBar.jsx";
import { usePptxImport } from "../pptx/usePptxImport.js";
import { buildOutput } from "../pptx/pptxOutputBuilder.js";
import { classifySlides, textToSlides } from "../pptx/pptxClassifier.js";
import CourseContentArea, { COURSE_VIEWS } from "./components/CourseContentArea.jsx";
import CourseHeader from "./components/CourseHeader.jsx";
import InlineEdit from "./components/InlineEdit.jsx";
import { userCourseNav } from "./courseNav.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";
import { hasApiKey } from "../ai/apiKeyUtils.js";
import { enhanceWithClaude } from "../ai/pptxEnhancer.js";
import { mergeEnhancedOutput } from "../ai/mergeEnhancedOutput.js";
import { getDueCards, masteryPercent } from "../study/sm2.js";
import {
  addTermsToGlossary,
  applyOutputToCourse,
  buildChapterContent,
  cleanupEmptyDefaultModules,
  mergeFlashcards,
} from "../features/import/courseBuilders.js";
import { bodyToHtml, htmlToPlainText, plainTextToHtml } from "../lib/notesBody.js";
import { useCourseMirror } from "../features/mirror/useCourseMirror.js";
import { takePendingCourseView } from "../features/today/courseView.js";
import { isTypingTarget } from "../lib/hotkeys.js";

const norm = (v) => String(v || "").toLowerCase().trim();
const pad2 = (n) => String(n).padStart(2, "0");

const TABS = [
  { id: "content", label: "Content" },
  { id: "notes", label: "Notes" },
  { id: "glossary", label: "Glossary" },
  { id: "grades", label: "Grades" },
];

export function UserCourseApp({ course, onChangeCourse, onDeleteCourse, novaCourses, onGoHub }) {
  const { setBreadcrumb, setCourseNav } = useShell();
  const courseRef = useRef(course);
  courseRef.current = course;
  const mountedRef = useRef(true);
  const flashcardAddTriggerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const [renamingCourse, setRenamingCourse] = useState(false);
  const [mainTab, setMainTab] = useState("content");
  const [hasGrades, setHasGrades] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const c = useMemo(() => ensureUserCourse(course), [course]);
  const [active, setActive] = useState(c.activeModuleId);
  const [activeItem, setActiveItem] = useState(`module:${c.activeModuleId}`);
  const { importPptx, error: pptxError, reset: resetPptx } = usePptxImport();
  const { badges: mirrorBadges, exams, examFor } = useCourseMirror(c.uuid || c.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg, ms = 3500) => {
    setToastMsg(String(msg || ""));
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setToastMsg("");
    }, ms);
  }, []);

  /** Apply a change on top of the latest course; the ref keeps back-to-back updates from clobbering each other. */
  const update = useCallback(
    (fnOrPatch) => {
      const cur = ensureUserCourse(courseRef.current);
      const next = typeof fnOrPatch === "function" ? fnOrPatch(cur) : { ...cur, ...fnOrPatch };
      if (!next) return;
      courseRef.current = next;
      onChangeCourse(next);
    },
    [onChangeCourse]
  );

  useEffect(() => {
    const ec = ensureUserCourse(course);
    setActive(ec.activeModuleId);
    setActiveItem(`module:${ec.activeModuleId}`);
    setMainTab("content");
    setRenamingCourse(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  const selectModule = useCallback(
    (moduleId) => {
      setActive(moduleId);
      setActiveItem(`module:${moduleId}`);
      setMainTab("content");
      if (courseRef.current?.activeModuleId !== moduleId) update({ activeModuleId: moduleId });
    },
    [update]
  );

  useEffect(() => {
    const uuid = course?.uuid || course?.id;
    if (!uuid) return undefined;
    const load = () =>
      courseStore
        .getGradeComponents(uuid)
        .then((rows) => setHasGrades(Array.isArray(rows) && rows.length > 0))
        .catch(() => setHasGrades(false));
    const onSynced = (e) => {
      if (e.detail?.courseUuid === uuid) load();
    };
    load();
    window.addEventListener("studyhub-bb-synced", onSynced);
    return () => window.removeEventListener("studyhub-bb-synced", onSynced);
  }, [course?.uuid, course?.id]);

  const reviewMeta = (c.pptxReviewBlocks || {})[active] || null;

  useEffect(() => {
    const onNav = (e) => {
      const d = e.detail;
      if (d?.courseId === course.id && d?.chapterId) selectModule(d.chapterId);
    };
    const onTermNav = (e) => {
      const d = e.detail;
      if (d?.courseId !== course.id) return;
      takePendingCourseView(course.id);
      if (d?.item === "qz-deck") {
        if (d.moduleId && (courseRef.current?.modules || []).some((m) => m.id === d.moduleId)) selectModule(d.moduleId);
        if (d.deckMode) setSourceFilter(d.deckMode);
        setActiveItem("qz-deck");
        setMainTab("content");
        return;
      }
      if (typeof d?.item === "string" && d.item.startsWith("course-")) {
        setActiveItem(d.item);
        setMainTab("content");
        return;
      }
      if (d?.moduleId) selectModule(d.moduleId);
      setMainTab(d?.tab || "content");
    };
    const pending = takePendingCourseView(course.id);
    if (pending) onTermNav({ detail: pending });
    window.addEventListener("studyhub-navigate-chapter", onNav);
    window.addEventListener("studyhub-open-content-tab", onTermNav);
    return () => {
      window.removeEventListener("studyhub-navigate-chapter", onNav);
      window.removeEventListener("studyhub-open-content-tab", onTermNav);
    };
  }, [course.id, selectModule]);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem("studyhub.pendingToast");
      if (msg) {
        sessionStorage.removeItem("studyhub.pendingToast");
        showToast(msg, 4500);
      }
    } catch {
      /* ignore */
    }
  }, [course.id, showToast]);

  const removeGlossaryTerm = useCallback(
    (termId) => update((cur) => ({ ...cur, glossary: (cur.glossary || []).filter((g) => g.id !== termId) })),
    [update]
  );

  const renameCourse = useCallback((name) => update({ name }), [update]);
  const renameModule = useCallback(
    (moduleId, title) => update((cur) => ({ ...cur, modules: cur.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)) })),
    [update]
  );

  const updateContentData = useCallback(
    (newData) =>
      update((cur) => ({
        ...cur,
        modules: cur.modules.map((m) => (m.id === active ? { ...m, contentData: newData } : m)),
      })),
    [active, update]
  );

  const updateModuleBody = useCallback(
    (html, moduleId = active) =>
      update((cur) => ({ ...cur, modules: cur.modules.map((m) => (m.id === moduleId ? { ...m, body: html } : m)) })),
    [active, update]
  );

  const setReviewBlock = (cur, moduleId, block) => {
    const blocks = { ...(cur.pptxReviewBlocks || {}) };
    if (block) blocks[moduleId] = block;
    else delete blocks[moduleId];
    return blocks;
  };

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
      const p = paths?.[0];
      if (!p || typeof p !== "string") return;
      const targetModuleId = active;
      const ext = (p.split(".").pop() || "").toLowerCase();

      if (ext !== "pptx") {
        update((cur) => appendMaterialPaths(cur, [p]));
        showToast("File attached to Materials.");
        return;
      }

      showToast("IMPORTING…", 60000);
      const output = await importPptx(p, targetModuleId);
      if (!output) {
        showToast(`IMPORT FAILED\n${pptxError || "Could not parse this PPTX file."}`, 5000);
        return;
      }
      update((cur) => {
        let next = applyOutputToCourse(appendMaterialPaths(cur, [p]), targetModuleId, output);
        const pptxTitle = String(output?.pptxMeta?.firstSlideTitle || "").trim();
        const meaningful = pptxTitle.length > 3 && pptxTitle.length < 120 && !/^slide\s*\d+$/i.test(pptxTitle);
        next = {
          ...next,
          modules: cleanupEmptyDefaultModules(
            next.modules.map((m) => (m.id === targetModuleId && meaningful ? { ...m, title: pptxTitle } : m)),
            targetModuleId
          ),
          pptxReviewBlocks: setReviewBlock(
            next,
            targetModuleId,
            output.notesReviewBlock ? { slideCount: output.notesReviewBlock.slideCount, text: output.notesReviewBlock.text } : null
          ),
          activeModuleId: targetModuleId,
        };
        return next;
      });
      if (output.notesReviewBlock) setMainTab("notes");
      showToast(
        `IMPORT COMPLETE\n✓ ${output.stats.cards} cards  ✓ ${output.flashcards.length} flashcards${
          output.stats.unclassified ? `\n↻ ${output.stats.unclassified} slides need review` : ""
        }`,
        4500
      );
    } catch {
      showToast("IMPORT FAILED\nUnexpected error during import.", 5000);
    } finally {
      resetPptx();
    }
  }, [active, importPptx, pptxError, resetPptx, showToast, update]);

  const moveReviewToContent = useCallback(() => {
    const cur = ensureUserCourse(courseRef.current);
    const activeModule = cur.modules.find((m) => m.id === active);
    const sourceText = htmlToPlainText(activeModule?.body || reviewMeta?.text || "").trim();
    if (!sourceText) return;
    const output = buildOutput(classifySlides(textToSlides(sourceText, activeModule?.title || "Notes Review")));
    const contentData = buildChapterContent(output);
    if (!contentData.length) {
      showToast("No definitions or sections detected in these notes.");
      return;
    }
    update((latest) => {
      const modules = latest.modules.map((m) =>
        m.id === active
          ? {
              ...m,
              contentData: [...(m.contentData || []), ...contentData],
              body: plainTextToHtml(output.notesReviewBlock?.text || ""),
            }
          : m
      );
      let next = {
        ...latest,
        modules,
        pptxReviewBlocks: setReviewBlock(
          latest,
          active,
          output.notesReviewBlock?.text ? { slideCount: output.notesReviewBlock.slideCount, text: output.notesReviewBlock.text } : null
        ),
        flashcards: mergeFlashcards(latest.flashcards, output.flashcards, active),
      };
      next = addTermsToGlossary(next, active, output.contentCards || []);
      return next;
    });
    showToast(`CONTENT UPDATED · ${output.contentCards.length} cards added`);
  }, [active, reviewMeta, showToast, update]);

  const handleEnhanceReview = useCallback(async () => {
    const cur = ensureUserCourse(courseRef.current);
    const module = cur.modules.find((m) => m.id === active);
    if (!module) return;
    if (!(await hasApiKey())) {
      showToast("Add API key in Settings to use AI enhancement");
      return;
    }
    setEnhancing(true);
    try {
      const contentCards = (module.contentData || [])
        .filter((s) => s.type === "definitions")
        .flatMap((s) => s.items || [])
        .filter((i) => i?.term && i?.definition)
        .map((i) => ({ id: i.id || uid("pptx"), term: i.term, definition: i.definition, confidence: i.confidence || "high" }));
      const currentOutput = { contentCards, notesReviewBlock: { html: bodyToHtml(module.body) }, flashcards: [] };
      const aiResult = await enhanceWithClaude(currentOutput);
      if (!aiResult) {
        showToast("No AI changes were returned", 2500);
        return;
      }
      const merged = mergeEnhancedOutput(currentOutput, aiResult);
      const byTerm = new Map(merged.contentCards.map((card) => [norm(card.term), card]));
      update((latest) => {
        const existing = new Set();
        const modules = latest.modules.map((m) => {
          if (m.id !== module.id) return m;
          const contentData = (m.contentData || []).map((s) =>
            s.type !== "definitions"
              ? s
              : {
                  ...s,
                  items: (s.items || []).map((item) => {
                    existing.add(norm(item.term));
                    const e = byTerm.get(norm(item.term));
                    return e?.enhancedByAI
                      ? { ...item, definition: e.definition, confidence: e.confidence, enhancedByAI: true }
                      : item;
                  }),
                }
          );
          const fresh = merged.contentCards.filter((card) => !existing.has(norm(card.term)));
          if (fresh.length) contentData.push(...buildChapterContent({ contentCards: fresh }));
          return { ...m, contentData };
        });
        const freshCards = merged.contentCards.filter((card) => card.enhancedByAI);
        let next = { ...latest, modules, flashcards: mergeFlashcards(latest.flashcards, merged.flashcards, module.id) };
        next = addTermsToGlossary(next, module.id, freshCards);
        return next;
      });
      showToast(`AI enhanced ${aiResult.definitions?.length || 0} terms, found ${aiResult.newDefinitions?.length || 0} new`);
    } finally {
      if (mountedRef.current) setEnhancing(false);
    }
  }, [active, showToast, update]);

  const disabledIds = useMemo(() => new Set(c.disabledModuleIds || []), [c.disabledModuleIds]);
  const completedIds = useMemo(() => new Set(c.completedModuleIds || []), [c.completedModuleIds]);
  const visibleChapters = useMemo(() => c.modules.filter((m) => !disabledIds.has(m.id)), [c.modules, disabledIds]);

  useEffect(() => {
    if (visibleChapters.length && !visibleChapters.some((ch) => ch.id === active)) selectModule(visibleChapters[0].id);
  }, [visibleChapters, active, selectModule]);

  const currentModule = useMemo(() => c.modules.find((m) => m.id === active), [c.modules, active]);
  const courseGlossaryTerms = useMemo(
    () => (c.glossary || []).filter((g) => g.confidence !== "low").map((g) => ({ term: g.term, definition: g.definition })),
    [c.glossary]
  );
  const dueCount = useMemo(() => getDueCards(c.flashcards || [], { examFor }).length, [c.flashcards, examFor]);
  const masteryPct = useMemo(() => masteryPercent(c.flashcards || []), [c.flashcards]);
  const chNum = (id) => `CH·${String(c.modules.findIndex((x) => x.id === id) + 1).padStart(2, "0")}`;

  useEffect(() => {
    setBreadcrumb([c.name.toUpperCase(), (c.courseCode || c.subtitle || "USER COURSE").toUpperCase(), currentModule ? chNum(currentModule.id) : ""]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.name, c.subtitle, c.courseCode, currentModule, setBreadcrumb]);

  const selectModuleRef = useRef(selectModule);
  selectModuleRef.current = selectModule;
  const selectNav = useCallback((nextActiveItem) => {
    if (nextActiveItem.startsWith("module:")) {
      selectModuleRef.current(nextActiveItem.slice("module:".length));
    } else {
      setActiveItem(nextActiveItem);
      setMainTab("content");
    }
  }, []);

  const navGroups = useMemo(
    () =>
      userCourseNav(c, {
        completedIds: [...completedIds],
        badges: {
          "qz-deck": dueCount || null,
          "course-assignments": mirrorBadges.dueSoon ? `${mirrorBadges.dueSoon} DUE` : null,
          "course-announcements": mirrorBadges.unread ? `${mirrorBadges.unread} NEW` : null,
        },
      }),
    [c, completedIds, dueCount, mirrorBadges.dueSoon, mirrorBadges.unread]
  );

  useEffect(() => {
    setCourseNav({ courseId: course.id, groups: navGroups, activeId: activeItem, onSelect: selectNav });
  }, [course.id, navGroups, activeItem, selectNav, setCourseNav]);

  useEffect(() => () => setCourseNav(null), [setCourseNav]);

  const addModule = () => {
    const mid = uid("m");
    update((cur) => ({
      ...cur,
      modules: [...cur.modules, { id: mid, label: `Notes ${cur.modules.length + 1}`, title: `Section ${cur.modules.length + 1}`, body: "" }],
      activeModuleId: mid,
    }));
    selectModule(mid);
  };

  const removeModule = (id) => {
    const cur = ensureUserCourse(courseRef.current);
    if (cur.modules.length <= 1) return;
    const modules = cur.modules.filter((m) => m.id !== id);
    const nextActive = id === active ? modules[0].id : active;
    update({
      modules,
      activeModuleId: nextActive,
      disabledModuleIds: (cur.disabledModuleIds || []).filter((x) => x !== id),
      completedModuleIds: (cur.completedModuleIds || []).filter((x) => x !== id),
    });
    selectModule(nextActive);
  };

  const markComplete = useCallback(() => {
    update((cur) => {
      const set = new Set(cur.completedModuleIds || []);
      if (set.has(active)) set.delete(active);
      else set.add(active);
      return { ...cur, completedModuleIds: [...set] };
    });
  }, [active, update]);

  useEffect(() => {
    const onMark = () => markComplete();
    window.addEventListener("studyhub-mark-chapter-reviewed", onMark);
    return () => window.removeEventListener("studyhub-mark-chapter-reviewed", onMark);
  }, [markComplete]);

  const goChapter = useCallback(
    (delta) => {
      if (!visibleChapters.length) return;
      let i = visibleChapters.findIndex((ch) => ch.id === active);
      if (i < 0) i = 0;
      selectModule(visibleChapters[(i + delta + visibleChapters.length) % visibleChapters.length].id);
    },
    [visibleChapters, active, selectModule]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (document.querySelector('.sh-palette, .sh-cmd-palette, [data-palette="true"]')) return;
      if (document.documentElement.dataset.session != null) return;
      if (!activeItem?.startsWith("module:")) return;
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

  const handleImportFile = useCallback(() => void runChapterExpressImport(), [runChapterExpressImport]);

  const handleSaveCards = useCallback(
    (updatedCards) =>
      update((cur) => ({
        ...cur,
        flashcards: (updatedCards || []).map((card) => ({
          ...card,
          source: card.source || "manual",
          addedAt: card.addedAt || new Date().toISOString(),
        })),
      })),
    [update]
  );

  const onDeck = activeItem === "qz-deck";
  const isCourseView = !!COURSE_VIEWS[activeItem];
  const moduleIndex = visibleChapters.findIndex((m) => m.id === active);
  const materialCount = (c.materialPaths || []).length;
  const prompt = onDeck
    ? "Message Nova about these cards…"
    : currentModule && !isCourseView
      ? `Message Nova about ${currentModule.label}…`
      : undefined;

  const menu = [
    { label: "Rename course", onClick: () => setRenamingCourse(true) },
    { label: "Add module", onClick: addModule },
    {
      label: "Delete module",
      disabled: !currentModule || c.modules.length <= 1,
      onClick: () => {
        if (!currentModule || c.modules.length <= 1) return;
        if (window.confirm(`Delete module "${currentModule?.title}"?`)) removeModule(currentModule.id);
      },
    },
    ...(hasGrades
      ? []
      : [
          {
            label: "Set up grades",
            onClick: () => {
              selectModule(active);
              setMainTab("grades");
            },
          },
        ]),
    ...(onDeck ? [{ label: "Add card", onClick: () => flashcardAddTriggerRef.current?.() }] : []),
    ...(materialCount ? [{ label: `Materials · ${materialCount} file${materialCount === 1 ? "" : "s"}`, disabled: true }] : []),
    { divider: true },
    {
      label: "Delete course",
      danger: true,
      onClick: () => {
        if (window.confirm("Delete this entire course and all notes?")) onDeleteCourse(c.uuid || c.id);
      },
    },
  ];

  return (
    <>
      <style>{`
        @media print {
          .sh-rail, .sh-plan-dock, .sh-topbar, .sh-statusbar { display: none !important; }
        }
      `}</style>
      <div className="sh-plan sh-course sh-app-usercourse">
        <div className="sh-plan-col">
          {isCourseView ? null : (
            <CourseHeader
              crumb={[
                renamingCourse ? (
                  <InlineEdit
                    startEditing
                    value={c.name}
                    className="sh-course-crumb-edit"
                    onSave={renameCourse}
                    onDone={() => setRenamingCourse(false)}
                  />
                ) : (
                  shortCourse(c.courseCode || c.name) || c.name
                ),
                currentModule ? `${pad2(moduleIndex + 1)} ${currentModule.label}` : "",
              ]}
              title={onDeck ? "Flashcards" : undefined}
              titleNode={
                onDeck || !currentModule ? undefined : (
                  <InlineEdit
                    key={currentModule.id}
                    value={currentModule.title || currentModule.label || ""}
                    className="sh-course-title-edit"
                    onSave={(title) => renameModule(currentModule.id, title)}
                  />
                )
              }
              tabs={onDeck ? [] : TABS}
              activeTab={mainTab}
              onTab={setMainTab}
              masteryPct={masteryPct}
              menu={menu}
            />
          )}
          <CourseContentArea
            course={c}
            currentModule={currentModule}
            mainTab={mainTab}
            onTabChange={setMainTab}
            courseGlossaryTerms={courseGlossaryTerms}
            onImportFile={handleImportFile}
            activeItem={activeItem}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            dueCount={dueCount}
            exams={exams}
            examFor={examFor}
            onSaveCards={handleSaveCards}
            flashcardAddTriggerRef={flashcardAddTriggerRef}
            onGoHub={onGoHub}
            reviewMeta={reviewMeta}
            enhancing={enhancing}
            onEnhanceReview={handleEnhanceReview}
            onMoveReviewToContent={moveReviewToContent}
            onUpdateModuleBody={updateModuleBody}
            onRemoveGlossaryTerm={removeGlossaryTerm}
            onGradesChange={(count) => setHasGrades(count > 0)}
            onUpdateContentData={updateContentData}
          />
        </div>
        <div className="sh-plan-dock">
          <NovaBar courses={novaCourses} placeholder={prompt} />
        </div>
        {toastMsg ? (
          <div className="sh-toast" role="status" style={{ whiteSpace: "pre-line" }}>
            {toastMsg}
          </div>
        ) : null}
      </div>
    </>
  );
}
