import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDueCards, localDateString } from "../study/sm2.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";
import {
  RUN_MODES,
  CLOCK_SECONDS,
  buildQuestion,
  cardKey,
  checkTyped,
  deckCards,
  hintFor,
  nextDueLabel,
  pickCards,
  pointsFor,
  reviewCard,
  sm2Grade,
} from "./lightRun.js";
import { isTypingTarget, paletteOpen } from "../lib/hotkeys.js";
import { SessionShell } from "../session/SessionShell.jsx";
import { SessionResults } from "../session/SessionResults.jsx";
import { applyAnswer, initShield, isDepleted } from "../session/shield.js";
import { masteryDeltas } from "../session/results.js";

const FLIP_GUARD_MS = 200;
const CLOCK_ADVANCE_MS = 450;
const TYPE_LABEL = { mc: "MULTIPLE CHOICE", typed: "TYPE THE ANSWER", flip: "FLIP CARD" };

const modeLabel = (id) => RUN_MODES.find((m) => m.id === id)?.label || "";
const finite = (mode) => mode === "quick" || mode === "weak";

/** Answered cards whose next review is tomorrow. */
function comeBackCount(reviewed) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = localDateString(d);
  return Object.values(reviewed).filter((day) => day === tomorrow).length;
}

/** One question at a time inside a session; hands every graded answer to the layer (SM-2 write + Nova's reaction). */
export function QuizPanel({ courses, initialDeck = "all", highScores = {}, onAnswer, onFinish, onClose, onToday }) {
  const [screen, setScreen] = useState("setup");
  const [deckId, setDeckId] = useState(initialDeck);
  const [modeId, setModeId] = useState("quick");
  const [run, setRun] = useState(null);
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(Date.now());
  const runRef = useRef(null);
  runRef.current = run;
  const lastFlipRef = useRef(0);
  const advanceRef = useRef(0);

  const decks = useMemo(() => {
    const withCards = (courses || []).filter((c) => (c.flashcards || []).length);
    const allCards = withCards.flatMap((c) => c.flashcards);
    return [
      { id: "all", label: "All courses", due: getDueCards(allCards).length, total: allCards.length },
      ...withCards.map((c) => ({
        id: c.id,
        label: shortCourse(c.courseCode || c.name) || c.name,
        due: getDueCards(c.flashcards).length,
        total: c.flashcards.length,
      })),
    ];
  }, [courses]);

  const deck = decks.find((d) => d.id === deckId) || decks[0];
  const uniqueBacks = useMemo(
    () => new Set(deckCards(courses, deck?.id || "all").map((c) => String(c.back).trim().toLowerCase())).size,
    [courses, deck?.id]
  );

  useEffect(() => () => window.clearTimeout(advanceRef.current), []);

  /** `only` (card keys) narrows the run to those cards, as a quick run. */
  const startRun = useCallback(
    (mode = modeId, id = deck?.id || "all", only = null) => {
      const pool = deckCards(courses, id);
      const queue = only ? pool.filter((c) => only.includes(cardKey(c))).sort(() => Math.random() - 0.5) : pickCards(pool, mode);
      if (!queue.length) return;
      const t = Date.now();
      window.clearTimeout(advanceRef.current);
      setTyped("");
      setRun({
        mode,
        deckId: id,
        pool,
        startPool: pool,
        queue,
        index: 0,
        q: buildQuestion(queue[0], pool, mode, 0),
        score: 0,
        streak: 0,
        best: 0,
        answered: 0,
        correct: 0,
        misses: [],
        dates: [],
        reviewed: {},
        courseUuids: new Set(),
        shield: initShield(),
        hint: null,
        selected: null,
        revealed: false,
        result: null,
        startedAt: new Date(t).toISOString(),
        t0: t,
        qStartedAt: t,
        endsAt: mode === "clock" ? t + CLOCK_SECONDS * 1000 : null,
      });
      setNow(t);
      setScreen("play");
    },
    [courses, deck?.id, modeId]
  );

  const finish = useCallback(() => {
    const r = runRef.current;
    if (!r || r.summary) return;
    window.clearTimeout(advanceRef.current);
    if (!r.answered) {
      onClose();
      return;
    }
    const summary = {
      mode: r.mode,
      deckId: r.deckId,
      score: r.score,
      answered: r.answered,
      correct: r.correct,
      best: r.best,
      misses: r.misses.map(({ front, back }) => ({ front, back })),
      nextDue: nextDueLabel(r.dates),
      startedAt: r.startedAt,
      courseUuids: [...r.courseUuids],
    };
    const reward = onFinish?.(summary) || {};
    setRun({ ...r, summary, reward, endedAt: Date.now() });
    setScreen("end");
  }, [onFinish, onClose]);

  /** Moves to the next question, or ends the run when a rule says so. */
  const advance = useCallback(
    (r) => {
      window.clearTimeout(advanceRef.current);
      const outOfCards = finite(r.mode) && r.index + 1 >= r.queue.length;
      const outOfTime = r.mode === "clock" && Date.now() >= r.endsAt;
      if (isDepleted(r.shield) || outOfCards || outOfTime) {
        if (r.answered) finish();
        else onClose();
        return;
      }
      const index = r.index + 1;
      const card = r.queue[index % r.queue.length];
      setTyped("");
      setRun({ ...r, index, q: buildQuestion(card, r.pool, r.mode, index), hint: null, selected: null, revealed: false, result: null, qStartedAt: Date.now() });
    },
    [finish, onClose]
  );

  const next = useCallback(() => {
    const r = runRef.current;
    if (r?.result && !r.summary) advance(r);
  }, [advance]);

  const skip = useCallback(() => {
    const r = runRef.current;
    if (r && !r.result && !r.summary) advance(r);
  }, [advance]);

  const answer = useCallback(
    ({ correct, partial = false, picked = null }) => {
      const r = runRef.current;
      if (!r || r.result || r.summary) return;
      const usedHint = !!r.hint;
      const elapsedMs = r.mode === "clock" ? Date.now() - r.qStartedAt : null;
      const points = correct ? pointsFor({ streak: r.streak, hint: usedHint, partial, elapsedMs }) : 0;
      const streak = correct ? r.streak + 1 : 0;
      const grade = sm2Grade({ correct, hint: usedHint, partial });
      const fields = reviewCard(r.q.card, grade);
      const key = cardKey(r.q.card);
      const refresh = (c) => (cardKey(c) === key ? { ...c, ...fields } : c);
      onAnswer?.({ card: r.q.card, grade, fields, correct, partial, hint: usedHint, streak, answer: r.q.answer });
      const courseUuids = new Set(r.courseUuids);
      courseUuids.add(r.q.card.courseUuid);
      const shield = applyAnswer(r.shield, correct);
      let queue = r.queue.map(refresh);
      if (shield.last === "health" && finite(r.mode)) queue = [...queue, queue[r.index % queue.length]];
      const nextRun = {
        ...r,
        queue,
        pool: r.pool.map(refresh),
        score: r.score + points,
        streak,
        best: Math.max(r.best, streak),
        answered: r.answered + 1,
        correct: r.correct + (correct ? 1 : 0),
        misses: correct || r.misses.some((m) => m.key === key) ? r.misses : [...r.misses, { key, front: r.q.card.front, back: r.q.card.back }],
        dates: [...r.dates, fields.next_review],
        reviewed: { ...r.reviewed, [key]: fields.next_review },
        courseUuids,
        shield,
        result: { correct, partial, picked, points },
      };
      setRun(nextRun);
      if (r.mode === "clock") {
        runRef.current = nextRun;
        advanceRef.current = window.setTimeout(next, CLOCK_ADVANCE_MS);
      }
    },
    [onAnswer, next]
  );

  const select = useCallback((i) => {
    setRun((r) => (r && r.q.type === "mc" && !r.result && i < r.q.options.length && !r.hint?.eliminate?.includes(i) ? { ...r, selected: i } : r));
  }, []);

  const lockIn = useCallback(() => {
    const r = runRef.current;
    if (!r || r.q.type !== "mc" || r.result || r.selected == null) return;
    answer({ correct: r.selected === r.q.answerIndex, picked: r.selected });
  }, [answer]);

  const submitTyped = useCallback(() => {
    const r = runRef.current;
    if (!r || r.q.type !== "typed" || r.result || !typed.trim()) return;
    answer(checkTyped(typed, r.q.answer));
  }, [answer, typed]);

  const reveal = useCallback(() => {
    const t = Date.now();
    if (t - lastFlipRef.current < FLIP_GUARD_MS) return;
    lastFlipRef.current = t;
    setRun((r) => (r && r.q.type === "flip" && !r.result ? { ...r, revealed: true } : r));
  }, []);

  const takeHint = useCallback(() => {
    setRun((r) => {
      if (!r || r.result || r.hint || r.mode === "clock") return r;
      const hint = hintFor(r.q);
      return { ...r, hint, selected: hint.eliminate?.includes(r.selected) ? null : r.selected };
    });
  }, []);

  const quit = useCallback(() => {
    const r = runRef.current;
    if (screen === "play" && r?.answered) finish();
    else onClose();
  }, [screen, finish, onClose]);

  /* Beat the Clock countdown. */
  useEffect(() => {
    if (screen !== "play" || run?.mode !== "clock") return undefined;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (runRef.current && t >= runRef.current.endsAt) finish();
    }, 250);
    return () => window.clearInterval(id);
  }, [screen, run?.mode, finish]);

  const onKey = useCallback(
    (e) => {
      if (paletteOpen()) return;
      const typing = isTypingTarget(e.target);
      const r = runRef.current;
      const k = e.key.toLowerCase();
      let handled = true;
      if (e.key === "Escape") quit();
      else if (screen === "setup") {
        if (e.key === "Enter" && !typing) startRun();
        else handled = false;
      } else if (screen !== "play" || !r) handled = false;
      else if (r.result) {
        if (e.key === "Enter" || e.key === " ") next();
        else handled = false;
      } else if (!typing) {
        if (r.q.type === "mc" && /^[1-9]$/.test(e.key)) select(Number(e.key) - 1);
        else if (r.q.type === "mc" && e.key === "Enter") lockIn();
        else if (r.q.type === "flip" && !r.revealed && (e.key === " " || e.key === "Enter")) reveal();
        else if (r.q.type === "flip" && r.revealed && (e.key === "1" || e.key === "ArrowRight")) answer({ correct: true });
        else if (r.q.type === "flip" && r.revealed && (e.key === "2" || e.key === "ArrowLeft")) answer({ correct: false });
        else if (k === "h") takeHint();
        else if (k === "s") skip();
        else handled = false;
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    [screen, quit, startRun, next, select, lockIn, reveal, answer, takeHint, skip]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKey]);

  const playing = run && screen !== "setup";
  const crumbDeck = (playing && decks.find((d) => d.id === run.deckId)) || deck;
  const crumb = `${crumbDeck?.label || "Quiz"} · ${modeLabel(playing ? run.mode : modeId)}`;
  let counter = null;
  let progress = null;
  if (playing) {
    const n = screen === "end" ? Math.min(run.index + 1, run.queue.length) : run.index + 1;
    counter = finite(run.mode) ? `Q ${n}/${run.queue.length}` : `Q ${screen === "end" ? run.answered : n}`;
    if (finite(run.mode)) progress = (run.index + (screen === "end" && run.result ? 1 : 0)) / run.queue.length;
    else if (run.mode === "clock") progress = Math.min(1, ((screen === "end" ? run.endedAt : now) - run.t0) / (CLOCK_SECONDS * 1000));
  }
  const shieldLabel = screen === "end" && run && !run.shield.wentDown ? "SHIELDS HELD" : null;

  return (
    <SessionShell kind="quiz" crumb={crumb} shield={playing ? run.shield : null} shieldLabel={shieldLabel} counter={counter} progress={progress} onExit={quit}>
      {screen === "setup" ? (
        <Setup
          decks={decks}
          deck={deck}
          onDeck={setDeckId}
          modeId={modeId}
          onMode={setModeId}
          uniqueBacks={uniqueBacks}
          highScores={highScores}
          onStart={() => startRun()}
        />
      ) : null}

      {screen === "play" && run ? (
        <Play
          run={run}
          now={now}
          typed={typed}
          showCourse={run.deckId === "all"}
          onTyped={setTyped}
          onSubmitTyped={submitTyped}
          onSelect={select}
          onLock={lockIn}
          onReveal={reveal}
          onSelfGrade={(correct) => answer({ correct })}
          onHint={takeHint}
          onSkip={skip}
          onNext={next}
        />
      ) : null}

      {screen === "end" && run?.summary ? (
        <SessionResults
          key={run.startedAt}
          crumb={crumb}
          shield={run.shield}
          stats={{
            answered: run.answered,
            correct: run.correct,
            best: run.best,
            startedAt: run.t0,
            endedAt: run.endedAt,
            wentDown: run.shield.wentDown,
            downCount: run.shield.downCount,
          }}
          comeBack={comeBackCount(run.reviewed)}
          deltas={masteryDeltas(run.startPool, run.pool, (c) => c.courseLabel)}
          missedCount={run.misses.length}
          extra={<RewardLine score={run.score} reward={run.reward} />}
          onReviewMissed={() => startRun("quick", run.deckId, run.misses.map((m) => m.key))}
          onAnother={() => startRun(run.mode, run.deckId)}
          onToday={onToday}
        />
      ) : null}
    </SessionShell>
  );
}

