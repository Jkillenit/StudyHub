import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studySidebarPrefix } from "../chapterUiMeta.js";
import { useDelayedSkeletonVisible } from "../../hooks/useDelayedSkeletonVisible.js";
import { useFlashcardDeckContext } from "./FlashcardDeckContext.jsx";
import { daysUntilReview, getDueCards, localDateString, sm2 } from "../sm2.js";
import { loadFlashcardDeck, persistFlashcardDeck, resetFlashcardDeckToSeed } from "./flashcardPersistence.js";
import { emitStudyEvent } from "../../companion/studyEvents.js";
import { SEED_FLASHCARDS } from "./seedCards.js";
import { filterDeck } from "./deckModes.js";
import { useCourseExams } from "../../features/study/useCourseExams.js";
import { courseStore } from "../../db/courseStore.js";

const FLIP_GUARD_MS = 200;

function uid() {
  return "fc_" + Math.random().toString(36).slice(2, 12);
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cardKey = (c) => c?.uuid || c?.id;

function cardTypeLabel(kind) {
  if (kind === "formula") return "FORMULA";
  if (kind === "concept") return "CONCEPT";
  if (kind === "definition") return "DEFINITION";
  return null;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function NextReviewSummary({ cards, examFor }) {
  const due = getDueCards(cards || [], { examFor });
  const tomorrow = (cards || []).filter((c) => c.next_review && daysUntilReview(c) === 1);
  if (due.length > 0) {
    return <div className="sh-next-review-text">{due.length} card{due.length !== 1 ? "s" : ""} still due</div>;
  }
  if (tomorrow.length > 0) {
    return (
      <div className="sh-next-review-text">
        {tomorrow.length} card{tomorrow.length !== 1 ? "s" : ""} due tomorrow
      </div>
    );
  }
  const next = (cards || []).filter((c) => c.next_review).sort((a, b) => a.next_review.localeCompare(b.next_review))[0];
  if (next) {
    const days = daysUntilReview(next);
    return (
      <div className="sh-next-review-text" style={{ color: "var(--sh-accent)" }}>
        All caught up · Next review in {days} day{days !== 1 ? "s" : ""}
      </div>
    );
  }
  return (
    <div className="sh-next-review-text" style={{ color: "var(--sh-accent)" }}>
      All caught up
    </div>
  );
}

function SessionSummary({ know, again, cards, examFor, onContinue, onClose }) {
  const score = Math.round((know / (know + again)) * 100) || 0;
  return (
    <div className="sh-session-summary">
      <div className="sh-session-header">
        <div className="sh-section-label">SESSION COMPLETE</div>
      </div>
      <div className="sh-session-stats">
        <div className="sh-stat-row">
          <span className="sh-stat-label">REVIEWED</span>
          <span className="sh-stat-value">{know + again}</span>
        </div>
        <div className="sh-stat-row">
          <span className="sh-stat-label sh-stat-know">KNOW IT</span>
          <span className="sh-stat-value sh-stat-know">{know}</span>
        </div>
        <div className="sh-stat-row">
          <span className="sh-stat-label sh-stat-again">AGAIN</span>
          <span className="sh-stat-value sh-stat-again">{again}</span>
        </div>
        <div className="sh-stat-divider" />
        <div className="sh-stat-row">
          <span className="sh-stat-label">SCORE</span>
          <span
            className="sh-stat-value"
            style={{ color: score >= 80 ? "var(--sh-accent)" : score >= 60 ? "var(--sh-warn)" : "var(--sh-danger)" }}
          >
            {score}%
          </span>
        </div>
      </div>
      <div className="sh-session-next">
        <div className="sh-section-label">NEXT REVIEW</div>
        <NextReviewSummary cards={cards} examFor={examFor} />
      </div>
      <div className="sh-session-actions">
        <button className="sh-btn-ghost" onClick={onContinue}>
          STUDY AGAIN
        </button>
        <button className="sh-btn-ghost sh-btn-green" onClick={onClose}>
          DONE
        </button>
      </div>
    </div>
  );
}

function CardEditor({ initialFront = "", initialBack = "", title, onSave, onCancel }) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const save = () => {
    if (front.trim() && back.trim()) onSave(front.trim(), back.trim());
  };
  return (
    <div
      className="sh-card-edit-overlay"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="sh-section-label" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <input
        autoFocus
        className="sh-inline-edit-input"
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Front"
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="sh-inline-edit-input"
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Back"
        rows={3}
        style={{ marginBottom: 12 }}
      />
      <div className="sh-def-edit-actions">
        <button className="sh-btn-ghost sh-btn-green sh-btn-xs" onClick={save} disabled={!front.trim() || !back.trim()}>
          SAVE
        </button>
        <button className="sh-btn-ghost sh-btn-xs" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

function newSession() {
  return { id: `session_${Date.now()}`, startedAt: new Date().toISOString(), know: 0, again: 0, combo: 0, bestCombo: 0, logged: false };
}

/**
 * Two storage modes:
 *  - user course (onSaveCards given): cards come from props, SM-2 goes to SQLite via db.mastery,
 *    list edits go back through onSaveCards.
 *  - built-in OM 300 deck: cards and SM-2 progress live in localStorage.
 */
export default function FlashcardDeck({
  cards: externalCards = null,
  onSaveCards = null,
  courseId = null,
  moduleId = null,
  showMasteryButtons = true,
  sourceFilter = "all",
  editTriggerRef = null,
}) {
  const isUserDeck = typeof onSaveCards === "function";
  const { setPanelApi } = useFlashcardDeckContext();
  const { examFor } = useCourseExams(isUserDeck ? courseId : null);
  const [cards, setCards] = useState(null);
  const [sessionIds, setSessionIds] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flipPhase, setFlipPhase] = useState(null);
  const [slide, setSlide] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [sessionKnow, setSessionKnow] = useState(0);
  const [sessionAgain, setSessionAgain] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [reviewAgainIds, setReviewAgainIds] = useState([]);
  const [flipReveal, setFlipReveal] = useState(true);
  const [editingCard, setEditingCard] = useState(null);

  const lastFlipRef = useRef(0);
  const ratingRef = useRef(false);
  const cardsRef = useRef(null);
  const sessionRef = useRef(null);
  if (!sessionRef.current) sessionRef.current = newSession();
  cardsRef.current = cards;

  useEffect(() => {
    if (Array.isArray(externalCards)) {
      setCards(externalCards.filter((c) => String(c?.front || "").trim() && String(c?.back || "").trim()));
      return undefined;
    }
    let alive = true;
    const r = requestAnimationFrame(() => {
      if (alive) setCards(loadFlashcardDeck());
    });
    return () => {
      alive = false;
      cancelAnimationFrame(r);
    };
  }, [externalCards]);

  const logSession = useCallback(() => {
    const s = sessionRef.current;
    const reviewed = s.know + s.again;
    if (s.logged || !reviewed) return;
    s.logged = true;
    void courseStore.logStudySession({
      courseUuid: isUserDeck ? courseId : null,
      kind: "drill",
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      reviewed,
      correct: s.know,
      incorrect: s.again,
      bestCombo: s.bestCombo,
    });
  }, [courseId, isUserDeck]);

  const resetSession = useCallback(() => {
    logSession();
    sessionRef.current = newSession();
    setSessionKnow(0);
    setSessionAgain(0);
    setReviewAgainIds([]);
  }, [logSession]);

  useEffect(() => () => logSession(), [logSession]);

  useEffect(() => {
    if (isUserDeck) return undefined;
    const reload = () => setCards(loadFlashcardDeck());
    window.addEventListener("studyhub-flashcards-updated", reload);
    return () => window.removeEventListener("studyhub-flashcards-updated", reload);
  }, [isUserDeck]);

  const cardsById = useMemo(() => new Map((cards || []).map((c) => [cardKey(c), c])), [cards]);
  const filteredCards = useMemo(
    () => filterDeck(cards || [], sourceFilter, moduleId, { examFor }),
    [cards, sourceFilter, moduleId, examFor]
  );

  // The session order is a snapshot: ratings change SM-2 fields (and may drop a card out of DUE)
  // without reshuffling. Only a mode change or adding/removing cards rebuilds it.
  const membershipKey = useMemo(
    () => `${sourceFilter}|${moduleId || ""}|${(cards || []).map(cardKey).sort().join(",")}`,
    [cards, sourceFilter, moduleId]
  );
  const filteredRef = useRef(filteredCards);
  filteredRef.current = filteredCards;
  const rebuildSession = useCallback(() => {
    setSessionIds(shuffled(filteredRef.current.map(cardKey)));
    setPos(0);
    setFlipped(false);
    setFlipPhase(null);
    setSlide(null);
    setShowSummary(false);
  }, []);
  useEffect(() => {
    if (cards === null) return;
    rebuildSession();
  }, [membershipKey, rebuildSession, cards === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionCards = useMemo(() => sessionIds.map((id) => cardsById.get(id)).filter(Boolean), [sessionIds, cardsById]);
  const n = sessionCards.length;
  const current = sessionCards[Math.min(pos, Math.max(n - 1, 0))] ?? null;

  const deckHydrating = cards === null;
  const showDeckSkel = useDelayedSkeletonVisible(deckHydrating, deckHydrating ? "deck" : "");

  useEffect(() => {
    if (editTriggerRef) {
      editTriggerRef.current = () => {
        if (current) setEditingCard({ ...current });
      };
    }
  }, [current, editTriggerRef]);

  useEffect(() => {
    setFlipped(false);
  }, [pos]);

  // User decks hand every change to the parent so course state keeps the latest SM-2 fields;
  // the course save queue skips the write when only mastery (stored separately) changed.
  const commitCards = useCallback(
    (next) => {
      setCards(next);
      if (isUserDeck) onSaveCards(next);
      else persistFlashcardDeck(next);
    },
    [isUserDeck, onSaveCards]
  );

  const startSlide = useCallback(
    (delta) => {
      if (flipPhase || slide || !n) return;
      if (delta > 0 && pos + 1 >= n) {
        setShowSummary(true);
        logSession();
        return;
      }
      const newPos = Math.min(Math.max(pos + delta, 0), n - 1);
      if (newPos === pos) return;
      setSlide({ fromPos: pos, toPos: newPos, dir: delta > 0 ? 1 : -1 });
    },
    [flipPhase, slide, pos, n, logSession]
  );

  useEffect(() => {
    if (!slide) return undefined;
    const t = window.setTimeout(() => {
      setPos(slide.toPos);
      setSlide(null);
      setFlipped(false);
      setFlipPhase(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [slide]);

  useEffect(() => {
    if (flipPhase !== "out") return undefined;
    const t = window.setTimeout(() => {
      setFlipped((f) => !f);
      setFlipPhase("in");
    }, 60);
    return () => window.clearTimeout(t);
  }, [flipPhase]);

  useEffect(() => {
    if (flipPhase !== "in") {
      setFlipReveal(true);
      return undefined;
    }
    setFlipReveal(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setFlipReveal(true));
    });
    const t = window.setTimeout(() => setFlipPhase(null), 80);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [flipPhase]);

  const shuffleDeck = useCallback(() => {
    if (!n) return;
    setSessionIds((ids) => shuffled(ids));
    setPos(0);
    setFlipped(false);
    setFlipPhase(null);
    setSlide(null);
  }, [n]);

  useEffect(() => {
    const fn = () => shuffleDeck();
    window.addEventListener("studyhub-shuffle-flashcards", fn);
    return () => window.removeEventListener("studyhub-shuffle-flashcards", fn);
  }, [shuffleDeck]);

  const addCardWith = useCallback(
    (front, back) => {
      const card = { id: uid(), front, back, source: "manual", ...(moduleId ? { moduleId } : {}) };
      commitCards([...(cardsRef.current || []), card]);
    },
    [commitCards, moduleId]
  );

  const addCard = useCallback(() => {
    const f = newFront.trim();
    const b = newBack.trim();
    if (!f || !b) return;
    addCardWith(f, b);
    setNewFront("");
    setNewBack("");
    setShowAdd(false);
  }, [newFront, newBack, addCardWith]);

  const deleteCurrent = useCallback(() => {
    if (!current || !window.confirm("Remove this card from your deck?")) return;
    commitCards((cardsRef.current || []).filter((c) => cardKey(c) !== cardKey(current)));
  }, [current, commitCards]);

  const saveEdit = useCallback(
    (front, back) => {
      const key = cardKey(editingCard);
      commitCards((cardsRef.current || []).map((c) => (cardKey(c) === key ? { ...c, front, back } : c)));
      setEditingCard(null);
    },
    [editingCard, commitCards]
  );

  const restoreSeed = useCallback(() => {
    if (isUserDeck) return;
    if (!window.confirm("Replace your entire flashcard deck with the starter set? Custom cards will be removed.")) return;
    setCards(resetFlashcardDeckToSeed());
  }, [isUserDeck]);

  const beginFlip = useCallback(() => {
    if (!n || slide || flipPhase || editingCard) return;
    const now = Date.now();
    if (now - lastFlipRef.current < FLIP_GUARD_MS) return;
    lastFlipRef.current = now;
    setFlipPhase("out");
  }, [n, slide, flipPhase, editingCard]);

  const rate = useCallback(
    async (grade) => {
      if (!flipped || flipPhase || slide || ratingRef.current) return;
      const card = current;
      if (!card) return;
      ratingRef.current = true;
      try {
        const result = sm2(card, grade, { examDate: examFor(card) });
        if (isUserDeck) {
          await window.studyHub?.db?.mastery?.update?.({
            flashcardUuid: cardKey(card),
            grade,
            easeFactor: result.easeFactor,
            intervalDays: result.intervalDays,
            repetitions: result.repetitions,
            nextReview: result.nextReview,
            sessionId: sessionRef.current.id,
          });
        }
        const key = cardKey(card);
        const next = (cardsRef.current || []).map((c) =>
          cardKey(c) === key
            ? {
                ...c,
                easeFactor: result.easeFactor,
                intervalDays: result.intervalDays,
                repetitions: result.repetitions,
                next_review: result.nextReview,
                lastReview: localDateString(),
                lastGrade: grade,
              }
            : c
        );
        commitCards(next);
        emitStudyEvent({ type: "card", correct: grade >= 3 });
        const s = sessionRef.current;
        if (grade >= 3) {
          s.know += 1;
          s.combo += 1;
          s.bestCombo = Math.max(s.bestCombo, s.combo);
          setSessionKnow((c) => c + 1);
        } else {
          s.again += 1;
          s.combo = 0;
          setSessionAgain((c) => c + 1);
          setReviewAgainIds((ids) => (ids.includes(key) ? ids : [...ids, key]));
        }
        startSlide(1);
      } finally {
        ratingRef.current = false;
      }
    },
    [flipped, flipPhase, slide, current, isUserDeck, commitCards, startSlide, examFor]
  );

  const onKnowIt = useCallback(() => void rate(5), [rate]);
  const onAgain = useCallback(() => void rate(0), [rate]);

  const handleKeyDown = useCallback(
    (e) => {
      if (document.querySelector('.sh-palette, .sh-cmd-palette, [data-palette="true"]')) return;
      if (isTypingTarget(document.activeElement) || editingCard || showSummary) return;
      if (slide || flipPhase || ratingRef.current) {
        if (e.key === " " || e.key === "Enter") e.preventDefault();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        beginFlip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        startSlide(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        startSlide(-1);
      } else if (!e.metaKey && !e.ctrlKey && flipped && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onKnowIt();
      } else if (!e.metaKey && !e.ctrlKey && flipped && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        onAgain();
      }
    },
    [slide, flipPhase, beginFlip, startSlide, flipped, onKnowIt, onAgain, editingCard, showSummary]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const progressDisplayPos = slide ? slide.toPos : pos;
  const progressText = n
    ? `${String(progressDisplayPos + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`
    : "00 / 00";
  const fillPct = n ? ((progressDisplayPos + 1) / n) * 100 : 0;
  const chapterTag = studySidebarPrefix("flashcards");
  const typeTag = current?.kind ? cardTypeLabel(current.kind) : null;

  const bodyOpacity = flipPhase === "out" || (flipPhase === "in" && !flipReveal) ? 0 : 1;
  const bodyTransition = flipPhase === "out" ? "opacity 60ms linear" : "opacity 80ms linear";
  const masteryVisible = showMasteryButtons && flipped && flipPhase === null && !slide;

  useEffect(() => {
    if (isUserDeck) return;
    setPanelApi({
      n: (cards || []).length,
      showAdd,
      setShowAdd,
      newFront,
      setNewFront,
      newBack,
      setNewBack,
      addCard,
      restoreSeed,
      deleteCurrent,
      seedLen: SEED_FLASHCARDS.length,
    });
  }, [isUserDeck, setPanelApi, cards, showAdd, newFront, newBack, addCard, restoreSeed, deleteCurrent]);

  useEffect(() => () => setPanelApi(null), [setPanelApi]);

  const emptyMessage =
    (cards || []).length === 0
      ? "DECK IS EMPTY"
      : sourceFilter === "due"
        ? "NOTHING DUE"
        : sourceFilter === "weak"
          ? "NO WEAK CARDS"
          : "NO CARDS HERE";

  return (
    <div className="drill-root font-sans">
      <header className="drill-header">
        <div className="drill-header-left">
          <span className="drill-header-ch">{chapterTag}</span>
          {typeTag ? <span className="drill-header-type">{typeTag}</span> : null}
        </div>
        <div className="drill-header-spacer" aria-hidden />
        <div className="drill-header-progress mono">{progressText}</div>
      </header>

      {showAdd && isUserDeck ? (
        <div className="drill-card">
          <CardEditor
            title="NEW CARD"
            onSave={(front, back) => {
              addCardWith(front, back);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      ) : deckHydrating && showDeckSkel ? (
        <div className="drill-card-skel">
          <div className="drill-card-skel-body">
            <div className="sh-skeleton sh-skeleton--raised drill-card-skel-term" />
            <div className="sh-skeleton drill-card-skel-sub" />
          </div>
          <div className="drill-card-skel-footer">
            <div className="sh-skeleton drill-card-skel-track" />
            <div className="sh-skeleton drill-card-skel-label" />
          </div>
        </div>
      ) : deckHydrating ? null : !n ? (
        <div className="drill-empty">
          <pre className="sh-empty-ascii-box">{`┌─────────────────────┐
│   ${emptyMessage.padEnd(18)}│
│                     │
│   ADD A CARD  →     │
└─────────────────────┘`}</pre>
          <div className="sh-empty-actions">
            <button type="button" className="sh-btn-ghost ctx-btn" onClick={() => setShowAdd(true)}>
              + ADD CARD
            </button>
            {!isUserDeck ? (
              <button type="button" className="sh-btn-ghost drill-deck-restore ctx-btn" onClick={restoreSeed}>
                LOAD SEED DECK
              </button>
            ) : null}
          </div>
        </div>
      ) : showSummary ? (
        <SessionSummary
          know={sessionKnow}
          again={sessionAgain}
          cards={cards || []}
          examFor={examFor}
          onContinue={() => {
            resetSession();
            rebuildSession();
          }}
          onClose={() => {
            resetSession();
            setShowSummary(false);
            setPos(0);
          }}
        />
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            className={`drill-card ${flipped ? "drill-card--flipped" : ""}`}
            onClick={beginFlip}
            aria-label={flipped ? "Show question" : "Show answer"}
          >
            <div className="drill-card-body-wrap">
              {editingCard ? (
                <CardEditor
                  title="EDIT CARD"
                  initialFront={editingCard.front}
                  initialBack={editingCard.back}
                  onSave={saveEdit}
                  onCancel={() => setEditingCard(null)}
                />
              ) : null}
              {slide ? (
                <div className="drill-slide-stack">
                  <div
                    className={`drill-slide-layer drill-slide-exit drill-slide-exit--${slide.dir > 0 ? "next" : "prev"}`}
                    aria-hidden
                  >
                    <div className="drill-face drill-face--front">
                      <div className="drill-term">{sessionCards[slide.fromPos]?.front}</div>
                    </div>
                  </div>
                  <div className={`drill-slide-layer drill-slide-enter drill-slide-enter--${slide.dir > 0 ? "next" : "prev"}`}>
                    <div className="drill-face drill-face--front">
                      <div className="drill-term">{sessionCards[slide.toPos]?.front}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`drill-card-body ${flipped ? "drill-card-body--backface" : ""}`}
                  style={{ opacity: bodyOpacity, transition: bodyTransition }}
                >
                  <div className={`drill-face ${flipped ? "drill-face--back" : "drill-face--front"}`}>
                    <div className="drill-term">{flipped ? current?.back : current?.front}</div>
                  </div>
                </div>
              )}
            </div>
            <footer className="drill-card-footer">
              <div className="drill-card-track">
                <div className="drill-card-fill" style={{ width: `${fillPct}%` }} />
              </div>
              <span className={`drill-card-face-label ${flipped ? "drill-card-face-label--back" : ""}`}>
                {flipped ? "BACK" : "FRONT"}
              </span>
            </footer>
          </div>

          {showMasteryButtons ? (
            <div
              className="drill-mastery"
              style={{
                opacity: masteryVisible ? 1 : 0,
                pointerEvents: masteryVisible ? "auto" : "none",
                transition: "opacity 80ms linear",
              }}
            >
              <div className="drill-mastery-inner">
                <button type="button" className="drill-btn-know" onClick={onKnowIt}>
                  KNOW IT
                </button>
                <button type="button" className="drill-btn-again" onClick={onAgain}>
                  AGAIN
                </button>
              </div>
              <p className="drill-mastery-stats mono">
                <span>✓ {sessionKnow}</span>
                <span className="drill-mastery-stats-gap">↻ {sessionAgain}</span>
                {reviewAgainIds.length > 0 ? (
                  <span className="drill-mastery-stats-gap">· {reviewAgainIds.length} weak</span>
                ) : null}
              </p>
            </div>
          ) : null}
        </>
      )}

      <nav className="drill-nav" aria-label="Card navigation">
        <button type="button" className="drill-nav-btn" onClick={() => startSlide(-1)} disabled={!n || deckHydrating}>
          ← PREV
        </button>
        <button type="button" className="drill-nav-btn" onClick={shuffleDeck} disabled={!n || deckHydrating}>
          SHUFFLE
        </button>
        <button type="button" className="drill-nav-btn" onClick={() => startSlide(1)} disabled={!n || deckHydrating}>
          NEXT →
        </button>
      </nav>
      {isUserDeck ? (
        <nav className="drill-nav" aria-label="Deck editing">
          <button type="button" className="drill-nav-btn" onClick={() => setShowAdd(true)}>
            + ADD
          </button>
          <button type="button" className="drill-nav-btn" onClick={() => current && setEditingCard({ ...current })} disabled={!current}>
            EDIT
          </button>
          <button type="button" className="drill-nav-btn" onClick={deleteCurrent} disabled={!current}>
            DELETE
          </button>
        </nav>
      ) : null}
      <p className="drill-nav-hint mono">SPACE · FLIP &nbsp;&nbsp; ← → · NAV &nbsp;&nbsp; K · KNOW &nbsp;&nbsp; A · AGAIN</p>
    </div>
  );
}
