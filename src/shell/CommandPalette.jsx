import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STUDY_CHAPTERS } from "../study/chapters.js";
import { studySidebarPrefix } from "../study/chapterUiMeta.js";
import { ensureUserCourse } from "../hub/userCourseModel.js";

function matches(query, primary, sub) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const t = `${primary} ${sub}`.toLowerCase();
  return t.includes(q);
}

function termMatches(query, termItem) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    String(termItem.primary || "").toLowerCase().includes(q) ||
    String(termItem.sub || "").toLowerCase().includes(q)
  );
}

function matchHighlightParts(primary, query) {
  const q = query.trim();
  if (!q) return { pre: primary, match: null, post: null };
  const lower = primary.toLowerCase();
  const qi = q.toLowerCase();
  const i = lower.indexOf(qi);
  if (i < 0) return { pre: primary, match: null, post: null };
  return {
    pre: primary.slice(0, i),
    match: primary.slice(i, i + q.length),
    post: primary.slice(i + q.length),
  };
}

function PrimaryLabel({ text, query }) {
  const { pre, match, post } = matchHighlightParts(text, query);
  if (!match) return <span className="sh-palette-row-primary">{text}</span>;
  return (
    <span className="sh-palette-row-primary">
      {pre}
      <span className="sh-palette-match">{match}</span>
      {post}
    </span>
  );
}

const REFERENCE_ENTRIES = [
  { chapterId: "final", primary: "Final Review & Glossary" },
  { chapterId: "formulas", primary: "All Formulas" },
  { chapterId: "flashcards", primary: "Flashcards & Drill" },
];

