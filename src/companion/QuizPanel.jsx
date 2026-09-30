import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDueCards } from "../study/sm2.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";
import {
  RUN_MODES,
  CLOCK_SECONDS,
  STREAK_LIVES,
  buildQuestion,
  cardKey,
  checkTyped,
  deckCards,
  hintFor,
  multiplier,
  nextDueLabel,
  pickCards,
  pointsFor,
  reviewCard,
  sm2Grade,
} from "./lightRun.js";

const FLIP_GUARD_MS = 200;
const CLOCK_ADVANCE_MS = 450;

function paletteOpen() {
  return !!document.querySelector(".sh-palette");
}

function isTypingTarget(el) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** One question at a time; hands every graded answer to the layer (SM-2 write + Nova's reaction). */
export function QuizPanel({ courses, initialDeck = "all", highScores = {}, onAnswer, onFinish, onClose }) {
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

  const startRun = useCallback(
    (mode = modeId, id = deck?.id || "all") => {
      const pool = deckCards(courses, id);
      const queue = pickCards(pool, mode);
      if (!queue.length) return;
      const t = Date.now();
      setTyped("");
      setRun({
        mode,
        deckId: id,
        pool,
        queue,
        index: 0,
        q: buildQuestion(queue[0], pool, mode, 0),
        score: 0,
        streak: 0,
        best: 0,
        answered: 0,
        correct: 0,
        lives: STREAK_LIVES,
        misses: [],
        dates: [],
        courseUuids: new Set(),
        hint: null,
        revealed: false,
        result: null,
        startedAt: new Date(t).toISOString(),
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
    const summary = {
      mode: r.mode,
      deckId: r.deckId,
      score: r.score,
      answered: r.answered,
      correct: r.correct,
      best: r.best,
      misses: r.misses,
      nextDue: nextDueLabel(r.dates),
      startedAt: r.startedAt,
      courseUuids: [...r.courseUuids],
    };
    const reward = onFinish?.(summary) || {};
    setRun({ ...r, summary, reward });
    setScreen("end");
  }, [onFinish]);

  const next = useCallback(() => {
    const r = runRef.current;
    if (!r || !r.result) return;
    window.clearTimeout(advanceRef.current);
    const outOfCards = (r.mode === "quick" || r.mode === "weak") && r.index + 1 >= r.queue.length;
    const outOfLives = r.mode === "streak" && r.lives <= 0;
    const outOfTime = r.mode === "clock" && Date.now() >= r.endsAt;
    if (outOfCards || outOfLives || outOfTime) {
      finish();
      return;
    }
    const index = r.index + 1;
    const card = r.queue[index % r.queue.length];
    setTyped("");
    setRun({ ...r, index, q: buildQuestion(card, r.pool, r.mode, index), hint: null, revealed: false, result: null, qStartedAt: Date.now() });
  }, [finish]);

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
      const nextRun = {
        ...r,
        queue: r.queue.map(refresh),
        pool: r.pool.map(refresh),
        score: r.score + points,
        streak,
        best: Math.max(r.best, streak),
        answered: r.answered + 1,
        correct: r.correct + (correct ? 1 : 0),
        lives: !correct && r.mode === "streak" ? r.lives - 1 : r.lives,
        misses: correct ? r.misses : [...r.misses, { front: r.q.card.front, back: r.q.card.back }],
        dates: [...r.dates, fields.next_review],
        courseUuids,
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

  const pickOption = useCallback(
    (i) => {
      const r = runRef.current;
      if (!r || r.q.type !== "mc" || r.result || r.hint?.eliminate?.includes(i)) return;
      answer({ correct: i === r.q.answerIndex, picked: i });
    },
    [answer]
  );

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
    setRun((r) => (r && !r.result && !r.hint && r.mode !== "clock" ? { ...r, hint: hintFor(r.q) } : r));
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
      let handled = true;
      if (e.key === "Escape") quit();
      else if (screen === "setup") {
        if (e.key === "Enter" && !typing) startRun();
        else handled = false;
      } else if (screen === "end") {
        if (e.key === "Enter") startRun(run.mode, run.deckId);
        else handled = false;
      } else if (r?.result) {
        if (e.key === "Enter" || e.key === " ") next();
        else handled = false;
      } else if (r && !typing) {
        if (r.q.type === "mc" && /^[1-4]$/.test(e.key)) pickOption(Number(e.key) - 1);
        else if (r.q.type === "flip" && !r.revealed && (e.key === " " || e.key === "Enter")) reveal();
        else if (r.q.type === "flip" && r.revealed && (e.key === "1" || e.key === "ArrowRight")) answer({ correct: true });
        else if (r.q.type === "flip" && r.revealed && (e.key === "2" || e.key === "ArrowLeft")) answer({ correct: false });
        else if (e.key.toLowerCase() === "h") takeHint();
        else handled = false;
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    [screen, run?.mode, run?.deckId, quit, startRun, next, pickOption, reveal, answer, takeHint]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKey]);

  return (
    <div className="sc-quiz" role="dialog" aria-label="Training sim quiz" data-sprite-avoid onPointerDown={(e) => e.stopPropagation()}>
      <header className="sc-quiz-head">
        <span className="mono">TRAINING SIM{run && screen !== "setup" ? ` · ${RUN_MODES.find((m) => m.id === run.mode)?.label}` : ""}</span>
        <button type="button" className="sc-settings-close mono" onClick={quit} aria-label="Close quiz">
          ×
        </button>
      </header>

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
          onTyped={setTyped}
          onSubmitTyped={submitTyped}
          onPick={pickOption}
          onReveal={reveal}
          onSelfGrade={(correct) => answer({ correct })}
          onHint={takeHint}
          onNext={next}
        />
      ) : null}

      {screen === "end" && run?.summary ? (
        <End
          run={run}
          onAgain={() => startRun(run.mode, run.deckId)}
          onChange={() => {
            setRun(null);
            setScreen("setup");
          }}
          onDone={onClose}
        />
      ) : null}
    </div>
  );
}

function Setup({ decks, deck, onDeck, modeId, onMode, uniqueBacks, highScores, onStart }) {
  if (!deck || !deck.total) {
    return (
      <div className="sc-quiz-body">
        <p className="sc-quiz-empty">No flashcards yet. Import some slides and I&apos;ll have something to quiz you on.</p>
      </div>
    );
  }
  const clockOk = uniqueBacks >= 4;
  const canStart = modeId !== "clock" || clockOk;
  return (
    <div className="sc-quiz-body">
      <label className="sc-quiz-label mono" htmlFor="sc-quiz-deck">
        DECK
      </label>
      <select id="sc-quiz-deck" className="sc-set-select sc-quiz-deck mono" value={deck.id} onChange={(e) => onDeck(e.target.value)}>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label} · {d.due} due / {d.total}
          </option>
        ))}
      </select>
      <div className="sc-quiz-label mono">MODE</div>
      <div className="sc-quiz-modes" role="radiogroup" aria-label="Quiz mode">
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
              className={`sc-quiz-mode${modeId === m.id ? " active" : ""}`}
              onClick={() => onMode(m.id)}
            >
              <span className="sc-quiz-mode-name mono">{m.label}</span>
              <span className="sc-quiz-mode-blurb">{disabled ? "Needs at least 4 different cards." : m.blurb}</span>
              {best ? <span className="sc-quiz-mode-best mono">BEST {best.toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>
      <button type="button" className="sc-bubble-btn sc-bubble-btn--primary sc-quiz-start mono" disabled={!canStart} onClick={onStart}>
        START RUN ↵
      </button>
    </div>
  );
}

