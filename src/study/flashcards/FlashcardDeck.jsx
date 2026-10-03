import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RATINGS, daysUntilExam, examForCard, isCardDue, localDateString, previewIntervals, sm2 } from "../sm2.js";
import { emitStudyEvent } from "../../companion/studyEvents.js";
import { filterDeck } from "./deckModes.js";
import { cardKey, useDeckCards } from "./useDeckCards.js";
import { useCourseExams } from "../../features/study/useCourseExams.js";
import { courseStore } from "../../db/courseStore.js";
import { isTypingTarget, paletteOpen } from "../../lib/hotkeys.js";
import { SessionShell } from "../../session/SessionShell.jsx";
import { SessionResults } from "../../session/SessionResults.jsx";
import { cardRunEnd, currentCardId, rateCard, sessionOrder, startCardRun } from "../../session/cardRun.js";
import { masteryDeltas } from "../../session/results.js";

const FLIP_GUARD_MS = 200;

function newSessionId() {
  return `session_${Date.now()}`;
}

function cardStatus(card, examDate) {
  if (!card.next_review && !card.repetitions) return "NEW";
  return isCardDue(card, { examDate }) ? "DUE TODAY" : "REVIEW";
}

function examLabel(days) {
  if (days === 0) return "EXAM TODAY";
  return `EXAM IN ${days} ${days === 1 ? "DAY" : "DAYS"}`;
}

function shortDate(value) {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const d = bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Rated cards whose next review is tomorrow. */
function comeBackCount(reviewed) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = localDateString(d);
  return Object.values(reviewed).filter((day) => day === tomorrow).length;
}

/** With an example, the definition's first sentence is the takeaway. */
function Definition({ text, emphasize }) {
  const m = emphasize ? /^(.+?[.!?])(\s+[\s\S]*)?$/.exec(text) : null;
  if (!m) return <p className="sh-flashcard-def">{text}</p>;
  return (
    <p className="sh-flashcard-def">
      <strong>{m[1]}</strong>
      {m[2] || ""}
    </p>
  );
}

/**
 * A flashcard drill, always as a full-window session. `session.cardIds` is the order to drill;
 * `onExit` closes it, `onToday` goes home, `topicOf(card)` groups the results' mastery change.
 * Storage follows useDeckCards: user decks also write SM-2 to SQLite via db.mastery.
 */