export function CommandPalette({
  open,
  onClose,
  courseId,
  userCourses,
  onSelectCourse,
  onNavigateCourseChapter,
  onGoToHub,
  onGoToHubAndNewCourse,
  onPickImportFiles,
  onOpenSettings,
  onExport,
  onImportFile,
  onMarkChapterReviewed,
  onShuffleDeck,
  builtinActiveChapter,
}) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const importBackupRef = useRef(null);
  const inputRef = useRef(null);
  const prevFocusRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "");
  const prefixChar = isMac ? "⌘" : "›";

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      setMounted(true);
      setFadeIn(false);
      setQuery("");
      setHighlightedIndex(0);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadeIn(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setFadeIn(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      setQuery("");
      try {
        const el = prevFocusRef.current;
        if (el && typeof el.focus === "function") el.focus();
      } catch {
        /* ignore */
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted || !fadeIn) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mounted, fadeIn]);

  useEffect(() => {
    if (!open) return;
    const activeCourse = userCourses.find((c) => c.id === courseId);
    const activeUserCourse = activeCourse ? ensureUserCourse(activeCourse) : null;
    console.log("[PALETTE] glossary terms available:", activeUserCourse?.glossary?.length);
  }, [open, userCourses, courseId]);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  const indexRows = useMemo(() => {
    const courseRows = [];
    courseRows.push({
      key: "course-builtin",
      group: "courses",
      icon: "◎",
      primary: "OM 300",
      sub: `${STUDY_CHAPTERS.length} MODULES`,
      shortcut: null,
      run: () => onSelectCourse("builtin"),
    });
    for (const c of userCourses) {
      const ec = ensureUserCourse(c);
      const n = ec.modules?.length ?? 0;
      courseRows.push({
        key: `course-${ec.id}`,
        group: "courses",
        icon: "◎",
        primary: ec.name,
        sub: `${n} MODULES`,
        shortcut: null,
        run: () => onSelectCourse(ec.id),
      });
    }

    const chapterRows = [];
    for (const ch of STUDY_CHAPTERS) {
      chapterRows.push({
        key: `ch-builtin-${ch.id}`,
        group: "chapters",
        icon: "CH·",
        primary: ch.title,
        sub: `BUILT-IN · ${studySidebarPrefix(ch.id)}`,
        shortcut: null,
        run: () => onNavigateCourseChapter("builtin", ch.id),
      });
    }
    for (const c of userCourses) {
      const ec = ensureUserCourse(c);
      for (const m of ec.modules || []) {
        chapterRows.push({
          key: `ch-${ec.id}-${m.id}`,
          group: "chapters",
          icon: "CH·",
          primary: m.title || "Section",
          sub: `${ec.name} · ${m.label || "Tab"}`,
          shortcut: null,
          run: () => onNavigateCourseChapter(ec.id, m.id),
        });
      }
    }

    const referenceRows =
      courseId === "builtin"
        ? REFERENCE_ENTRIES.map((r) => ({
            key: `ref-${r.chapterId}`,
            group: "reference",
            icon: "§",
            primary: r.primary,
            sub: `BUILT-IN · ${studySidebarPrefix(r.chapterId)}`,
            shortcut: null,
            run: () => onNavigateCourseChapter("builtin", r.chapterId),
          }))
        : [];

    const termRows = [];
    const activeCourse = userCourses.find((c) => c.id === courseId);
    const activeUserCourse = activeCourse ? ensureUserCourse(activeCourse) : null;
    if (activeUserCourse?.glossary?.length > 0) {
      activeUserCourse.glossary
        .filter((g) => g.confidence !== "low")
        .forEach((g, idx) => {
          const sub = `${String(g.definition || "").slice(0, 60)}${
            String(g.definition || "").length > 60 ? "..." : ""
          }`;
          termRows.push({
            key: `term-${activeUserCourse.id}-${g.id || idx}`,
            group: "terms",
            icon: "◆",
            primary: g.term,
            sub,
            shortcut: null,
            run: () => {
              onNavigateCourseChapter(activeUserCourse.id, g.moduleId);
              window.dispatchEvent(
                new CustomEvent("studyhub-open-content-tab", {
                  detail: { courseId: activeUserCourse.id, moduleId: g.moduleId, tab: "glossary" },
                })
              );
            },
          });
        });
    }

    const inCourse = courseId !== null;
    const shuffleVisible = courseId === "builtin" && builtinActiveChapter === "flashcards";

    const actionRows = [
      {
        key: "act-hub",
        group: "actions",
        icon: "→",
        primary: "Go to Hub",
        sub: "Return to course list",
        shortcut: null,
        visible: true,
        run: () => onGoToHub(),
      },
      {
        key: "act-new",
        group: "actions",
        icon: "→",
        primary: "New Course",
        sub: "Add a course via Express or Manual",
        shortcut: null,
        visible: true,
        run: () => onGoToHubAndNewCourse(),
      },
      {
        key: "act-import-file",
        group: "actions",
        icon: "→",
        primary: "Import File",
        sub: "PPTX · PDF · Blackboard ZIP",
        shortcut: null,
        visible: true,
        run: () => void onPickImportFiles(),
      },
      {
        key: "act-settings",
        group: "actions",
        icon: "→",
        primary: "Open Settings",
        sub: "API key, preferences, backup",
        shortcut: null,
        visible: true,
        run: () => onOpenSettings(),
      },
      {
        key: "act-export",
        group: "actions",
        icon: "→",
        primary: "Export Backup",
        sub: "Save all course data",
        shortcut: null,
        visible: true,
        run: () => onExport(),
      },
      {
        key: "act-import-backup",
        group: "actions",
        icon: "→",
        primary: "Import Backup",
        sub: "Restore from backup file",
        shortcut: null,
        visible: true,
        run: () => {},
      },
      {
        key: "act-mark",
        group: "actions",
        icon: "→",
        primary: "Mark Chapter Reviewed",
        sub: "Toggle current chapter complete",
        shortcut: "⌘R",
        visible: inCourse,
        run: () => onMarkChapterReviewed(),
      },
      {
        key: "act-shuffle",
        group: "actions",
        icon: "→",
        primary: "Shuffle Deck",
        sub: "Randomize flashcard order",
        shortcut: null,
        visible: shuffleVisible,
        run: () => onShuffleDeck(),
      },
    ].filter((a) => a.visible);

    const q = query.trim();
    const filterRow = (r) => matches(q, r.primary, r.sub);

    let coursesF = courseRows.filter(filterRow);
    let chaptersF = chapterRows.filter(filterRow);
    let referenceF = referenceRows.filter(filterRow);
    let actionsF = actionRows.filter(filterRow);
    let termsF = termRows.filter((row) => termMatches(q, row));

    if (!q) {
      coursesF = coursesF.slice(0, 4);
      chaptersF = chaptersF.slice(0, 12);
      referenceF = referenceF.slice(0, 4);
      actionsF = actionsF.slice(0, 4);
      termsF = termsF.slice(0, 4);
    }

    const groups = [
      { key: "courses", label: "COURSES", rows: coursesF },
      { key: "chapters", label: "CHAPTERS", rows: chaptersF },
      { key: "terms", label: "TERMS", rows: termsF },
      { key: "reference", label: "REFERENCE", rows: referenceF },
      { key: "actions", label: "ACTIONS", rows: actionsF },
    ].filter((g) => g.rows.length > 0);

    const flat = groups.flatMap((g) => g.rows);
    return { groups, flat };
  }, [
    query,
    userCourses,
    courseId,
    onSelectCourse,
    onNavigateCourseChapter,
    onGoToHub,
    onGoToHubAndNewCourse,
    onPickImportFiles,
    onOpenSettings,
    onExport,
    onMarkChapterReviewed,
    onShuffleDeck,
    builtinActiveChapter,
  ]);

  const flatRows = indexRows.flat;
  const totalNav = flatRows.length;

  useEffect(() => {
    setHighlightedIndex((i) => {
      const max = Math.max(0, flatRows.length - 1);
      return Math.min(i, max);
    });
  }, [flatRows.length]);

  const executeRow = useCallback(
    (row) => {
      if (!row) return;
      if (row.key === "act-import-backup") {
        importBackupRef.current?.click();
        return;
      }
      row.run();
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        if (!totalNav) return;
        setHighlightedIndex((i) => (i + 1) % totalNav);
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        if (!totalNav) return;
        setHighlightedIndex((i) => (i - 1 + totalNav) % totalNav);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = flatRows[highlightedIndex];
        executeRow(row);
      }
    },
    [onClose, totalNav, flatRows, highlightedIndex, executeRow]
  );

  if (!mounted) return null;

  const emptySearch =
    query.trim().length > 0 &&
    indexRows.groups.length === 0;

  const fadeClass = fadeIn ? "sh-palette-fade-in" : "sh-palette-fade-out";

  return (
    <>
      <div
        className={`sh-palette-backdrop ${fadeClass}`}
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className={`sh-palette ${fadeClass}`}
        data-palette="true"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sh-palette-input-row">
          <span className="sh-palette-prefix mono" aria-hidden>
            {prefixChar}
          </span>
          <input
            ref={inputRef}
            type="search"
            className="sh-palette-input mono"
            placeholder="Search chapters, courses, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="sh-palette-esc-badge mono" aria-hidden>
            ESC
          </span>
        </div>
        <div className="sh-palette-results sh-scroll-hover">
          {emptySearch ? (
            <div className="sh-palette-empty mono">{`NO RESULTS FOR "${query.trim()}"`}</div>
          ) : (
            (() => {
              let navI = 0;
              return indexRows.groups.map((g) => (
                <div key={g.key}>
                  <div className="sh-palette-group-label">{g.label}</div>
                  {g.rows.map((row) => {
                    const globalIdx = navI++;
                    const hi = globalIdx === highlightedIndex;
                    return (
                      <div
                        key={row.key}
                        className={`sh-palette-row sh-palette-row--${row.group} ${hi ? "highlighted" : ""}`}
                        role="option"
                        aria-label={`${row.primary} ${row.sub || ""}`}
                        aria-selected={hi}
                        onMouseEnter={() => setHighlightedIndex(globalIdx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeRow(row)}
                      >
                        <span className="sh-palette-row-icon mono">{row.icon}</span>
                        <div className="sh-palette-row-center">
                          <PrimaryLabel text={row.primary} query={query} />
                          <div className="sh-palette-row-sub mono">{row.sub}</div>
                        </div>
                        {hi && row.shortcut ? <span className="kbd">{row.shortcut}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      </div>
      <input
        ref={importBackupRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = "";
          onClose();
        }}
      />
    </>
  );
}