function Play({ run, now, typed, onTyped, onSubmitTyped, onPick, onReveal, onSelfGrade, onHint, onNext }) {
  const { q, result, hint } = run;
  const remaining = run.endsAt ? Math.max(0, Math.ceil((run.endsAt - now) / 1000)) : null;
  const total = run.mode === "quick" || run.mode === "weak" ? run.queue.length : null;
  const lastCard = total != null && run.index + 1 >= total;
  const willEnd = lastCard || (run.mode === "streak" && run.lives <= 0);

  return (
    <div className="sc-quiz-body">
      <div className="sc-quiz-hud mono">
        <span className="sc-quiz-score">{run.score.toLocaleString()}</span>
        <span className={`sc-quiz-streak${run.streak >= 3 ? " sc-quiz-streak--hot" : ""}`}>
          STREAK {run.streak} · ×{multiplier(run.streak)}
        </span>
        {remaining != null ? <span className={`sc-quiz-timer${remaining <= 10 ? " sc-quiz-timer--low" : ""}`}>{remaining}s</span> : null}
        {total != null ? (
          <span>
            {Math.min(run.index + 1, total)} / {total}
          </span>
        ) : null}
        {run.mode === "streak" ? (
          <span className="sc-quiz-lives" aria-label={`${run.lives} lives left`}>
            {"●".repeat(run.lives)}
            {"○".repeat(STREAK_LIVES - run.lives)}
          </span>
        ) : null}
      </div>

      <div className="sc-quiz-card">
        <div className="sc-quiz-course mono">{q.card.courseLabel}</div>
        <p className="sc-quiz-prompt">{q.prompt}</p>
      </div>

      {q.type === "mc" ? (
        <ol className="sc-quiz-options">
          {q.options.map((opt, i) => {
            const gone = hint?.eliminate?.includes(i);
            let cls = "sc-quiz-option";
            if (result && i === q.answerIndex) cls += " sc-quiz-option--correct";
            else if (result && i === result.picked) cls += " sc-quiz-option--wrong";
            if (gone) cls += " sc-quiz-option--gone";
            return (
              <li key={`${q.key}-${i}`}>
                <button type="button" className={cls} disabled={!!result || gone} onClick={() => onPick(i)}>
                  <span className="sc-quiz-key mono">{i + 1}</span>
                  <span>{opt}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {q.type === "typed" ? (
        <form
          className="sc-quiz-typed"
          onSubmit={(e) => {
            e.preventDefault();
            if (result) onNext();
            else onSubmitTyped();
          }}
        >
          <input
            key={q.key}
            className="sc-help-input"
            value={typed}
            onChange={(e) => onTyped(e.target.value)}
            placeholder="Type the answer…"
            aria-label="Your answer"
            disabled={!!result}
            autoFocus
          />
          {!result ? (
            <button type="submit" className="sc-bubble-btn sc-bubble-btn--primary mono" disabled={!typed.trim()}>
              CHECK ↵
            </button>
          ) : null}
        </form>
      ) : null}

      {q.type === "flip" && !result ? (
        run.revealed ? (
          <div className="sc-quiz-flip">
            <p className="sc-quiz-answer">{q.answer}</p>
            <div className="sc-bubble-actions">
              <button type="button" className="sc-bubble-btn sc-bubble-btn--primary mono" onClick={() => onSelfGrade(true)}>
                1 · GOT IT
              </button>
              <button type="button" className="sc-bubble-btn sc-bubble-btn--danger mono" onClick={() => onSelfGrade(false)}>
                2 · MISSED IT
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="sc-bubble-btn sc-quiz-reveal mono" onClick={onReveal}>
            SHOW ANSWER · SPACE
          </button>
        )
      ) : null}

      {hint?.text && !result ? <p className="sc-quiz-hint">{hint.text}</p> : null}

      {!result && run.mode !== "clock" && !hint && !(q.type === "flip" && run.revealed) ? (
        <button type="button" className="sc-quiz-hint-btn mono" onClick={onHint}>
          HINT (H) · HALF POINTS
        </button>
      ) : null}

      {result ? (
        <div className={`sc-quiz-feedback${result.correct ? " sc-quiz-feedback--ok" : " sc-quiz-feedback--miss"}`} role="status" aria-live="polite">
          <span className="mono">
            {result.correct ? (result.partial ? "✓ CLOSE ENOUGH" : "✓ CORRECT") : "✗ NOT QUITE"}
            {result.points ? ` · +${result.points}` : ""}
          </span>
          {!result.correct || result.partial || q.type === "flip" ? <span className="sc-quiz-answer">{q.answer}</span> : null}
          {run.mode !== "clock" ? (
            <button type="button" className="sc-bubble-btn sc-bubble-btn--primary mono" onClick={onNext} autoFocus>
              {willEnd ? "SEE RESULTS ↵" : "NEXT ↵"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function End({ run, onAgain, onChange, onDone }) {
  const s = run.summary;
  const r = run.reward || {};
  const accuracy = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  return (
    <div className="sc-quiz-body">
      <div className="sc-quiz-final">
        <span className="sc-quiz-final-score mono">{s.score.toLocaleString()}</span>
        <span className="sc-quiz-final-sub mono">POINTS{r.newHighScore ? " · NEW BEST" : ""}</span>
      </div>
      <div className="sc-quiz-stats mono">
        <span>
          <b>{accuracy}%</b> ACCURACY
        </span>
        <span>
          <b>{s.correct}</b>/{s.answered} RIGHT
        </span>
        <span>
          <b>{s.best}</b> BEST STREAK
        </span>
      </div>
      {r.xpGained ? (
        <p className="sc-quiz-xp mono">
          +{r.xpGained} XP · LV {r.level}
          {r.leveledUp ? " · LEVEL UP!" : ""}
          {r.unlocked ? ` · UNLOCKED ${r.unlocked.toUpperCase()}` : ""}
        </p>
      ) : null}
      {s.nextDue ? <p className="sc-quiz-next">Next review for these cards: {s.nextDue}.</p> : null}
      {s.misses.length ? (
        <>
          <div className="sc-quiz-label mono">MISSED · {s.misses.length}</div>
          <ul className="sc-quiz-misses">
            {s.misses.slice(0, 6).map((m, i) => (
              <li key={`${m.front}-${i}`}>
                <span className="sc-quiz-miss-front">{m.front}</span>
                <span className="sc-quiz-miss-back">{m.back}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="sc-bubble-actions">
        <button type="button" className="sc-bubble-btn sc-bubble-btn--primary mono" onClick={onAgain} autoFocus>
          RUN AGAIN ↵
        </button>
        <button type="button" className="sc-bubble-btn mono" onClick={onChange}>
          CHANGE MODE
        </button>
        <button type="button" className="sc-bubble-btn mono" onClick={onDone}>
          DONE
        </button>
      </div>
    </div>
  );
}
