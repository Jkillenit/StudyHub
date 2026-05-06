import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studySidebarPrefix } from "../chapterUiMeta.js";
import { useDelayedSkeletonVisible } from "../../hooks/useDelayedSkeletonVisible.js";
import { useFlashcardDeckContext } from "./FlashcardDeckContext.jsx";
import { daysUntilReview, getDueCards, sm2 } from "../sm2.js";
import {
  loadFlashcardDeck,
  persistFlashcardDeck,
  resetFlashcardDeckToSeed,
} from "./flashcardPersistence.js";
import { SEED_FLASHCARDS } from "./seedCards.js";

function uid() {
  return "fc_" + Math.random().toString(36).slice(2, 12);
}

function shuffleOrder(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardTypeLabel(kind) {
  if (kind === "formula") return "FORMULA";
  if (kind === "concept") return "CONCEPT";
  if (kind === "definition") return "DEFINITION";
  return null;
}

function NextReviewSummary({ cards }) {
  const due = getDueCards(cards || []);
  const tomorrow = (cards || []).filter((c) => daysUntilReview(c) === 1);

  if (due.length > 0) {
    return (
      <div className="sh-next-review-text">
        {due.length} card{due.length !== 1 ? "s" : ""} still due
      </div>
    );
  }

  if (tomorrow.length > 0) {
    return (
      <div className="sh-next-review-text">
        {tomorrow.length} card{tomorrow.length !== 1 ? "s" : ""} due tomorrow
      </div>
    );
  }

  const next = (cards || [])
    .filter((c) => c.next_review)
    .sort((a, b) => a.next_review.localeCompare(b.next_review))[0];

  if (next) {
    const days = daysUntilReview(next);
    return (
      <div className="sh-next-review-text" style={{ color: "var(--sh-green)" }}>
        All caught up · Next review in {days} day{days !== 1 ? "s" : ""}
      </div>
    );
  }

  return (
    <div className="sh-next-review-text" style={{ color: "var(--sh-green)" }}>
      All caught up
    </div>
  );
}

function SessionSummary({ know, again, cards, onContinue, onClose }) {
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
            style={{
              color: score >= 80 ? "var(--sh-green)" : score >= 60 ? "var(--sh-amber)" : "var(--sh-red)",
            }}
          >
            {score}%
          </span>
        </div>
      </div>

      <div className="sh-session-next">
        <div className="sh-section-label">NEXT REVIEW</div>
        <NextReviewSummary cards={cards} />
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

export default function FlashcardDeck({
  cards: externalCards = null,
  onSaveCards = null,
  courseId = null,
  showMasteryButtons = true,
  sourceFilter = "all",
  onSourceFilterChange = null,
}) {
  void courseId;
  void onSourceFilterChange;
  const { setPanelApi } = useFlashcardDeckContext();
  const [cards, setCards] = useState(null);
  const [order, setOrder] = useState([]);
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

  const nRef = useRef(0);
  const syncingFromExternalRef = useRef(false);
  const lastFlipRef = useRef(0);
  const sessionIdRef = useRef(`session_${Date.now()}`);
  const pendingUpdatesRef = useRef([]);
  const cardCountRef = useRef(0);

  useEffect(() => {
    if (Array.isArray(externalCards)) {
      syncingFromExternalRef.current = true;
      const validCards = externalCards
        .filter((c) => String(c?.front || "").trim() && String(c?.back || "").trim())
        .map((c) => ({ ...c }));
      const next = validCards;
      setCards(next);
      return;
    }
    let alive = true;
    const r = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!alive) return;
        const next = loadFlashcardDeck();
        setCards(next);
      });
    });
    return () => {
      alive = false;
      cancelAnimationFrame(r);
    };
  }, [externalCards]);

  const deckHydrating = cards === null;
  const showDeckSkel = useDelayedSkeletonVisible(deckHydrating, deckHydrating ? "deck" : "");

  useEffect(() => {
    if (cards == null) return;
    if (syncingFromExternalRef.current) {
      syncingFromExternalRef.current = false;
      return;
    }
    if (typeof onSaveCards !== "function") persistFlashcardDeck(cards);
  }, [cards, onSaveCards]);

  useEffect(
    () => () => {
      if (pendingUpdatesRef.current.length > 0) onSaveCards?.(pendingUpdatesRef.current);
    },
    [onSaveCards]
  );

  useEffect(() => {
    const reload = () => {
      const next = loadFlashcardDeck();
      setCards(next);
      setOrder(shuffleOrder(next.length));
      setPos(0);
      setFlipped(false);
      setFlipPhase(null);
      setSlide(null);
      setSessionKnow(0);
      setSessionAgain(0);
      setReviewAgainIds([]);
      setShowSummary(false);
    };
    window.addEventListener("studyhub-flashcards-updated", reload);
    return () => window.removeEventListener("studyhub-flashcards-updated", reload);
  }, []);

  const filteredCards = useMemo(() => {
    let base = cards || [];
    if (sourceFilter === "manual") {
      base = base.filter((c) => (c.source || "manual") === "manual");
    } else if (sourceFilter === "pptx") {
      base = base.filter((c) => c.source === "pptx");
    } else if (sourceFilter === "due") {
      base = getDueCards(base);
    }
    return base;
  }, [cards, sourceFilter]);

  const n = filteredCards.length;
  const idx = order.length ? order[Math.min(pos, order.length - 1)] ?? order[0] : 0;
  const current = filteredCards[idx] ?? null;

  nRef.current = n;

  useEffect(() => {
    if (!n) {
      setPos(0);
      return;
    }
    setPos((p) => (p >= n ? 0 : p));
  }, [n]);

  useEffect(() => {
    setOrder(shuffleOrder(filteredCards.length));
    setPos(0);
    setFlipped(false);
    setFlipPhase(null);
    setSlide(null);
    setShowSummary(false);
  }, [filteredCards.length, sourceFilter]);

  useEffect(() => {
    setFlipped(false);
  }, [pos, idx]);

  const reorderForLength = useCallback((len) => {
    if (len === 0) {
      setOrder([]);
      setPos(0);
      return;
    }
    setOrder(shuffleOrder(len));
    setPos(0);
  }, []);

  const startSlide = useCallback((delta) => {
    if (flipPhase || slide) return;
    const len = nRef.current;
    if (!len) return;
    if (delta > 0 && pos + 1 >= len) {
      if (pendingUpdatesRef.current.length > 0) onSaveCards?.(pendingUpdatesRef.current);
      setShowSummary(true);
      return;
    }
    const newPos = Math.min(Math.max(pos + delta, 0), len - 1);
    if (newPos === pos) return;
    setSlide({ fromPos: pos, toPos: newPos, dir: delta > 0 ? 1 : -1 });
  }, [flipPhase, slide, pos, onSaveCards]);

  useEffect(() => {
    if (!slide) return;
    const t = window.setTimeout(() => {
      setPos(slide.toPos);
      setSlide(null);
      setFlipped(false);
      setFlipPhase(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [slide]);

  useEffect(() => {
    if (flipPhase !== "out") return;
    const t = window.setTimeout(() => {
      setFlipped((f) => !f);
      setFlipPhase("in");
    }, 60);
    return () => window.clearTimeout(t);
  }, [flipPhase]);

  useEffect(() => {
    if (flipPhase !== "in") {
      setFlipReveal(true);
      return;
    }
    setFlipReveal(false);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
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
    const len = nRef.current;
    if (!len) return;
    setOrder(shuffleOrder(len));
    setPos(0);
    setFlipped(false);
    setFlipPhase(null);
    setSlide(null);
  }, []);

  useEffect(() => {
    const fn = () => shuffleDeck();
    window.addEventListener("studyhub-shuffle-flashcards", fn);
    return () => window.removeEventListener("studyhub-shuffle-flashcards", fn);
  }, [shuffleDeck]);

  const addCard = useCallback(() => {
    const f = newFront.trim();
    const b = newBack.trim();
    if (!f || !b) return;
    const next = [...cards, { id: uid(), front: f, back: b }];
    setCards(next);
    reorderForLength(next.length);
    setNewFront("");
    setNewBack("");
    setShowAdd(false);
    setFlipped(false);
    setFlipPhase(null);
  }, [cards, newFront, newBack, reorderForLength]);

  const deleteCurrent = useCallback(() => {
    if (!current || !window.confirm("Remove this card from your deck?")) return;
    const next = cards.filter((c) => c.id !== current.id);
    setCards(next);
    reorderForLength(next.length);
  }, [cards, current, reorderForLength]);

  const restoreSeed = useCallback(() => {
    if (!window.confirm("Replace your entire flashcard deck with the starter set? Custom cards will be removed.")) return;
    const next = resetFlashcardDeckToSeed();
    setCards(next);
    reorderForLength(next.length);
  }, [reorderForLength]);

  const beginFlip = useCallback(() => {
    if (!nRef.current || slide || flipPhase) return;
    const now = Date.now();
    if (now - lastFlipRef.current < 200) return;
    lastFlipRef.current = now;
    setFlipPhase("out");
  }, [slide, flipPhase]);

  const onKnowIt = useCallback(async () => {
    if (!flipped || flipPhase) return;
    const card = current;
    if (!card) return;

    const result = sm2(card, 5);
    if (window.studyHub?.db?.mastery?.update) {
      await window.studyHub.db.mastery.update({
        flashcardUuid: card.uuid || card.id,
        grade: 5,
        easeFactor: result.easeFactor,
        intervalDays: result.intervalDays,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        sessionId: sessionIdRef.current,
      });
    }
    const updatedCards = (cards || []).map((c) => {
      if ((c.uuid || c.id) === (card.uuid || card.id)) {
        return {
          ...c,
          easeFactor: result.easeFactor,
          intervalDays: result.intervalDays,
          repetitions: result.repetitions,
          next_review: result.nextReview,
        };
      }
      return c;
    });
    setCards(updatedCards);
    pendingUpdatesRef.current = updatedCards;
    cardCountRef.current += 1;
    if (cardCountRef.current % 5 === 0) onSaveCards?.(pendingUpdatesRef.current);
    setSessionKnow((c) => c + 1);
    startSlide(1);
  }, [flipped, flipPhase, current, cards, onSaveCards, startSlide]);

  const onAgain = useCallback(async () => {
    if (!flipped || flipPhase) return;
    const card = current;
    if (!card) return;

    const result = sm2(card, 0);
    if (window.studyHub?.db?.mastery?.update) {
      await window.studyHub.db.mastery.update({
        flashcardUuid: card.uuid || card.id,
        grade: 0,
        easeFactor: result.easeFactor,
        intervalDays: result.intervalDays,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        sessionId: sessionIdRef.current,
      });
    }
    const updatedCards = (cards || []).map((c) => {
      if ((c.uuid || c.id) === (card.uuid || card.id)) {
        return {
          ...c,
          easeFactor: result.easeFactor,
          intervalDays: result.intervalDays,
          repetitions: result.repetitions,
          next_review: result.nextReview,
        };
      }
      return c;
    });
    setCards(updatedCards);
    pendingUpdatesRef.current = updatedCards;
    cardCountRef.current += 1;
    if (cardCountRef.current % 5 === 0) onSaveCards?.(pendingUpdatesRef.current);
    setSessionAgain((c) => c + 1);
    if (card?.id) {
      setReviewAgainIds((ids) => (ids.includes(card.id) ? ids : [...ids, card.id]));
    }
    startSlide(1);
  }, [flipped, flipPhase, current, cards, onSaveCards, startSlide]);

  const handleKeyDown = useCallback(
    (e) => {
      // Do not handle keys when command palette is open
      if (
        document.querySelector(
          '.sh-palette, .sh-cmd-palette, ' +
            '[data-palette="true"]'
        )
      )
        return;

      // Do not handle keys when focus is in an input
      const tag = document.activeElement?.tagName;
      const isEditable =
        document.activeElement?.contentEditable === "true";
      if (tag === "INPUT" || tag === "TEXTAREA" || isEditable) return;

      if (slide || flipPhase) {
        if (e.key === " " || e.key === "Enter") e.preventDefault();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        beginFlip();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        startSlide(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        startSlide(-1);
      }
      if (!e.metaKey && !e.ctrlKey && flipped && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onKnowIt();
      }
      if (!e.metaKey && !e.ctrlKey && flipped && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        onAgain();
      }
    },
    [slide, flipPhase, beginFlip, startSlide, flipped, onKnowIt, onAgain]
  );

  const handleKeyDownStable = useCallback(handleKeyDown, [handleKeyDown]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDownStable);
    return () => {
      document.removeEventListener("keydown", handleKeyDownStable);
    };
  }, [handleKeyDownStable]);

  const progressDisplayPos = slide ? slide.toPos : pos;
  const progressText = useMemo(() => {
    if (!n) return "00 / 00";
    const a = String(progressDisplayPos + 1).padStart(2, "0");
    const b = String(n).padStart(2, "0");
    return `${a} / ${b}`;
  }, [n, progressDisplayPos]);

  const fillPct = n ? ((progressDisplayPos + 1) / n) * 100 : 0;

  const chapterTag = studySidebarPrefix("flashcards");
  const typeTag = current?.kind ? cardTypeLabel(current.kind) : null;

  useEffect(() => {
    if (!current?.front) return;
    console.log("[QZ] Front render class:", "check DOM inspector");
  }, [current?.front]);

  const cardAtOrderPos = (p) => {
    if (!order.length || !filteredCards.length) return null;
    const i = order[Math.min(p, order.length - 1)] ?? order[0];
    return filteredCards[i] ?? null;
  };

  const bodyOpacity = flipPhase === "out" || (flipPhase === "in" && !flipReveal) ? 0 : 1;
  const bodyTransition = flipPhase === "out" ? "opacity 60ms linear" : "opacity 80ms linear";
  const masteryVisible = showMasteryButtons && flipped && flipPhase === null && !slide;

  useEffect(() => {
    setPanelApi({
      n,
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
  }, [setPanelApi, n, showAdd, newFront, newBack, addCard, restoreSeed, deleteCurrent]);

  useEffect(() => () => setPanelApi(null), [setPanelApi]);

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

      {deckHydrating && showDeckSkel ? (
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
│   DECK IS EMPTY     │
│                      │
│   ADD A CARD  →     │
└─────────────────────┘`}</pre>
          <div className="sh-empty-actions">
            <button
              type="button"
              className="sh-btn-ghost ctx-btn"
              onClick={() => {
                setShowAdd(true);
              }}
            >
              + ADD CARD
            </button>
            <button type="button" className="sh-btn-ghost drill-deck-restore ctx-btn" onClick={restoreSeed}>
              LOAD SEED DECK
            </button>
          </div>
        </div>
      ) : (
        <>
          {showSummary ? (
            <SessionSummary
              know={sessionKnow}
              again={sessionAgain}
              cards={cards || []}
              onContinue={() => {
                setShowSummary(false);
                setOrder(shuffleOrder(n));
                setPos(0);
                setSessionKnow(0);
                setSessionAgain(0);
                setReviewAgainIds([]);
                setFlipped(false);
              }}
              onClose={() => {
                setShowSummary(false);
                setSessionKnow(0);
                setSessionAgain(0);
                setReviewAgainIds([]);
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
                  {slide ? (
                    <div className="drill-slide-stack">
                      <div
                        className={`drill-slide-layer drill-slide-exit drill-slide-exit--${slide.dir > 0 ? "next" : "prev"}`}
                        aria-hidden
                      >
                        <div className="drill-face drill-face--front">
                          <div className="drill-term">{cardAtOrderPos(slide.fromPos)?.front}</div>
                        </div>
                      </div>
                      <div
                        className={`drill-slide-layer drill-slide-enter drill-slide-enter--${slide.dir > 0 ? "next" : "prev"}`}
                      >
                        <div className="drill-face drill-face--front">
                          <div className="drill-term">{cardAtOrderPos(slide.toPos)?.front}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`drill-card-body ${flipped ? "drill-card-body--backface" : ""}`}
                      style={{
                        opacity: bodyOpacity,
                        transition: bodyTransition,
                      }}
                    >
                      {!flipped ? (
                        <div className="drill-face drill-face--front">
                          <div className="drill-term">{current?.front}</div>
                        </div>
                      ) : (
                        <div className="drill-face drill-face--back">
                          <div className="drill-term">{current?.back}</div>
                        </div>
                      )}
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
      <p className="drill-nav-hint mono">SPACE · FLIP &nbsp;&nbsp; ← → · NAV &nbsp;&nbsp; K · KNOW &nbsp;&nbsp; A · AGAIN</p>
    </div>
  );
}
