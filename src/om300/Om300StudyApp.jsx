import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { STORAGE, loadJson, saveJson } from "../lib/storage.js";
import { FONT_STEPS } from "../constants/fontSteps.js";
import { OM300_CHAPTERS } from "./chapters.js";
import { hasOm300SectionContent, Om300SectionBody } from "./contentRegistry.jsx";
import { GlossarySplitProvider, useGlossarySplit } from "../glossary/index.js";
import { GlossaryContextBlock } from "../glossary/GlossaryContextBlock.jsx";
import { getOm300ChapterNote, om300NoteHasVisibleBody } from "./chapterNotesStorage.js";
import { loadOm300Materials } from "./materialsStorage.js";
import { Om300MaterialsOffcanvas } from "./Om300MaterialsOffcanvas.jsx";
import { ChapterNotesEditorBody } from "./ChapterNotesEditorBody.jsx";
import { useShell } from "../shell/ShellContext.jsx";
import { OM300_SIDEBAR_GROUPS, om300BreadcrumbChapter, om300PrefixClassName, om300SidebarPrefix } from "./chapterUiMeta.js";
import { FlashcardDeckProvider, useFlashcardDeckContext } from "./flashcards/FlashcardDeckContext.jsx";
import { ChapterContentSkeleton } from "./ChapterContentSkeleton.jsx";
import { CourseSidebarSkeleton } from "./CourseSidebarSkeleton.jsx";
import { useDelayedSkeletonVisible } from "../hooks/useDelayedSkeletonVisible.js";
import Form from "react-bootstrap/Form";

function htmlToPlainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;

  div.querySelectorAll("h2").forEach((el) => {
    el.textContent = `\n${el.textContent.toUpperCase()}\n`;
  });
  div.querySelectorAll("h3").forEach((el) => {
    el.textContent = `\n${el.textContent}\n`;
  });

  div.querySelectorAll("li").forEach((el) => {
    el.textContent = `• ${el.textContent}`;
  });

  div.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.replaceWith(document.createTextNode(el.checked ? "[x] " : "[ ] "));
  });

  div.querySelectorAll("p, li, h2, h3, blockquote").forEach((el) => {
    el.insertAdjacentText("afterend", "\n");
  });

  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

