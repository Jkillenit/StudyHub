import { useCallback, useEffect, useState } from "react";
import { ShellProvider, useShell } from "../shell/ShellContext.jsx";
import { TitleBar } from "../components/TitleBar.jsx";
import { StatusBar } from "../shell/TilingChrome.jsx";
import { CommandPalette } from "../shell/CommandPalette.jsx";
import { Om300StudyApp } from "../om300/Om300StudyApp.jsx";
import { loadJson, saveJson } from "../lib/storage.js";
import { HUB_KEYS, ensureUserCourse, uid } from "../hub/userCourseModel.js";
import { UserCourseApp } from "../hub/UserCourseApp.jsx";
import { HubScreen } from "../hub/HubScreen.jsx";
import { AiAssistantPanel } from "../ai/AiAssistantPanel.jsx";
import { titleCaseFromFilename } from "../lib/filenameToCourseName.js";
import { EXPRESS_FILTERS } from "../welcome/ExpressImportModal.jsx";
import { buildContentText, buildOutput } from "../pptx/pptxOutputBuilder.js";
import { classifySlides, detectChapters } from "../pptx/pptxClassifier.js";
import { hasApiKey } from "../ai/apiKeyUtils.js";
import { enhanceWithClaude } from "../ai/pptxEnhancer.js";
import { mergeEnhancedOutput } from "../ai/mergeEnhancedOutput.js";

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

function ApiStatusSync() {
  const { setApiLive } = useShell();
  useEffect(() => {
    const b = typeof window !== "undefined" ? window.studyHub?.ai : null;
    if (!b?.getStatus) {
      setApiLive(false);
      return;
    }
    b.getStatus()
      .then((s) => setApiLive(!!s.configured))
      .catch(() => setApiLive(false));
  }, [setApiLive]);
  return null;
}

