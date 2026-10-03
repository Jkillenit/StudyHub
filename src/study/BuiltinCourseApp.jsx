import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { STORAGE, loadJson, saveJson } from "../lib/storage.js";
import { FONT_STEPS } from "../constants/fontSteps.js";
import { STUDY_CHAPTERS } from "./chapters.js";
import { hasStudySectionContent, StudySectionBody } from "./contentRegistry.jsx";
import { GlossarySplitProvider, useGlossarySplit } from "../glossary/index.js";
import { GlossaryContextBlock } from "../glossary/GlossaryContextBlock.jsx";
import { getStudyChapterNote, studyNoteHasVisibleBody } from "./chapterNotesStorage.js";
import { MaterialsOffcanvas } from "./MaterialsOffcanvas.jsx";
import { ChapterNotesEditorBody } from "./ChapterNotesEditorBody.jsx";
import { useShell } from "../shell/ShellContext.jsx";
import { NovaBar } from "../shell/NovaBar.jsx";
import SideDrawer from "../shell/SideDrawer.jsx";
import CourseHeader from "../hub/components/CourseHeader.jsx";
import { builtinCourseNav } from "../hub/courseNav.js";
import { studyBreadcrumbChapter } from "./chapterUiMeta.js";
import { useDeckCards } from "./flashcards/useDeckCards.js";
import { DeckList, DeckModeChips } from "./flashcards/DeckList.jsx";
import { DECK_MODES, filterDeck } from "./flashcards/deckModes.js";
import { SEED_FLASHCARDS } from "./flashcards/seedCards.js";
import { getDueCards, isCardDue, masteryPercent } from "./sm2.js";
import { sessionOrder } from "../session/cardRun.js";
import { ChapterContentSkeleton } from "./ChapterContentSkeleton.jsx";
import { useDelayedSkeletonVisible } from "../hooks/useDelayedSkeletonVisible.js";
import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";

const FlashcardDeck = lazy(() => import("./flashcards/FlashcardDeck.jsx"));
const BUILTIN_DECK_MODES = DECK_MODES.filter((m) => ["all", "due", "weak"].includes(m.id));
const builtinTopic = (c) => c.chapter || c.source || "OM 300";

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

const TABS = [
  { id: "content", label: "Content" },
  { id: "notes", label: "Notes" },
];