export default function FlashcardDeck({ cards: externalCards = null, onSaveCards = null, courseId = null, moduleId = null, sourceFilter = "all", session }) {
  const { cards, cardsRef, isUserDeck, commit } = useDeckCards({ cards: externalCards, onSaveCards });
  const { exams, examFor } = useCourseExams(isUserDeck ? courseId : null);
  const [run, setRun] = useState(() => startCardRun(session.cardIds));
  const [screen, setScreen] = useState("play");
  const [flipped, setFlipped] = useState(false);
  const [endedAt, setEndedAt] = useState(null);

  const runRef = useRef(run);
  runRef.current = run;
  const lastFlipRef = useRef(0);
  const ratingRef = useRef(false);
  const sessionIdRef = useRef(newSessionId());
  const loggedRef = useRef(false);
  const beforeRef = useRef(null);
  if (!beforeRef.current) {
    const ids = new Set(session.cardIds);
    beforeRef.current = cards.filter((c) => ids.has(cardKey(c)));
  }

  const cardsById = useMemo(() => new Map(cards.map((c) => [cardKey(c), c])), [cards]);
  const card = screen === "play" ? cardsById.get(currentCardId(run)) || null : null;
  const examDate = card ? examFor(card) : null;
  const exam = card && isUserDeck ? examForCard(card, exams) : null;
  const examDays = exam ? daysUntilExam(exam.dueDate) : null;
  const previews = useMemo(() => (card ? previewIntervals(card, { examDate }) : []), [card, examDate]);

  const logSession = useCallback(
    (r) => {
      if (loggedRef.current || !r?.rated) return;
      loggedRef.current = true;
      void courseStore.logStudySession({
        courseUuid: isUserDeck ? courseId : null,
        kind: "drill",
        startedAt: new Date(r.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        reviewed: r.rated,
        correct: r.correct,
        incorrect: r.rated - r.correct,
        bestCombo: r.best,
      });
    },
    [courseId, isUserDeck]
  );

  useEffect(() => () => logSession(runRef.current), [logSession]);

  const finish = useCallback(
    (r) => {
      logSession(r);
      setEndedAt(Date.now());
      setScreen("end");
    },
    [logSession]
  );

  const restart = useCallback(
    (ids) => {
      if (!ids.length) return;
      const set = new Set(ids);
      beforeRef.current = cardsRef.current.filter((c) => set.has(cardKey(c)));
      sessionIdRef.current = newSessionId();
      loggedRef.current = false;
      const next = startCardRun(ids);
      runRef.current = next;
      setRun(next);
      setFlipped(false);
      setEndedAt(null);
      setScreen("play");
    },
    [cardsRef]
  );

  const quit = useCallback(() => {
    if (screen === "end") session.onExit();
    else if (cardRunEnd(runRef.current) === "results") finish(runRef.current);
    else session.onExit();
  }, [screen, session, finish]);

  const flip = useCallback(() => {
    const t = Date.now();
    if (ratingRef.current || t - lastFlipRef.current < FLIP_GUARD_MS) return;
    lastFlipRef.current = t;
    setFlipped((f) => !f);
  }, []);

  const rate = useCallback(
    async (grade) => {
      const r = runRef.current;
      if (!flipped || ratingRef.current || !r || r.done || !card) return;
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
            sessionId: sessionIdRef.current,
          });
        }
        const key = cardKey(card);
        commit(
          cardsRef.current.map((c) =>
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
          )
        );
        emitStudyEvent({ type: "card", correct: grade >= 3 });
        const { run: next, end } = rateCard(r, grade, { nextReview: result.nextReview });
        runRef.current = next;
        setRun(next);
        setFlipped(false);
        if (end) finish(next);
      } finally {
        ratingRef.current = false;
      }
    },
    [flipped, card, examFor, isUserDeck, commit, cardsRef, finish]
  );

  const onKey = useCallback(
    (e) => {
      if (paletteOpen() || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      const flipKey = e.key === " " || e.key === "Enter";
      if (flipKey && e.target?.closest?.("button")) return;
      let handled = true;
      if (e.key === "Escape") quit();
      else if (screen !== "play" || !plain) handled = false;
      else if (ratingRef.current) handled = flipKey || /^[1-4ka]$/.test(k);
      else if (flipKey) flip();
      else if (flipped && /^[1-4]$/.test(k)) void rate(RATINGS[Number(k) - 1].grade);
      else if (flipped && k === "k") void rate(4);
      else if (flipped && k === "a") void rate(1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    [screen, flipped, quit, flip, rate]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKey]);

  const total = run.order.length;
  const counter = `CARD ${Math.max(1, Math.min(screen === "end" ? run.index : run.index + 1, total))}/${total}`;
  const progress = screen === "end" ? run.index / total : (run.index + 1) / total;
  const shieldLabel = screen === "end" && !run.shield.wentDown ? "SHIELDS HELD" : null;

  const anotherRound = () => {
    const filtered = filterDeck(cardsRef.current, sourceFilter, moduleId, { examFor });
    const ids = sessionOrder(filtered, (c) => isCardDue(c, { examDate: examFor(c) }));
    restart(ids.length ? ids : sessionOrder(beforeRef.current, () => true));
  };

  return (
    <SessionShell kind="cards" crumb={session.crumb} shield={run.shield} shieldLabel={shieldLabel} counter={counter} progress={progress} onExit={quit}>
      {card ? (
        <>
          <div
            className="sh-session-panel sh-flashcard"
            data-sprite-avoid
            data-side={flipped ? "back" : "front"}
            role="group"
            aria-label="Flashcard"
            onClick={flipped ? undefined : flip}
          >
            <div className="sh-quiz-head">
              <span>FLASHCARD · {cardStatus(card, examDate)}</span>
              {examDays != null ? <span className="sh-flashcard-exam">{examLabel(examDays)}</span> : null}
            </div>
            {flipped ? (
              <div key="back" className="sh-flashcard-face sh-flashcard-face--back">
                <h2 className="sh-flashcard-term">{card.front}</h2>
                <Definition text={card.back} emphasize={!!card.example} />
                {card.example ? <p className="sh-flashcard-example">{card.example}</p> : null}
              </div>
            ) : (
              <div key="front" className="sh-flashcard-face sh-flashcard-face--front">
                <h2 className="sh-flashcard-term">{card.front}</h2>
                <span className="sh-flashcard-hint">DEFINE IT, THEN FLIP</span>
              </div>
            )}
          </div>
          {flipped ? (
            <div className="sh-ratings" role="group" aria-label="Rate this card">
              {previews.map((p, i) => (
                <button key={p.id} type="button" className="sh-rating" data-rating={p.id} onClick={() => void rate(p.grade)}>
                  <span className="sh-rating-label">{RATINGS[i].label}</span>
                  <span className="sh-rating-key">{p.key}</span>
                  <span className="sh-rating-interval">{p.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="sh-flashcard-actions">
              <button type="button" className="sh-btn-accent sh-session-btn" onClick={flip}>
                Flip
              </button>
              <span className="sh-flashcard-keys">Space to flip</span>
              {exam ? (
                <span className="sh-flashcard-chip">
                  <i aria-hidden="true" />
                  {exam.title} · {shortDate(exam.dueDate)}
                </span>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {screen === "end" ? (
        <SessionResults
          key={run.startedAt}
          crumb={session.crumb}
          shield={run.shield}
          stats={{
            answered: run.rated,
            correct: run.correct,
            best: run.best,
            startedAt: run.startedAt,
            endedAt: endedAt ?? Date.now(),
            wentDown: run.shield.wentDown,
            downCount: run.shield.downCount,
          }}
          comeBack={comeBackCount(run.reviewed)}
          deltas={session.topicOf ? masteryDeltas(beforeRef.current, cards.filter((c) => run.order.includes(cardKey(c))), session.topicOf) : []}
          missedCount={run.misses.length}
          onReviewMissed={() => restart(run.misses)}
          onAnother={anotherRound}
          onToday={session.onToday}
        />
      ) : null}
    </SessionShell>
  );
}