function Om300StudyAppInner({ courseShellLoad = false, onActiveChapterChange }) {
  const { panelApi } = useFlashcardDeckContext();
  const { setBreadcrumb, setStatusBar, setApiLive } = useShell();
  const { splitOpen, closeSplit } = useGlossarySplit();
  const [active, setActive] = useState("ch1");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainTab, setMainTab] = useState("content");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ctxCollapsed, setCtxCollapsed] = useState(false);
  const [notesTick, setNotesTick] = useState(0);
  const [notesAutosaveStatus, setNotesAutosaveStatus] = useState("local");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("EXPORT ↗");
  const notesEditorRef = useRef(null);
  const exportTimerRef = useRef(null);

  const [isPending, startTransition] = useTransition();
  const shellSkelVis = useDelayedSkeletonVisible(!!courseShellLoad, courseShellLoad ? "shell" : "");
  /* Pending skeleton only applies to the content tab; OM300 bodies are lazy — no sync “sections” gate. */
  const pendingSkelVis = useDelayedSkeletonVisible(isPending && mainTab === "content", active, false);
  const showContentSkeleton = mainTab === "content" && (shellSkelVis || pendingSkelVis);

  const [contentEnterClass, setContentEnterClass] = useState("");
  useEffect(() => {
    if (showContentSkeleton || isPending || mainTab !== "content") {
      setContentEnterClass("");
      return;
    }
    setContentEnterClass("sh-content-enter");
    const t = window.setTimeout(() => setContentEnterClass(""), 80);
    return () => window.clearTimeout(t);
  }, [active, mainTab, showContentSkeleton, isPending]);

  const [disabledIds, setDisabledIds] = useState(() => new Set(loadJson(STORAGE.disabled, [])));
  const [completedIds, setCompletedIds] = useState(() => new Set(loadJson(STORAGE.completed, [])));
  const [fontStep, setFontStep] = useState(() => {
    const s = loadJson(STORAGE.fontStep, 1);
    return typeof s === "number" && s >= 0 && s < FONT_STEPS.length ? s : 1;
  });
  const [comfortable, setComfortable] = useState(() => loadJson(STORAGE.comfortable, true));

  useEffect(() => {
    saveJson(STORAGE.disabled, [...disabledIds]);
  }, [disabledIds]);
  useEffect(() => {
    saveJson(STORAGE.completed, [...completedIds]);
  }, [completedIds]);
  useEffect(() => {
    saveJson(STORAGE.fontStep, fontStep);
  }, [fontStep]);
  useEffect(() => {
    saveJson(STORAGE.comfortable, comfortable);
  }, [comfortable]);

  useEffect(() => {
    onActiveChapterChange?.(active);
  }, [active, onActiveChapterChange]);

  useEffect(() => {
    if (mainTab !== "notes") setExportStatus("EXPORT ↗");
  }, [mainTab]);

  useEffect(() => {
    return () => window.clearTimeout(exportTimerRef.current);
  }, []);

  const visibleChapters = useMemo(
    () => OM300_CHAPTERS.filter((c) => !disabledIds.has(c.id)),
    [disabledIds]
  );

  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleChapters;
    return visibleChapters.filter(
      (c) => c.title.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [visibleChapters, search]);

  useEffect(() => {
    if (!visibleChapters.length) return;
    if (!visibleChapters.some((c) => c.id === active)) {
      startTransition(() => setActive(visibleChapters[0].id));
    }
  }, [visibleChapters, active, startTransition]);

  const current = OM300_CHAPTERS.find((c) => c.id === active);
  const fontScale = FONT_STEPS[fontStep];
  const completedCount = [...completedIds].filter((id) => visibleChapters.some((c) => c.id === id)).length;
  const totalVisible = visibleChapters.length;
  const masteryPct = totalVisible ? Math.round((completedCount / totalVisible) * 100) : 0;

  const toggleModule = useCallback((id) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      const isDisabled = next.has(id);
      const enabledCount = OM300_CHAPTERS.length - prev.size;
      if (isDisabled) next.delete(id);
      else {
        if (enabledCount <= 1) return prev;
        next.add(id);
      }
      return next;
    });
  }, []);

  const resetModules = useCallback(() => setDisabledIds(new Set()), []);
  const clearProgress = useCallback(() => setCompletedIds(new Set()), []);

  const markCurrentComplete = useCallback(() => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(active)) next.delete(active);
      else next.add(active);
      return next;
    });
  }, [active]);

  const goChapter = useCallback(
    (delta) => {
      const list = filteredChapters;
      if (!list.length) return;
      let i = list.findIndex((c) => c.id === active);
      if (i < 0) i = 0;
      const ni = (i + delta + list.length) % list.length;
      startTransition(() => setActive(list[ni].id));
    },
    [filteredChapters, active, startTransition]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (active === "flashcards" && mainTab === "content") return;
      if (e.key === "ArrowLeft") goChapter(-1);
      if (e.key === "ArrowRight") goChapter(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goChapter, active, mainTab]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        markCurrentComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markCurrentComplete]);

  useEffect(() => {
    const onNav = (e) => {
      const d = e.detail;
      if (d?.courseId === "om300" && d?.chapterId) {
        /* Same path as sidebar chapter click — no startTransition — keeps useTransition
         * pending state aligned with sidebar/palette so skeleton timers always reset. */
        setActive(d.chapterId);
        setMainTab("content");
      }
    };
    window.addEventListener("studyhub-navigate-chapter", onNav);
    return () => window.removeEventListener("studyhub-navigate-chapter", onNav);
  }, []);

  useEffect(() => {
    const onSettings = () => setSettingsOpen(true);
    window.addEventListener("studyhub-open-settings", onSettings);
    return () => window.removeEventListener("studyhub-open-settings", onSettings);
  }, []);

  useEffect(() => {
    const onMark = () => markCurrentComplete();
    window.addEventListener("studyhub-mark-chapter-reviewed", onMark);
    return () => window.removeEventListener("studyhub-mark-chapter-reviewed", onMark);
  }, [markCurrentComplete]);

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

  useEffect(() => {
    const ch = om300BreadcrumbChapter(active, current?.label);
    setBreadcrumb(["OM 300", "EXAM 4 STUDY GUIDE", ch]);
  }, [active, current, setBreadcrumb]);

  useEffect(() => {
    setStatusBar({
      left: ["●", "OM 300", `${completedCount}/${totalVisible}`, current?.label ?? ""],
      right: [mainTab === "notes" ? "NOTES" : "CONTENT", "LOCAL"],
    });
  }, [completedCount, totalVisible, current, mainTab, setStatusBar]);

  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.registerMaterialPaths) return;
    const mats = loadOm300Materials();
    if (mats.length) bridge.registerMaterialPaths(mats.map((m) => m.path)).catch(() => {});
  }, []);

  const chapterHasNotes = useMemo(
    () => om300NoteHasVisibleBody(getOm300ChapterNote(active)),
    [active, notesTick]
  );
  const hasContent = useMemo(() => hasOm300SectionContent(active), [active]);

  const contentLineHeight = comfortable ? 1.75 : 1.55;

  const filteredByGroup = useCallback(
    (ids) => ids.map((id) => OM300_CHAPTERS.find((c) => c.id === id)).filter(Boolean).filter((c) => filteredChapters.some((x) => x.id === c.id)),
    [filteredChapters]
  );

  const exportNotes = useCallback(async () => {
    const editor = notesEditorRef.current;
    if (!editor || editor.isDestroyed) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") return;
    const plain = htmlToPlainText(html);
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setExportStatus("COPIED");
    window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = window.setTimeout(() => setExportStatus("EXPORT ↗"), 2000);
  }, []);

  return (
    <>
      <style>{`
        @media print {
          .sh-sidebar, .sh-ctx, .sh-topbar, .sh-statusbar, .offcanvas { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
      <div className="sh-workspace">
        <aside className={`sh-sidebar sh-scroll-hover ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sh-sidebar-head">
            <div className="sh-sidebar-label">ACTIVE COURSE</div>
            <div className="sh-sidebar-course">OM 300</div>
            <div className="sh-sidebar-meta mono">EXAM 4 · {totalVisible} MODULES</div>
          </div>
          <div className="sh-sidebar-search">
            <span className="sh-sidebar-search-prefix" aria-hidden>
              ›
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="FILTER"
              aria-label="Filter modules"
            />
          </div>
          <div className="sh-sidebar-scroll sh-scroll-hover">
            {OM300_SIDEBAR_GROUPS.map((g) => {
              const rows = filteredByGroup(g.ids);
              if (!rows.length) return null;
              return (
                <div key={g.key}>
                  <div className="sh-sidebar-section-label">{g.label}</div>
                  {rows.map((ch) => {
                    const isAct = active === ch.id;
                    const done = completedIds.has(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className={`ch-item ${isAct ? "active" : ""} ${done ? "ch-item--complete" : ""}`}
                        onClick={() => {
                          setActive(ch.id);
                          setMainTab("content");
                        }}
                      >
                        <span className={om300PrefixClassName(ch.id)}>{om300SidebarPrefix(ch.id)}</span>
                        <span className="ch-title">{ch.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="sh-main">
          <div className="sh-main-header">
            <div className="sh-title-row">
              <h1 className="sh-main-title">{current?.title ?? "—"}</h1>
              <span className="sh-ch-tag">{om300SidebarPrefix(active)}</span>
            </div>
            <div className="sh-tab-row">
              <button
                type="button"
                className={`sh-tab ${mainTab === "content" ? "active" : ""}`}
                onClick={() => setMainTab("content")}
              >
                CONTENT
              </button>
              <button
                type="button"
                className={`sh-tab ${mainTab === "notes" ? "active" : ""}`}
                onClick={() => setMainTab("notes")}
              >
                NOTES
                {chapterHasNotes ? " ·" : ""}
              </button>
              {mainTab === "notes" ? (
                <button
                  type="button"
                  className={`sh-export-btn ${exportStatus === "COPIED" ? "copied" : ""}`}
                  onClick={exportNotes}
                >
                  {exportStatus}
                </button>
              ) : null}
            </div>
          </div>
          <div
            className={`sh-main-body sh-scroll-hover ${active === "flashcards" && mainTab === "content" ? "sh-main-body--drill" : ""}`}
            key={`${active}-${mainTab}`}
          >
            {shellSkelVis ? (
              <ChapterContentSkeleton />
            ) : (
              <>
                {mainTab === "content" ? (
                  showContentSkeleton ? (
                    <ChapterContentSkeleton />
                  ) : !hasContent ? (
                    <div className={`sh-main-empty-wrap ${contentEnterClass}`}>
                      <pre className="sh-empty-ascii-box">{`┌──────────────────────┐
│   NO CONTENT YET     │
│                      │
│  CHAPTER BODY EMPTY  │
└──────────────────────┘`}</pre>
                    </div>
                  ) : (
                    <div
                      className={`font-sans ${contentEnterClass} ${active === "flashcards" ? "sh-section-body--drill" : ""}`}
                      style={{ fontSize: `calc(15px * ${fontScale})`, lineHeight: contentLineHeight }}
                    >
                      <Om300SectionBody sectionId={active} />
                    </div>
                  )
                ) : null}
                {mainTab === "notes" ? (
                  <ChapterNotesEditorBody
                    sectionId={active}
                    sectionTitle={current ? `${current.label} — ${current.title}` : ""}
                    onPersist={() => setNotesTick((n) => n + 1)}
                    onAutosaveStatus={setNotesAutosaveStatus}
                    onEditorReady={(ed) => {
                      notesEditorRef.current = ed;
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        </main>

        <aside className={`sh-ctx sh-scroll-hover ${ctxCollapsed ? "collapsed" : ""}`}>
          <div className="sh-ctx-scroll sh-scroll-hover">
            <GlossaryContextBlock />

            <div className="ctx-section">
              <div className="ctx-label">MASTERY</div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="sh-meter-track flex-grow-1">
                  <div className="sh-meter-fill" style={{ width: `${masteryPct}%` }} />
                </div>
                <span className="mono" style={{ fontSize: 10, color: "var(--sh-green)" }}>
                  {masteryPct}%
                </span>
              </div>
              <div className="sh-kv-row mono">
                <span className="sh-kv-key">DONE</span>
                <span className="sh-kv-val sh-kv-val--active">
                  {completedCount}/{totalVisible}
                </span>
              </div>
            </div>

            <div className="ctx-section">
              <div className="ctx-label">SHORTCUTS</div>
              <div className="kbd-row">
                <span>Chapter</span>
                <span className="kbd">← →</span>
              </div>
              <div className="kbd-row">
                <span>Reviewed</span>
                <span className="kbd">⌘R</span>
              </div>
              <div className="kbd-row">
                <span>Commands</span>
                <span className="kbd">⌘K</span>
              </div>
            </div>

            <div className="ctx-section">
              <div className="ctx-label">QUICK</div>
              <button type="button" className="sh-btn-ghost ctx-btn" onClick={() => setMaterialsOpen(true)}>
                MATERIALS
              </button>
              <button type="button" className="sh-btn-ghost ctx-btn" onClick={() => setSettingsOpen((v) => !v)}>
                {settingsOpen ? "CLOSE SETTINGS" : "SETTINGS"}
              </button>
              <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={() => setSidebarCollapsed((v) => !v)}>
                {sidebarCollapsed ? "SHOW SIDEBAR" : "HIDE SIDEBAR"}
              </button>
              <button type="button" className="sh-btn-ghost ctx-btn ctx-btn--utility" onClick={() => setCtxCollapsed((v) => !v)}>
                {ctxCollapsed ? "SHOW PANEL" : "HIDE PANEL"}
              </button>
              {splitOpen ? (
                <button type="button" className="sh-btn-ghost" onClick={closeSplit}>
                  CLOSE GLOSSARY
                </button>
              ) : null}
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
                <div className="d-flex flex-column gap-1 mb-2">
                  {OM300_CHAPTERS.map((ch) => {
                    const enabled = !disabledIds.has(ch.id);
                    const onlyOne = OM300_CHAPTERS.length - disabledIds.size <= 1 && enabled;
                    return (
                      <label key={ch.id} className="mono d-flex align-items-center gap-2" style={{ fontSize: 10, cursor: onlyOne ? "not-allowed" : "pointer" }}>
                        <input type="checkbox" checked={enabled} disabled={onlyOne} onChange={() => toggleModule(ch.id)} />
                        <span style={{ color: "var(--sh-text-secondary)" }}>
                          {ch.label} — {ch.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button type="button" className="sh-btn-ghost mb-1" onClick={resetModules}>
                  SHOW ALL
                </button>
                <button type="button" className="sh-btn-ghost mb-2" onClick={clearProgress}>
                  CLEAR COMPLETION
                </button>
                <label className="mono d-flex align-items-center gap-2 mb-2" style={{ fontSize: 10 }}>
                  <input type="checkbox" checked={comfortable} onChange={(e) => setComfortable(e.target.checked)} />
                  COMFORT SPACING
                </label>
                <div className="d-flex align-items-center gap-2 mono" style={{ fontSize: 10 }}>
                  <span className="sh-kv-key">TEXT</span>
                  <button type="button" className="sh-btn-ghost" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep <= 0} onClick={() => setFontStep((s) => Math.max(0, s - 1))}>
                    A−
                  </button>
                  <button type="button" className="sh-btn-ghost" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep >= FONT_STEPS.length - 1} onClick={() => setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1))}>
                    A+
                  </button>
                </div>
              </div>
            ) : null}

            {active === "flashcards" && panelApi ? (
              <details className="ctx-section ctx-deck-collapsible border-0" open>
                <summary className="ctx-label ctx-deck-summary">DECK</summary>
                <div className="ctx-deck-inner">
                  <p className="ctx-deck-count mono">LOCAL · {panelApi.n} CARDS</p>
                  <button type="button" className="sh-btn-ghost ctx-btn mb-2" onClick={() => panelApi.setShowAdd((s) => !s)}>
                    {panelApi.showAdd ? "CLOSE ADD CARD" : "+ ADD CARD"}
                  </button>
                  {panelApi.showAdd ? (
                    <div className="d-flex flex-column gap-2 mb-3">
                      <Form.Control
                        size="sm"
                        className="sh-input mono"
                        value={panelApi.newFront}
                        onChange={(e) => panelApi.setNewFront(e.target.value)}
                        placeholder="FRONT"
                      />
                      <Form.Control
                        as="textarea"
                        rows={3}
                        className="sh-input font-sans"
                        value={panelApi.newBack}
                        onChange={(e) => panelApi.setNewBack(e.target.value)}
                        placeholder="BACK"
                        style={{ resize: "vertical", fontSize: 14 }}
                      />
                      <button
                        type="button"
                        className="sh-btn-primary align-self-start"
                        disabled={!panelApi.newFront.trim() || !panelApi.newBack.trim()}
                        onClick={panelApi.addCard}
                      >
                        SAVE
                      </button>
                    </div>
                  ) : null}
                  <button type="button" className="sh-btn-ghost drill-deck-restore mb-2" onClick={panelApi.restoreSeed}>
                    RESTORE SEED ({panelApi.seedLen})
                  </button>
                  {panelApi.n > 0 ? (
                    <button type="button" className="sh-btn-ghost sh-btn-danger-ghost" onClick={panelApi.deleteCurrent}>
                      DELETE CURRENT CARD
                    </button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </aside>
      </div>

      <Om300MaterialsOffcanvas show={materialsOpen} onHide={() => setMaterialsOpen(false)} />
    </>
  );
}

export function Om300StudyApp({ courseShellLoad = false, onActiveChapterChange }) {
  return (
    <GlossarySplitProvider>
      <FlashcardDeckProvider>
        <Om300StudyAppInner courseShellLoad={courseShellLoad} onActiveChapterChange={onActiveChapterChange} />
      </FlashcardDeckProvider>
    </GlossarySplitProvider>
  );
}

export default Om300StudyApp;