function StudyHubAppInner() {
  const { setBreadcrumb } = useShell();
  const [userCourses, setUserCourses] = useState(() => {
    const raw = loadJson(HUB_KEYS.userCourses, []);
    const list = Array.isArray(raw) ? raw.map(ensureUserCourse) : [];
    return list;
  });
  const [courseId, setCourseId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [courseShellLoad, setCourseShellLoad] = useState(false);
  const [paletteChapterMeta, setPaletteChapterMeta] = useState(() => ({ courseId: null, chapterId: null }));

  useEffect(() => {
    saveJson(HUB_KEYS.userCourses, userCourses);
  }, [userCourses]);

  useEffect(() => {
    if (courseId != null) {
      saveJson(HUB_KEYS.lastCourse, courseId);
    }
  }, [courseId]);

  useEffect(() => {
    if (courseId === null) {
      setBreadcrumb(["STUDY HUB"]);
      setPaletteChapterMeta({ courseId: null, chapterId: null });
    }
  }, [courseId, setBreadcrumb]);

  useEffect(() => {
    if (courseId === null) return;
    if (courseId !== "om300" && !userCourses.some((x) => x.id === courseId)) {
      setCourseId(null);
    }
  }, [userCourses, courseId]);

  useEffect(() => {
    const fn = () => setCourseId(null);
    window.addEventListener("studyhub-open-welcome", fn);
    return () => window.removeEventListener("studyhub-open-welcome", fn);
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    if (!courseShellLoad) return;
    const t = window.setTimeout(() => setCourseShellLoad(false), 220);
    return () => window.clearTimeout(t);
  }, [courseShellLoad, courseId]);

  const openCourseFromShell = useCallback(
    (id) => {
      if (courseId === null) setCourseShellLoad(true);
      setCourseId(id);
    },
    [courseId]
  );

  const navigateCourseChapter = useCallback(
    (cid, chapterId) => {
      openCourseFromShell(cid);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("studyhub-navigate-chapter", { detail: { courseId: cid, chapterId } }));
      }, 0);
    },
    [openCourseFromShell]
  );

  const goHubAndNewCourse = useCallback(() => {
    setCourseId(null);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("studyhub-open-manual-add")), 0);
  }, []);

  const persistUserCourse = useCallback((updated) => {
    setUserCourses((prev) => prev.map((c) => (c.id === updated.id ? ensureUserCourse(updated) : c)));
  }, []);

  const deleteUserCourse = useCallback((id) => {
    setUserCourses((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setCourseId((cur) => {
        if (cur !== id) return cur;
        return next.length ? next[0].id : null;
      });
      return next;
    });
  }, []);

  const addCourse = useCallback((name, sub, opts = {}) => {
    const n = (name || "New course").trim();
    const mid = uid("m");
    const materialPaths = Array.isArray(opts.materialPaths) ? opts.materialPaths : [];
    const course = ensureUserCourse({
      id: uid("uc"),
      name: n,
      subtitle: (sub || "").trim(),
      modules: [{ id: mid, label: "Notes 1", title: "General", body: "" }],
      activeModuleId: mid,
      disabledModuleIds: [],
      completedModuleIds: [],
      materialPaths,
    });
    setUserCourses((p) => [...p, course]);
    setCourseId(course.id);
  }, []);

  const onHubManualCreate = useCallback(
    (name) => {
      addCourse(name, "");
    },
    [addCourse]
  );

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

  const onHubExpressComplete = useCallback(
    async ({ fileName, absPath, onProgress }) => {
      const title = titleCaseFromFilename(fileName);
      const bridge = typeof window !== "undefined" ? window.studyHub : null;
      if (!absPath || typeof absPath !== "string") {
        console.error("[PPTX] No file path available:", absPath);
        try {
          sessionStorage.setItem(
            "studyhub.pendingToast",
            "Drag-and-drop requires running in the Electron app. Click BROWSE FILES above to select your file."
          );
        } catch {
          /* ignore */
        }
        return;
      }
      const paths = [absPath];
      const ext = (absPath.split(".").pop() || "").toLowerCase();
      console.log("[PPTX] absPath value:", absPath);
      console.log("[PPTX] absPath type:", typeof absPath);
      console.log("[PPTX] ext extracted:", ext);
      console.log("[PPTX] bridge.extractPptx exists:", !!bridge?.extractPptx);
      if (ext === "pptx" && bridge?.extractPptx) {
        onProgress?.({ label: "EXTRACTING CONTENT..." });
        const extracted = await bridge.extractPptx(absPath);
        console.log("[PPTX] Express extracted:", extracted);
        if (!extracted?.success || !extracted?.slides?.length) {
          console.log("[PPTX] Taking pipeline path:", false);
          addCourse(title, "", { materialPaths: paths });
          try {
            sessionStorage.setItem("studyhub.pendingToast", "Import attached to Materials. PPTX parsing failed.");
          } catch {
            /* ignore */
          }
          return;
        }
        const chapterGroups = detectChapters(extracted.slides, title);
        const moduleOutputs = [];
        const modules = await Promise.all(chapterGroups.map(async (group, idx) => {
          onProgress?.({
            label: "CLASSIFYING CONTENT...",
            chapter: `CH·${String(idx + 1).padStart(2, "0")} — ${(group.title || `Chapter ${idx + 1}`).toUpperCase()}`,
          });
          const classified = classifySlides(group.slides);
          onProgress?.({
            label: "BUILDING OUTPUT...",
            chapter: `CH·${String(idx + 1).padStart(2, "0")} — ${(group.title || `Chapter ${idx + 1}`).toUpperCase()}`,
          });
          const output = buildOutput(classified);
          let finalOutput = output;
          if (hasApiKey() && output.contentCards.length > 0) {
            onProgress?.({
              label: "ENHANCING WITH AI...",
              chapter: `CH·${String(idx + 1).padStart(2, "0")} — ${(group.title || `Chapter ${idx + 1}`).toUpperCase()}`,
            });
            const aiResult = await enhanceWithClaude(output);
            finalOutput = mergeEnhancedOutput(output, aiResult);
            if (aiResult) {
              console.log(
                "[AI] Enhanced:",
                "cleaned",
                aiResult.definitions?.length || 0,
                "added",
                aiResult.newDefinitions?.length || 0
              );
            }
          }
          console.log("[PPTX] Import output:", output);
          console.log("[PPTX] Taking pipeline path:", !!output);
          const contentData = buildChapterContent(finalOutput);
          const body = finalOutput.notesReviewBlock?.text || "";
          const moduleId = uid("m");
          moduleOutputs.push({ output: finalOutput, moduleId });
          console.log(
            "[CONTENT] Writing contentData to module:",
            `chapter-${idx + 1}`,
            "cards:",
            finalOutput.contentCards.length
          );
          return {
            id: moduleId,
            label: `Notes ${idx + 1}`,
            title: group.title || `Chapter ${idx + 1}`,
            contentData,
            body,
          };
        }));
        const course = ensureUserCourse({
          id: uid("uc"),
          name: title,
          subtitle: "",
          modules: modules.length ? modules : [{ id: uid("m"), label: "Notes 1", title: "General", body: "" }],
          activeModuleId: modules.length ? modules[0].id : undefined,
          disabledModuleIds: [],
          completedModuleIds: [],
          materialPaths: paths,
        });
        let enrichedCourse = { ...course, flashcards: [], glossary: [] };
        for (const meta of moduleOutputs) {
          const output = meta.output;
          if (!output) continue;
          const taggedCards = (output.flashcards || []).map((card) => ({ ...card, source: "pptx" }));
          const flashcards = mergeFlashcards(enrichedCourse.flashcards || [], taggedCards, meta.moduleId);
          enrichedCourse = { ...enrichedCourse, flashcards };
          enrichedCourse = addTermsToGlossary(enrichedCourse, meta.moduleId, output.contentCards || []);
        }
        setUserCourses((p) => [...p, enrichedCourse]);
        setCourseId(enrichedCourse.id);
        try {
          sessionStorage.setItem("studyhub.pendingToast", `COURSE BUILT · ${modules.length || 1} CHAPTERS`);
        } catch {
          /* ignore */
        }
      } else {
        console.log("[PPTX] Taking pipeline path:", false);
        addCourse(title, "", { materialPaths: paths });
        try {
          sessionStorage.setItem("studyhub.pendingToast", "File attached to Materials.");
        } catch {
          /* ignore */
        }
      }
      if (paths.length && bridge?.registerMaterialPaths) {
        void bridge.registerMaterialPaths(paths);
      }
    },
    [addCourse]
  );

  const pickExpressImport = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.pickFiles) return;
    try {
      const paths = await bridge.pickFiles(EXPRESS_FILTERS);
      if (!paths?.length) return;
      const p = paths[0];
      const base = p.split(/[/\\]/).pop() || p;
      onHubExpressComplete({ fileName: base, absPath: p });
    } catch {
      /* ignore */
    }
  }, [onHubExpressComplete]);

  const exportHub = () => {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      userCourses,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "study-hub-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importHub = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data.userCourses) ? data.userCourses : [];
        const normalized = incoming.map(ensureUserCourse);
        if (
          !window.confirm(`Replace ${userCourses.length} saved course(s) with ${normalized.length} from file?`)
        )
          return;
        setUserCourses(normalized);
        setCourseId(null);
      } catch {
        alert("Could not read that JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const activeUserCourse = userCourses.find((c) => c.id === courseId);
  const onHub = courseId === null;
  const handleOm300ActiveChapterChange = useCallback((ch) => {
    setPaletteChapterMeta((prev) => {
      if (prev.courseId === "om300" && prev.chapterId === ch) return prev;
      return { courseId: "om300", chapterId: ch };
    });
  }, []);
  const handleUserCourseActiveChapterChange = useCallback(
    (ch) => {
      if (!activeUserCourse?.id) return;
      setPaletteChapterMeta((prev) => {
        if (prev.courseId === activeUserCourse.id && prev.chapterId === ch) return prev;
        return { courseId: activeUserCourse.id, chapterId: ch };
      });
    },
    [activeUserCourse?.id]
  );

  return (
    <div data-bs-theme="dark" className="sh-app-root sh-app-shell">
      <ApiStatusSync />
      <TitleBar onCommandPalette={() => setPaletteOpen(true)} onGoToHub={() => setCourseId(null)} />
      {onHub ? (
        <HubScreen
          userCourses={userCourses}
          onOpenCourse={openCourseFromShell}
          onManualCreate={onHubManualCreate}
          onExpressComplete={onHubExpressComplete}
        />
      ) : (
        <>
          <div className="sh-shell-body">
            {courseId === "om300" && (
              <Om300StudyApp
                courseShellLoad={courseShellLoad}
                onActiveChapterChange={handleOm300ActiveChapterChange}
              />
            )}
            {activeUserCourse && courseId !== "om300" && (
              <UserCourseApp
                course={activeUserCourse}
                onChangeCourse={persistUserCourse}
                onDeleteCourse={deleteUserCourse}
                courseShellLoad={courseShellLoad}
                onActiveChapterChange={handleUserCourseActiveChapterChange}
              />
            )}
          </div>
          <StatusBar />
        </>
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        courseId={courseId}
        userCourses={userCourses}
        onSelectCourse={openCourseFromShell}
        onNavigateCourseChapter={navigateCourseChapter}
        onGoToHub={() => setCourseId(null)}
        onGoToHubAndNewCourse={goHubAndNewCourse}
        onPickImportFiles={pickExpressImport}
        onOpenSettings={() => window.dispatchEvent(new CustomEvent("studyhub-open-settings"))}
        onExport={exportHub}
        onImportFile={importHub}
        onMarkChapterReviewed={() => window.dispatchEvent(new CustomEvent("studyhub-mark-chapter-reviewed"))}
        onShuffleDeck={() => window.dispatchEvent(new CustomEvent("studyhub-shuffle-flashcards"))}
        om300ActiveChapter={
          paletteChapterMeta.courseId === "om300" ? paletteChapterMeta.chapterId : null
        }
      />
      <AiAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

export function StudyHubApp() {
  return (
    <ShellProvider>
      <StudyHubAppInner />
    </ShellProvider>
  );
}