function RewardLine({ score, reward = {} }) {
  const parts = [`${score.toLocaleString()} POINTS`];
  if (reward.xpGained) parts.push(`+${reward.xpGained} XP`);
  if (reward.level) parts.push(`LV ${reward.level}`);
  if (reward.newHighScore) parts.push("NEW BEST");
  if (reward.leveledUp) parts.push("LEVEL UP");
  if (reward.unlocked) parts.push(`UNLOCKED ${reward.unlocked.toUpperCase()}`);
  return <span className="sh-quiz-reward">{parts.join(" · ")}</span>;
}

function Setup({ decks, deck, onDeck, modeId, onMode, uniqueBacks, highScores, onStart }) {
  if (!deck || !deck.total) {
    return (
      <div className="sh-session-panel">
        <h2 className="sh-quiz-heading">Quiz me</h2>
        <p className="sh-quiz-empty">No flashcards yet. Import some slides and I&apos;ll have something to quiz you on.</p>
      </div>
    );
  }
  const clockOk = uniqueBacks >= 4;
  const canStart = modeId !== "clock" || clockOk;
  return (
    <div className="sh-session-panel">
      <h2 className="sh-quiz-heading">Quiz me</h2>
      <label className="sh-quiz-label" htmlFor="sh-quiz-deck">
        Deck
      </label>
      <select id="sh-quiz-deck" className="sh-quiz-deck" value={deck.id} onChange={(e) => onDeck(e.target.value)}>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label} · {d.due} due / {d.total}
          </option>
        ))}
      </select>
      <div className="sh-quiz-label">Mode</div>
      <div className="sh-quiz-modes" role="radiogroup" aria-label="Quiz mode">
        {RUN_MODES.map((m) => {
          const disabled = m.id === "clock" && !clockOk;
          const best = m.id === "streak" ? highScores[deck.id] : null;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={modeId === m.id}
              disabled={disabled}
              className="sh-quiz-mode"
              onClick={() => onMode(m.id)}
            >
              <span className="sh-quiz-mode-name">{m.label}</span>
              <span className="sh-quiz-mode-blurb">{disabled ? "Needs at least 4 different cards." : m.blurb}</span>
              {best ? <span className="sh-quiz-mode-best">BEST {best.toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="sh-quiz-actions">
        <button type="button" className="sh-btn-accent sh-session-btn" disabled={!canStart} onClick={onStart}>
          Start
        </button>
        <span className="sh-quiz-keys">Enter to start</span>
      </div>
    </div>
  );
}

function Play({ run, now, typed, showCourse, onTyped, onSubmitTyped, onSelect, onLock, onReveal, onSelfGrade, onHint, onSkip, onNext }) {
  const { q, result, hint } = run;
  const remaining = run.endsAt ? Math.max(0, Math.ceil((run.endsAt - now) / 1000)) : null;
  const total = finite(run.mode) ? run.queue.length : null;
  const willEnd = (total != null && run.index + 1 >= total) || isDepleted(run.shield);
  const counter = remaining != null ? `${remaining}s` : total != null ? `Q ${run.index + 1} / ${total}` : `Q ${run.index + 1}`;
  const canHint = run.mode !== "clock" && !hint && !(q.type === "flip" && run.revealed);

  let keys = null;
  if (result) keys = run.mode === "clock" ? null : "Enter for next";
  else if (q.type === "mc") keys = `1-${q.options.length} to pick · Enter to lock`;
  else if (q.type === "flip") keys = run.revealed ? "1 got it · 2 missed it" : "Space to flip";
  else keys = "Enter to check";

  return (
    <div className="sh-session-panel" role="group" aria-label="Quiz question">
      <div className="sh-quiz-head">
        <span>
          {TYPE_LABEL[q.type]}
          {showCourse && q.card.courseLabel ? ` · ${q.card.courseLabel}` : ""}
        </span>
        <span className={`sh-quiz-count${remaining != null && remaining <= 10 ? " sh-quiz-count--low" : ""}`}>{counter}</span>
      </div>
      <p className="sh-quiz-prompt">{q.prompt}</p>

      {q.type === "mc" ? (
        <ol className="sh-quiz-options">
          {q.options.map((opt, i) => {
            const gone = hint?.eliminate?.includes(i);
            let state = null;
            if (result && i === q.answerIndex) state = "correct";
            else if (result && i === result.picked) state = "wrong";
            else if (!result && i === run.selected) state = "selected";
            return (
              <li key={`${q.key}-${i}`}>
                <button
                  type="button"
                  className="sh-quiz-option"
                  data-state={state || undefined}
                  data-gone={gone || undefined}
                  aria-pressed={!result ? i === run.selected : undefined}
                  disabled={!!result || gone}
                  onClick={() => onSelect(i)}
                >
                  <span className="sh-quiz-key">{i + 1}</span>
                  <span>{opt}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {q.type === "typed" ? (
        <form
          className="sh-quiz-typed"
          onSubmit={(e) => {
            e.preventDefault();
            if (result) onNext();
            else onSubmitTyped();
          }}
        >
          <input
            key={q.key}
            className="sh-quiz-input"
            value={typed}
            onChange={(e) => onTyped(e.target.value)}
            placeholder="Type the answer…"
            aria-label="Your answer"
            disabled={!!result}
            autoFocus
          />
        </form>
      ) : null}

      {q.type === "flip" && run.revealed && !result ? <p className="sh-quiz-answer">{q.answer}</p> : null}

      {hint?.text && !result ? <p className="sh-quiz-hint">{hint.text}</p> : null}

      {result ? (
        <div className="sh-quiz-feedback" data-ok={result.correct || undefined} role="status" aria-live="polite">
          <span className="sh-quiz-verdict">
            {result.correct ? (result.partial ? "Close enough" : "Correct") : "Not quite"}
            {result.points ? ` · +${result.points}` : ""}
          </span>
          {!result.correct || result.partial || q.type === "flip" ? <span className="sh-quiz-answer">{q.answer}</span> : null}
        </div>
      ) : null}

      <div className="sh-quiz-actions">
        {result ? (
          run.mode !== "clock" ? (
            <button type="button" className="sh-btn-accent sh-session-btn" onClick={onNext}>
              {willEnd ? "See results" : "Next"}
            </button>
          ) : null
        ) : (
          <>
            {q.type === "mc" ? (
              <button type="button" className="sh-btn-accent sh-session-btn" disabled={run.selected == null} onClick={onLock}>
                Lock in
              </button>
            ) : null}
            {q.type === "typed" ? (
              <button type="button" className="sh-btn-accent sh-session-btn" disabled={!typed.trim()} onClick={onSubmitTyped}>
                Check
              </button>
            ) : null}
            {q.type === "flip" && !run.revealed ? (
              <button type="button" className="sh-btn-accent sh-session-btn" onClick={onReveal}>
                Show answer
              </button>
            ) : null}
            {q.type === "flip" && run.revealed ? (
              <>
                <button type="button" className="sh-btn-accent sh-session-btn" onClick={() => onSelfGrade(true)}>
                  Got it
                </button>
                <button type="button" className="sh-btn-outline sh-session-btn" onClick={() => onSelfGrade(false)}>
                  Missed it
                </button>
              </>
            ) : null}
            {canHint ? (
              <button type="button" className="sh-btn-outline sh-session-btn" onClick={onHint}>
                Hint
              </button>
            ) : null}
            <button type="button" className="sh-btn-outline sh-session-btn" onClick={onSkip}>
              Skip
            </button>
          </>
        )}
        {keys ? <span className="sh-quiz-keys">{keys}</span> : null}
      </div>
    </div>
  );
}