function BuiltinCourseAppInner({ courseShellLoad = false, onActiveChapterChange, novaCourses, onGoHub }) {
  const deck = useDeckCards();
  const [deckMode, setDeckMode] = useState("all");
  const [sessionIds, setSessionIds] = useState(null);
  const addCardRef = useRef(null);
  const { setBreadcrumb, setApiLive, setCourseNav } = useShell();
  const { splitOpen, closeSplit } = useGlossarySplit();
  const [active, setActive] = useState("ch1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainTab, setMainTab] = useState("content");
  const [notesTick, setNotesTick] = useState(0);
  const [notesAutosaveStatus, setNotesAutosaveStatus] = useState("local");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("EXPORT ↗");
  const notesEditorRef = useRef(null);
  const exportTimerRef = useRef(null);

  const [isPending, startTransition] = useTransition();
  const shellSkelVis = useDelayedSkeletonVisible(!!courseShellLoad, courseShellLoad ? "shell" : "");
  /* Pending skeleton only applies to the content tab; built-in course bodies are lazy — no sync “sections” gate. */
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
    () => STUDY_CHAPTERS.filter((c) => !disabledIds.has(c.id)),
    [disabledIds]
  );

  useEffect(() => {
    if (!visibleChapters.length) return;
    if (!visibleChapters.some((c) => c.id === active)) {
      startTransition(() => setActive(visibleChapters[0].id));
    }
  }, [visibleChapters, active, startTransition]);

  const current = STUDY_CHAPTERS.find((c) => c.id === active);
  const fontScale = FONT_STEPS[fontStep];

  const masteryPct = useMemo(() => masteryPercent(deck.cards), [deck.cards]);
  const deckCards = useMemo(() => filterDeck(deck.cards, deckMode), [deck.cards, deckMode]);
  const deckDue = useMemo(() => getDueCards(deck.cards).length, [deck.cards]);
  const deckSession = sessionIds
    ? {
        cardIds: sessionIds,
        crumb: "OM 300 · Flashcards",
        onExit: () => setSessionIds(null),
        onToday: () => {
          setSessionIds(null);
          onGoHub?.("today");
        },
        topicOf: builtinTopic,
      }
    : null;

  const toggleModule = useCallback((id) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      const isDisabled = next.has(id);
      const enabledCount = STUDY_CHAPTERS.length - prev.size;
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
      const list = visibleChapters;
      if (!list.length) return;
      let i = list.findIndex((c) => c.id === active);
      if (i < 0) i = 0;
      const ni = (i + delta + list.length) % list.length;
      startTransition(() => setActive(list[ni].id));
    },
    [visibleChapters, active, startTransition]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target) || paletteOpen()) return;
      if (document.documentElement.dataset.session != null) return;
      if (active === "flashcards" && mainTab === "content") return;
      if (e.key === "ArrowLeft") goChapter(-1);
      if (e.key === "ArrowRight") goChapter(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goChapter, active, mainTab]);

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target) || paletteOpen()) return;
      if (document.documentElement.dataset.session != null) return;
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
      if (d?.courseId === "builtin" && d?.chapterId) {
        /* Same path as a rail chapter click — no startTransition — keeps useTransition
         * pending state aligned with rail/palette so skeleton timers always reset. */
        setActive(d.chapterId);
        setMainTab("content");
      }
    };
    window.addEventListener("studyhub-navigate-chapter", onNav);
    return () => window.removeEventListener("studyhub-navigate-chapter", onNav);
  }, []);

  const openSettings = useCallback(() => {
    closeSplit();
    setSettingsOpen(true);
  }, [closeSplit]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    window.addEventListener("studyhub-open-settings", openSettings);
    return () => window.removeEventListener("studyhub-open-settings", openSettings);
  }, [openSettings]);

  useEffect(() => {
    if (splitOpen) setSettingsOpen(false);
  }, [splitOpen]);

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
    const ch = studyBreadcrumbChapter(active, current?.label);
    setBreadcrumb(["OM 300", "EXAM 4 STUDY GUIDE", ch]);
  }, [active, current, setBreadcrumb]);

  const navGroups = useMemo(
    () => builtinCourseNav({ chapters: visibleChapters, completedIds: [...completedIds] }),
    [visibleChapters, completedIds]
  );
  const selectNav = useCallback((id) => {
    setActive(id);
    setMainTab("content");
  }, []);

  useEffect(() => {
    setCourseNav({ courseId: "builtin", groups: navGroups, activeId: active, onSelect: selectNav });
  }, [navGroups, active, selectNav, setCourseNav]);

  useEffect(() => () => setCourseNav(null), [setCourseNav]);

  const chapterHasNotes = useMemo(
    () => studyNoteHasVisibleBody(getStudyChapterNote(active)),
    [active, notesTick]
  );
  const hasContent = useMemo(() => hasStudySectionContent(active), [active]);

  const contentLineHeight = comfortable ? 1.75 : 1.55;

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

  const onDeck = active === "flashcards";
  const navPrefix = navGroups.flatMap((g) => g.items).find((it) => it.id === active)?.prefix ?? "";

  const menu = [
    { label: "Materials", onClick: () => setMaterialsOpen(true) },
    { label: "Course settings…", onClick: openSettings },
    ...(onDeck
      ? [
          { divider: true },
          { label: "Add card", onClick: () => addCardRef.current?.() },
          { label: `Restore seed deck (${SEED_FLASHCARDS.length})`, onClick: deck.restoreSeed },
        ]
      : []),
  ];

  return (
    <>
      <style>{`
        @media print {
          .sh-rail, .sh-plan-dock, .sh-drawer, .sh-topbar, .sh-statusbar, .offcanvas { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
      <div className="sh-plan sh-course sh-app-builtin">
        <div className="sh-plan-col">
          <CourseHeader
            crumb={["OM 300", current ? `${navPrefix} ${current.title}` : ""]}
            title={current?.title ?? "—"}
            tabs={onDeck ? [] : TABS.map((t) => (t.id === "notes" ? { ...t, dot: chapterHasNotes } : t))}
            activeTab={mainTab}
            onTab={setMainTab}
            tabsExtra={
              mainTab === "notes" ? (
                <button
                  type="button"
                  className={`sh-export-btn ${exportStatus === "COPIED" ? "copied" : ""}`}
                  onClick={exportNotes}
                >
                  {exportStatus}
                </button>
              ) : null
            }
            masteryPct={masteryPct}
            menu={menu}
          />
          {onDeck && mainTab === "content" && deck.cards.length ? (
            <div className="sh-deck-modes">
              <DeckModeChips modes={BUILTIN_DECK_MODES} value={deckMode} onChange={setDeckMode} dueCount={deckDue} />
            </div>
          ) : null}
          <div className="sh-main-body" key={`${active}-${mainTab}`}>
            {shellSkelVis ? (
              <ChapterContentSkeleton />
            ) : (
              <>
                {mainTab === "content" ? (
                  showContentSkeleton ? (
                    <ChapterContentSkeleton />
                  ) : onDeck ? (
                    <div className={contentEnterClass}>
                      <DeckList
                        cards={deckCards}
                        onStart={() => setSessionIds(sessionOrder(deckCards, (c) => isCardDue(c)))}
                        onAdd={(front, back) => deck.addCard(front, back)}
                        onEdit={deck.editCard}
                        onDelete={deck.deleteCard}
                        addTriggerRef={addCardRef}
                        emptyLabel={deck.cards.length ? "No cards in this mode." : "Deck is empty. Add a card, or restore the seed deck from the ··· menu."}
                      />
                      {deckSession ? (
                        <Suspense fallback={null}>
                          <FlashcardDeck sourceFilter={deckMode} session={deckSession} />
                        </Suspense>
                      ) : null}
                    </div>
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
                      className={`font-sans ${contentEnterClass}`}
                      style={{ fontSize: `calc(15px * ${fontScale})`, lineHeight: contentLineHeight }}
                    >
                      <StudySectionBody sectionId={active} />
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
        </div>
        <div className="sh-plan-dock">
          <NovaBar courses={novaCourses} placeholder={current ? `Message Nova about ${current.title}…` : undefined} />
        </div>
      </div>

      <SideDrawer open={splitOpen} title="GLOSSARY" onClose={closeSplit}>
        <GlossaryContextBlock />
      </SideDrawer>

      <SideDrawer open={settingsOpen && !splitOpen} title="COURSE SETTINGS" onClose={closeSettings}>
        <div>
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
            {STUDY_CHAPTERS.map((ch) => {
              const enabled = !disabledIds.has(ch.id);
              const onlyOne = STUDY_CHAPTERS.length - disabledIds.size <= 1 && enabled;
              return (
                <label key={ch.id} className="mono d-flex align-items-center gap-2" style={{ fontSize: 11, cursor: onlyOne ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" checked={enabled} disabled={onlyOne} onChange={() => toggleModule(ch.id)} />
                  <span style={{ color: "var(--sh-text-2)" }}>
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
          <label className="mono d-flex align-items-center gap-2 mb-2" style={{ fontSize: 11 }}>
            <input type="checkbox" checked={comfortable} onChange={(e) => setComfortable(e.target.checked)} />
            COMFORT SPACING
          </label>
          <div className="d-flex align-items-center gap-2 mono" style={{ fontSize: 11 }}>
            <span className="sh-kv-key">TEXT</span>
            <button type="button" className="sh-btn-ghost" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep <= 0} onClick={() => setFontStep((s) => Math.max(0, s - 1))}>
              A−
            </button>
            <button type="button" className="sh-btn-ghost" style={{ width: "auto", margin: 0, padding: "4px 8px" }} disabled={fontStep >= FONT_STEPS.length - 1} onClick={() => setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1))}>
              A+
            </button>
          </div>
        </div>
      </SideDrawer>

      <MaterialsOffcanvas show={materialsOpen} onHide={() => setMaterialsOpen(false)} />
    </>
  );
}

export function BuiltinCourseApp({ courseShellLoad = false, onActiveChapterChange, novaCourses, onGoHub }) {
  return (
    <GlossarySplitProvider>
      <BuiltinCourseAppInner courseShellLoad={courseShellLoad} onActiveChapterChange={onActiveChapterChange} novaCourses={novaCourses} onGoHub={onGoHub} />
    </GlossarySplitProvider>
  );
}

export default BuiltinCourseApp;
