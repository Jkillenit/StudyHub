import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ShellProvider, useShell } from "../shell/ShellContext.jsx";
import { TitleBar } from "../components/TitleBar.jsx";
import { StatusBar } from "../shell/TilingChrome.jsx";
import { CommandPalette } from "../shell/CommandPalette.jsx";
import { BuiltinCourseApp } from "../study/BuiltinCourseApp.jsx";
import { saveJson } from "../lib/storage.js";
import { HUB_KEYS, ensureUserCourse, uid } from "../hub/userCourseModel.js";
import { UserCourseApp } from "../hub/UserCourseApp.jsx";
import { HubScreen } from "../hub/HubScreen.jsx";
import BlackboardImportHandler from "../hub/BlackboardImportHandler.jsx";
import { AiAssistantPanel } from "../ai/AiAssistantPanel.jsx";
import { titleCaseFromFilename } from "../lib/filenameToCourseName.js";
import { EXPRESS_FILTERS } from "../welcome/ExpressImportModal.jsx";
import { courseStore } from "../db/courseStore.js";
import { useUserCourses } from "../features/courses/useUserCourses.js";
import { buildCourseFromSlides, newModule } from "../features/import/courseBuilders.js";
import { applyBlackboardImport } from "../features/import/blackboardImport.js";
import { applySyllabusText } from "../features/import/syllabusImport.js";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { SplashScreen, useSplashPhase } from "../components/SplashScreen.jsx";

const CompanionLayer = lazy(() => import("../companion/CompanionLayer.jsx"));

