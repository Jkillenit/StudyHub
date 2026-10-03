import { useCallback, useMemo, useRef, useState } from "react";
import { character, line, finishKey, isFailing } from "../character.js";
import { levelForXp, isRampant } from "../companionStore.js";
import { loadFlashcardDeck, persistFlashcardDeck } from "../../study/flashcards/flashcardPersistence.js";
import { courseStore } from "../../db/courseStore.js";
import { cardKey, runAwards } from "../lightRun.js";
import { clampPoint } from "../safeZones.js";
import { builtinCourse } from "../layer/geometry.js";
import { BUILTIN_ID, ENGAGED_SPEED, QUIZ_W } from "../layer/constants.js";

/** Quiz: she docks beside the quiz panel, reacts to each answer, and saves the run. */
export function useNovaQuiz(core, { courses, awardXp, returnHome, setHelp, setMarks, onUpdateCourse }) {
  const { stateRef, modeRef, navRef, send, setBubble, say, setMood, update, cancel, flyTo, sizeRef, setFacing, setAnchor, sfx, playGesture, flashReaction } = core;
  const [glow, setGlow] = useState(1);
  const [quizDeck, setQuizDeck] = useState("all");
  const [builtinCards, setBuiltinCards] = useState(loadFlashcardDeck);
  const lastTierRef = useRef(null);
  const quizRef = useRef({ sessionId: null, pending: new Map(), answered: 0, correct: 0, missStreak: 0 });

  const quizCourses = useMemo(
    () => (builtinCards.length ? [...courses, builtinCourse(builtinCards)] : courses),
    [courses, builtinCards]
  );

  const dockPoint = useCallback(() => {
    const s = sizeRef.current;
    const panelLeft = window.innerWidth - 16 - QUIZ_W;
    return clampPoint({ x: panelLeft - s - 18, y: 110 }, s);
  }, []);

  const startQuiz = useCallback(
    async (deckId) => {
      const nav = navRef.current;
      const fresh = loadFlashcardDeck();
      setBuiltinCards(fresh);
      const pool = [...nav.courses, builtinCourse(fresh)];
      const hasCards = (id) => pool.some((c) => c.id === id && (c.flashcards || []).length);
      const deck = deckId && hasCards(deckId) ? deckId : hasCards(nav.activeCourseId) ? nav.activeCourseId : "all";
      setBubble(null);
      setHelp(null);
      setMarks([]);
      cancel();
      if (send("QUIZ") !== "quiz") return;
      quizRef.current = { sessionId: `quiz_${Date.now()}`, pending: new Map(), answered: 0, correct: 0, missStreak: 0 };
      if (stateRef.current?.ignored) update({ ignored: 0 });
      setQuizDeck(deck);
      setGlow(1);
      setMood("excited");
      if (navRef.current.session) {
        say(line("quizStart"));
        return;
      }
      const ok = await flyTo(dockPoint(), { speed: ENGAGED_SPEED });
      if (!ok || modeRef.current !== "quiz") return;
      setFacing(1);
      setAnchor({ h: "left", v: "below" });
      say(line("quizStart"));
    },
    [cancel, send, flyTo, dockPoint, setFacing, say, update]
  );

  const onQuizAnswer = useCallback(
    ({ card, grade, fields, correct, partial, streak, answer }) => {
      if (card.courseId !== BUILTIN_ID) {
        void window.studyHub?.db?.mastery?.update?.({
          flashcardUuid: cardKey(card),
          grade,
          easeFactor: fields.easeFactor,
          intervalDays: fields.intervalDays,
          repetitions: fields.repetitions,
          nextReview: fields.next_review,
          sessionId: quizRef.current.sessionId,
        });
      }
      const pending = quizRef.current.pending;
      if (!pending.has(card.courseId)) pending.set(card.courseId, new Map());
      pending.get(card.courseId).set(cardKey(card), fields);

      const run = quizRef.current;
      run.answered += 1;
      if (correct) {
        run.correct += 1;
        run.missStreak = 0;
      } else {
        run.missStreak += 1;
      }

      setGlow((g) => Math.max(0, Math.min(character.glowLevels, g + (correct ? 1 : -1))));
      setAnchor({ h: "left", v: "below" });
      if (correct) {
        setMood(streak >= 3 ? "excited" : "happy");
        flashReaction("bounce");
        sfx(streak >= 3 ? "streak" : "correct");
        if (partial) say(line("partial"));
        else say(line(streak >= 3 ? "correctStreak" : "correct", { streak }));
        if (streak > 0 && streak % 5 === 0) playGesture("kiss");
        else if (streak === 3) playGesture("wink");
      } else if (isFailing(run)) {
        setMood("stern");
        flashReaction("glitch");
        sfx("glitch");
        if (run.missStreak >= 2) playGesture("facepalm");
        const streakLine = run.missStreak >= 3 && Math.random() < 0.5;
        say(line(streakLine ? "wrongHarshStreak" : "wrongHarsh", { misses: run.missStreak }));
      } else {
        setMood("sad");
        flashReaction("droop");
        sfx("wrong");
        const text = String(answer);
        say(text.length > 32 ? line("wrongLong") : line("wrong", { answer: text }));
      }
    },
    [flashReaction, say, sfx, playGesture]
  );

  /** Called once per run: XP, high score, session log, and fresh SM-2 fields back into course state. */
  const onQuizFinish = useCallback(
    (summary) => {
      const cur = stateRef.current;
      const prevBest = cur.highScores?.[summary.deckId] || 0;
      const newHighScore = summary.mode === "streak" && summary.score > prevBest;
      const wasRampant = isRampant(cur);
      const award = awardXp(runAwards(summary), { announce: false }) || {
        xpGained: 0,
        level: levelForXp(cur.xp || 0),
        leveledUp: false,
        unlocked: null,
      };
      update((s) => ({
        runs: (s.runs || 0) + 1,
        highScores: newHighScore ? { ...s.highScores, [summary.deckId]: summary.score } : s.highScores,
      }));

      const endedAt = new Date().toISOString();
      const logUuids = [...new Set(summary.courseUuids.map((u) => (u === BUILTIN_ID ? null : u)))];
      for (const courseUuid of logUuids.length ? logUuids : [null]) {
        if (!summary.answered) break;
        void courseStore.logStudySession({
          courseUuid,
          kind: "quiz",
          startedAt: summary.startedAt,
          endedAt,
          reviewed: summary.answered,
          correct: summary.correct,
          incorrect: summary.answered - summary.correct,
          bestCombo: summary.best,
        });
      }

      const pending = quizRef.current.pending;
      quizRef.current = { ...quizRef.current, sessionId: `quiz_${Date.now()}`, pending: new Map() };
      for (const [courseId, updates] of pending) {
        if (courseId === BUILTIN_ID) {
          const next = loadFlashcardDeck().map((c) => (updates.has(cardKey(c)) ? { ...c, ...updates.get(cardKey(c)) } : c));
          persistFlashcardDeck(next);
          setBuiltinCards(next);
          window.dispatchEvent(new CustomEvent("studyhub-flashcards-updated"));
          continue;
        }
        void onUpdateCourse?.(courseId, (course) => ({
          ...course,
          flashcards: (course.flashcards || []).map((c) => (updates.has(cardKey(c)) ? { ...c, ...updates.get(cardKey(c)) } : c)),
        }));
      }

      const tier = finishKey(summary.correct, summary.answered);
      lastTierRef.current = tier;
      setMood({ finishedGreat: "excited", finishedGood: "happy", finishedMeh: "neutral", finishedBad: "stern" }[tier]);
      if (tier === "finishedBad") {
        flashReaction("glitch");
        sfx("glitch");
        playGesture("facepalm");
      } else {
        if (tier === "finishedGreat" || (award.leveledUp && !wasRampant)) playGesture("kiss");
        sfx(tier === "finishedGreat" ? "streak" : "correct");
      }
      if (wasRampant && summary.answered) {
        setMood("happy");
        say(line("rampantRecover"));
      } else if (award.leveledUp && tier !== "finishedBad") {
        say(line(award.unlocked ? "levelUnlock" : "levelUp", { level: award.level, tint: award.unlocked?.toLowerCase() }));
      } else {
        say(line(tier, { correct: summary.correct, total: summary.answered }));
      }
      return {
        xpGained: award.xpGained,
        level: award.level,
        leveledUp: award.leveledUp,
        unlocked: award.unlocked ? `${award.unlocked} projection` : null,
        newHighScore,
      };
    },
    [update, onUpdateCourse, say, flashReaction, sfx, awardXp, playGesture]
  );

  const closeQuiz = useCallback(() => {
    setBubble(null);
    send("END");
    setGlow(1);
    setMood("neutral");
    void returnHome(220);
  }, [send, returnHome]);

  return { quizDeck, glow, quizCourses, lastTierRef, startQuiz, dockPoint, onQuizAnswer, onQuizFinish, closeQuiz };
}
