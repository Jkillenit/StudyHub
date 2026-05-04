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

  const onHubExpressComplete = useCallback(
    ({ fileName, absPath }) => {
      const title = titleCaseFromFilename(fileName);
      const paths = absPath ? [absPath] : [];
      addCourse(title, "", { materialPaths: paths });
      const bridge = typeof window !== "undefined" ? window.studyHub : null;
      if (paths.length && bridge?.registerMaterialPaths) {
        void bridge.registerMaterialPaths(paths);
      }
      try {
        sessionStorage.setItem("studyhub.pendingToast", "File attached to Materials.");
      } catch {
        /* ignore */
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
                onActiveChapterChange={(ch) => setPaletteChapterMeta({ courseId: "om300", chapterId: ch })}
              />
            )}
            {activeUserCourse && courseId !== "om300" && (
              <UserCourseApp
                course={activeUserCourse}
                onChangeCourse={persistUserCourse}
                onDeleteCourse={deleteUserCourse}
                courseShellLoad={courseShellLoad}
                onActiveChapterChange={(ch) => setPaletteChapterMeta({ courseId: activeUserCourse.id, chapterId: ch })}
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