function setPendingToast(message) {
  try {
    sessionStorage.setItem("studyhub.pendingToast", message);
  } catch {
    /* ignore */
  }
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
  const {
    courses: userCourses,
    loaded,
    getCourse,
    saveCourse,
    addCourse: addUserCourse,
    updateCourse,
    deleteCourse,
    reloadCourse,
    replaceAll,
  } = useUserCourses();
  const splashPhase = useSplashPhase(loaded);
  const [courseId, setCourseId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [courseShellLoad, setCourseShellLoad] = useState(false);
  const [paletteChapterMeta, setPaletteChapterMeta] = useState(() => ({ courseId: null, chapterId: null }));

  useEffect(() => {
    if (courseId != null) saveJson(HUB_KEYS.lastCourse, courseId);
  }, [courseId]);

  useEffect(() => {
    if (courseId === null) {
      setBreadcrumb(["STUDY HUB"]);
      setPaletteChapterMeta({ courseId: null, chapterId: null });
    }
  }, [courseId, setBreadcrumb]);

  useEffect(() => {
    if (!loaded || courseId === null || courseId === "builtin") return;
    if (!userCourses.some((x) => x.id === courseId)) setCourseId(null);
  }, [userCourses, courseId, loaded]);

  useEffect(() => {
    const toHub = () => setCourseId(null);
    const openAi = () => setAiOpen(true);
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("studyhub-open-welcome", toHub);
    window.addEventListener("studyhub-open-ai", openAi);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("studyhub-open-welcome", toHub);
      window.removeEventListener("studyhub-open-ai", openAi);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /** Every Blackboard sync (hub panel or Blackboard toolbar) lands here: load the course, apply the syllabus. */
  useEffect(() => {
    const bb = window.studyHub?.blackboard;
    if (!bb?.onSyncComplete) return undefined;
    return bb.onSyncComplete(async (res) => {
      if (!res?.courseUuid) return;
      await reloadCourse(res.courseUuid);
      let syllabusStatus = res.syllabus ? "none" : "missing";
      if (res.ok && res.syllabus?.text) {
        syllabusStatus = (await applySyllabusText(res.courseUuid, res.syllabus.text).catch(() => ({ status: "none" }))).status;
      }
      window.dispatchEvent(
        new CustomEvent("studyhub-bb-synced", {
          detail: { bbCourseId: res.bbCourseId, courseUuid: res.courseUuid, ok: res.ok, syllabusStatus },
        })
      );
    });
  }, [reloadCourse]);

  useEffect(() => {
    if (!courseShellLoad) return undefined;
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

  const deleteUserCourse = useCallback(
    async (id) => {
      setCourseId((cur) => (cur === id ? null : cur));
      await deleteCourse(id);
    },
    [deleteCourse]
  );

  const createCourse = useCallback(
    async (name, sub = "", opts = {}) => {
      const course = await addUserCourse({
        id: uid("uc"),
        name: (name || "New course").trim(),
        subtitle: (sub || "").trim(),
        modules: [newModule("General", 0)],
        materialPaths: Array.isArray(opts.materialPaths) ? opts.materialPaths : [],
        ...(opts.bbCourseId ? { bbCourseId: opts.bbCourseId } : {}),
        ...(opts.courseCode ? { courseCode: opts.courseCode } : {}),
      });
      if (opts.open !== false) setCourseId(course.id);
      return course;
    },
    [addUserCourse]
  );

  const onHubManualCreate = useCallback((name) => void createCourse(name, ""), [createCourse]);

  /** One Study Hub course per Blackboard course: reuse by bbCourseId (in memory, then DB) before creating. */
  const createBlackboardCourse = useCallback(
    async ({ name, bbCourseId, courseCode }) => {
      const inMemory = bbCourseId ? userCourses.find((c) => c.bbCourseId === bbCourseId) : null;
      if (inMemory) return inMemory;
      const stored = await courseStore.findByBbCourseId(bbCourseId);
      if (stored) return getCourse(stored.id) || stored;
      return createCourse(name || "Blackboard Course", "BLACKBOARD", { bbCourseId, courseCode, open: false });
    },
    [userCourses, getCourse, createCourse]
  );

  const handleBlackboardImport = useCallback(
    async ({ courseId: targetId, bbCourseId, fileName, folderName, action, extracted }) => {
      const target =
        (targetId && getCourse(targetId)) ||
        (bbCourseId && userCourses.find((c) => c.bbCourseId === bbCourseId)) ||
        (courseId && courseId !== "builtin" ? getCourse(courseId) : null);
      if (!target) return "○ Click SYNC TO STUDY HUB in the toolbar first";

      let message = null;
      let syllabus = null;
      await updateCourse(target.id, async (current) => {
        const result = await applyBlackboardImport(current, { fileName, folderName, action, extracted });
        message = result.message;
        syllabus = result.syllabus;
        if (!result.course) return null;
        return bbCourseId && !result.course.bbCourseId ? { ...result.course, bbCourseId } : result.course;
      });
      if (syllabus?.grading?.length) {
        const courseUuid = target.uuid || target.id;
        const existing = await window.studyHub?.db?.grades?.getComponents(courseUuid);
        if (!existing?.length) {
          await courseStore.saveGradeComponents(courseUuid, syllabus.grading);
          if (syllabus.gradingScale) await window.studyHub?.db?.grades?.saveGradingScale({ courseUuid, scale: syllabus.gradingScale });
        } else {
          message = "✓ Syllabus imported — existing grade setup kept";
        }
      }
      return message;
    },
    [getCourse, userCourses, courseId, updateCourse]
  );

  const onHubExpressComplete = useCallback(
    async ({ fileName, absPath, onProgress }) => {
      const title = titleCaseFromFilename(fileName);
      const bridge = typeof window !== "undefined" ? window.studyHub : null;
      if (!absPath || typeof absPath !== "string") {
        setPendingToast("Drag-and-drop requires running in the Electron app. Click BROWSE FILES above to select your file.");
        return;
      }
      const paths = [absPath];
      const ext = (absPath.split(".").pop() || "").toLowerCase();
      if (ext !== "pptx" || !bridge?.extractPptx) {
        await createCourse(title, "", { materialPaths: paths });
        setPendingToast("File attached to Materials.");
        return;
      }
      onProgress?.({ label: "EXTRACTING CONTENT..." });
      const extracted = await bridge.extractPptx(absPath);
      if (!extracted?.success || !extracted?.slides?.length) {
        await createCourse(title, "", { materialPaths: paths });
        setPendingToast("Import attached to Materials. PPTX parsing failed.");
        return;
      }
      const { course, chapterCount } = await buildCourseFromSlides({
        title,
        slides: extracted.slides,
        materialPaths: paths,
        onProgress,
      });
      const saved = await addUserCourse(course);
      setCourseId(saved.id);
      setPendingToast(`COURSE BUILT · ${chapterCount} CHAPTERS`);
    },
    [createCourse, addUserCourse]
  );

  const pickExpressImport = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.pickFiles) return;
    try {
      const paths = await bridge.pickFiles(EXPRESS_FILTERS);
      const p = paths?.[0];
      if (!p) return;
      await onHubExpressComplete({ fileName: p.split(/[/\\]/).pop() || p, absPath: p });
    } catch {
      /* ignore */
    }
  }, [onHubExpressComplete]);

  const exportHub = () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), userCourses };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "study-hub-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importHub = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = (Array.isArray(data.userCourses) ? data.userCourses : []).map(ensureUserCourse);
        if (!window.confirm(`Replace ${userCourses.length} saved course(s) with ${incoming.length} from file?`)) return;
        setCourseId(null);
        await replaceAll(incoming);
      } catch {
        window.alert("Could not read that JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const userCoursesList = useMemo(() => userCourses.filter((c) => c.type !== "builtin"), [userCourses]);
  const activeUserCourse = userCoursesList.find((c) => c.id === courseId);
  const onHub = courseId === null;

  useEffect(() => {
    const id = activeUserCourse?.uuid || activeUserCourse?.id;
    if (id) void window.studyHub?.blackboard?.setActiveCourse?.(id);
  }, [activeUserCourse?.uuid, activeUserCourse?.id]);

  useEffect(() => {
    const bb = window.studyHub?.blackboard;
    if (!bb?.onCourseDetected || !activeUserCourse || activeUserCourse.bbCourseId) return undefined;
    const targetId = activeUserCourse.id;
    const handleCourseDetected = (data) => {
      if (!data?.bbCourseId) return;
      if (userCourses.some((c) => c.bbCourseId === data.bbCourseId)) return;
      void updateCourse(targetId, (cur) => (cur.bbCourseId ? null : { ...cur, bbCourseId: data.bbCourseId }));
    };
    bb.onCourseDetected(handleCourseDetected);
    return () => bb.offCourseDetected?.(handleCourseDetected);
  }, [activeUserCourse, userCourses, updateCourse]);

  const handleBuiltinActiveChapterChange = useCallback((ch) => {
    setPaletteChapterMeta((prev) => (prev.courseId === "builtin" && prev.chapterId === ch ? prev : { courseId: "builtin", chapterId: ch }));
  }, []);
  const handleUserCourseActiveChapterChange = useCallback(
    (ch) => {
      if (!activeUserCourse?.id) return;
      setPaletteChapterMeta((prev) =>
        prev.courseId === activeUserCourse.id && prev.chapterId === ch ? prev : { courseId: activeUserCourse.id, chapterId: ch }
      );
    },
    [activeUserCourse?.id]
  );

  return (
    <div data-bs-theme="dark" className="sh-app-root sh-app-shell">
      <ApiStatusSync />
      <BlackboardImportHandler onCreateCourse={createBlackboardCourse} onImport={handleBlackboardImport} />
      <TitleBar onCommandPalette={() => setPaletteOpen(true)} onGoToHub={() => setCourseId(null)} />
      <ErrorBoundary resetKey={courseId} onReset={() => setCourseId(null)}>
        {onHub ? (
          <HubScreen
            userCourses={userCoursesList}
            onOpenCourse={openCourseFromShell}
            onManualCreate={onHubManualCreate}
            onExpressComplete={onHubExpressComplete}
          />
        ) : (
          <>
            <div className="sh-shell-body">
              {courseId === "builtin" && (
                <BuiltinCourseApp courseShellLoad={courseShellLoad} onActiveChapterChange={handleBuiltinActiveChapterChange} />
              )}
              {activeUserCourse && courseId !== "builtin" && (
                <UserCourseApp
                  course={activeUserCourse}
                  onChangeCourse={saveCourse}
                  onDeleteCourse={deleteUserCourse}
                  courseShellLoad={courseShellLoad}
                  onActiveChapterChange={handleUserCourseActiveChapterChange}
                />
              )}
            </div>
            <StatusBar />
          </>
        )}
      </ErrorBoundary>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        courseId={courseId}
        userCourses={userCoursesList}
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
        builtinActiveChapter={paletteChapterMeta.courseId === "builtin" ? paletteChapterMeta.chapterId : null}
      />
      <AiAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      {splashPhase === "done" ? (
        <ErrorBoundary resetKey="companion" fallback={null}>
          <Suspense fallback={null}>
            <CompanionLayer
              courses={userCoursesList}
              activeCourseId={courseId}
              onHub={onHub}
              onGoHub={() => setCourseId(null)}
              onOpenCourse={openCourseFromShell}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      {splashPhase !== "done" ? (
        <SplashScreen ready={loaded} leaving={splashPhase === "leaving"} courseCount={userCourses.length + 1} />
      ) : null}
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
