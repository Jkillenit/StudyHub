import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildQuestionPool, poolForModules } from "./questionPool.js";
import { QUESTION_TYPES, buildTest, gradeTyped, retakeQuestions } from "./practiceTest.js";

const COUNTS = [10, 20, 30];

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const paletteOpen = () => !!document.querySelector('.sh-palette, .sh-cmd-palette, [data-palette="true"]');

function TestSetup({ modules, pool, onStart }) {
  const [moduleIds, setModuleIds] = useState([]);
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState(QUESTION_TYPES.map((t) => t.id));
  const [focusWeak, setFocusWeak] = useState(true);

  const perModule = useMemo(() => {
    const m = new Map();
    for (const p of pool) m.set(p.moduleId, (m.get(p.moduleId) || 0) + 1);
    return m;
  }, [pool]);
  const scopedCount = poolForModules(pool, moduleIds).length;
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (!pool.length) {
    return (
      <p className="sh-today-empty">
        No terms to test yet. Import slides or add flashcards and glossary terms, then come back.
      </p>
    );
  }

  return (
    <div className="sh-pt-setup">
      <div className="sh-hub-section-label">SCOPE</div>
      <div className="sh-pt-chips">
        <button
          type="button"
          className={`sh-pt-chip${moduleIds.length === 0 ? " active" : ""}`}
          onClick={() => setModuleIds([])}
        >
          ALL MODULES · {pool.length}
        </button>
        {modules
          .filter((m) => perModule.get(m.id))
          .map((m) => (
            <button
              key={m.id}
              type="button"
              className={`sh-pt-chip${moduleIds.includes(m.id) ? " active" : ""}`}
              onClick={() => toggle(moduleIds, setModuleIds, m.id)}
            >
              {m.title || m.label} · {perModule.get(m.id)}
            </button>
          ))}
      </div>

      <div className="sh-hub-section-label">QUESTIONS</div>
      <div className="sh-pt-chips">
        {COUNTS.map((n) => (
          <button key={n} type="button" className={`sh-pt-chip${count === n ? " active" : ""}`} onClick={() => setCount(n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="sh-hub-section-label">FORMAT</div>
      <div className="sh-pt-chips">
        {QUESTION_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sh-pt-chip${types.includes(t.id) ? " active" : ""}`}
            onClick={() => toggle(types, setTypes, t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="sh-pt-check">
        <input type="checkbox" checked={focusWeak} onChange={(e) => setFocusWeak(e.target.checked)} />
        Prioritize weak and due cards
      </label>

      <div className="sh-pt-actions">
        <button
          type="button"
          className="sh-btn-ghost sh-btn-green sh-bb-sync-btn"
          disabled={!types.length || !scopedCount}
          onClick={() => onStart({ moduleIds, count, types, focusWeak })}
        >
          START TEST · {Math.min(count, scopedCount)} Q
        </button>
      </div>
    </div>
  );
}

function QuestionCard({ q, index, total, onAnswer, result, onNext }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    setTyped("");
    if (q.type === "typed") inputRef.current?.focus();
  }, [q]);

  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  const handleKey = useCallback(
    (e) => {
      if (paletteOpen() || isTypingTarget(document.activeElement)) return;
      if (!result && q.options && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < q.options.length) {
          e.preventDefault();
          onAnswer({ choice: i });
        }
      }
    },
    [q, result, onAnswer]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const promptLabel = q.type === "mc-def" ? "WHICH DEFINITION MATCHES" : "WHICH TERM MATCHES";

  return (
    <div className="sh-pt-card">
      <div className="sh-pt-progress mono">
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        <span className="sh-pt-progress-track">
          <span className="sh-pt-progress-fill" style={{ width: `${((index + (result ? 1 : 0)) / total) * 100}%` }} />
        </span>
      </div>
      <div className="sh-hub-section-label">{q.type === "typed" ? "TYPE THE TERM" : promptLabel}</div>
      <div className={`sh-pt-prompt${q.type === "mc-def" ? " sh-pt-prompt--term" : ""}`}>{q.prompt}</div>

      {q.options ? (
        <ol className="sh-pt-options">
          {q.options.map((opt, i) => {
            let state = "";
            if (result) {
              if (i === q.answerIndex) state = " sh-pt-option--correct";
              else if (i === result.choice) state = " sh-pt-option--wrong";
            }
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`sh-pt-option${state}`}
                  disabled={!!result}
                  onClick={() => onAnswer({ choice: i })}
                >
                  <span className="sh-pt-option-key mono">{i + 1}</span>
                  <span>{opt}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <form
          className="sh-pt-typed"
          onSubmit={(e) => {
            e.preventDefault();
            if (!result && typed.trim()) onAnswer({ text: typed });
          }}
        >
          <input
            ref={inputRef}
            className="sh-asg-input sh-pt-typed-input"
            value={typed}
            disabled={!!result}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Your answer"
            aria-label="Your answer"
          />
          {!result ? (
            <button type="submit" className="sh-btn-ghost sh-bb-sync-btn" disabled={!typed.trim()}>
              CHECK
            </button>
          ) : null}
        </form>
      )}

      {result ? (
        <div className={`sh-pt-feedback${result.correct ? " sh-pt-feedback--ok" : " sh-pt-feedback--miss"}`}>
          <span className="mono">{result.correct ? (result.close ? "✓ CORRECT (CHECK SPELLING)" : "✓ CORRECT") : "✕ MISSED"}</span>
          {!result.correct || result.close ? <span className="sh-pt-feedback-answer">{q.answer}</span> : null}
          <button ref={nextRef} type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={onNext}>
            {index + 1 >= total ? "SEE RESULTS" : "NEXT →"}
          </button>
        </div>
      ) : null}
      <p className="drill-nav-hint mono">{q.options ? "1–4 · ANSWER" : "ENTER · CHECK"} &nbsp;&nbsp; ENTER · NEXT</p>
    </div>
  );
}

function TestResults({ questions, results, modules, onRetakeMissed, onNewTest }) {
  const correct = results.filter((r) => r?.correct).length;
  const pct = Math.round((correct / questions.length) * 100) || 0;
  const missed = questions.filter((_, i) => !results[i]?.correct);
  const titleFor = (id) => modules.find((m) => m.id === id)?.title || "Unsorted";
  const byModule = new Map();
  questions.forEach((q, i) => {
    const k = q.item.moduleId || "";
    const row = byModule.get(k) || { right: 0, total: 0 };
    row.total += 1;
    if (results[i]?.correct) row.right += 1;
    byModule.set(k, row);
  });

  return (
    <div className="sh-pt-results">
      <div className="sh-pt-score">
        <span
          className="sh-pt-score-value mono"
          style={{ color: pct >= 80 ? "var(--sh-green)" : pct >= 60 ? "var(--sh-amber)" : "var(--sh-red)" }}
        >
          {pct}%
        </span>
        <span className="sh-pt-score-sub mono">
          {correct} / {questions.length} CORRECT
        </span>
      </div>

      {byModule.size > 1 ? (
        <div className="sh-mirror-group">
          <div className="sh-hub-section-label">BY MODULE</div>
          <ul className="sh-today-list">
            {[...byModule.entries()].map(([id, r]) => (
              <li key={id} className="sh-today-row">
                <span className="sh-today-row-main">
                  <span className="sh-today-row-title">{titleFor(id)}</span>
                </span>
                <span className="sh-today-score">
                  {r.right}/{r.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missed.length ? (
        <div className="sh-mirror-group">
          <div className="sh-hub-section-label">MISSED · {missed.length}</div>
          <ul className="sh-today-list">
            {missed.map((q) => (
              <li key={q.id} className="sh-pt-missed">
                <span className="sh-pt-missed-term">{q.item.term}</span>
                <span className="sh-pt-missed-def">{q.item.definition}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sh-pt-actions">
        {missed.length ? (
          <button type="button" className="sh-btn-ghost sh-btn-green sh-bb-sync-btn" onClick={() => onRetakeMissed(missed)}>
            RETAKE MISSED · {missed.length}
          </button>
        ) : null}
        <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={onNewTest}>
          NEW TEST
        </button>
      </div>
    </div>
  );
}

export function PracticeTestView({ course }) {
  const courseUuid = course?.uuid || course?.id;
  const modules = useMemo(() => course?.modules || [], [course?.modules]);
  const pool = useMemo(() => buildQuestionPool(course), [course]);
  const [questions, setQuestions] = useState(null);
  const [results, setResults] = useState([]);
  const [pos, setPos] = useState(0);
  const startedRef = useRef(null);

  const begin = (qs) => {
    setQuestions(qs);
    setResults([]);
    setPos(0);
    startedRef.current = new Date().toISOString();
  };

  const start = (config) =>
    begin(buildTest({ scoped: poolForModules(pool, config.moduleIds), coursePool: pool, ...config }));

  const answer = useCallback(
    ({ choice, text }) => {
      const q = questions?.[pos];
      if (!q || results[pos]) return;
      let r;
      if (q.options) r = { choice, correct: choice === q.answerIndex };
      else {
        const grade = gradeTyped(text, q.answer);
        r = { text, correct: !!grade, close: grade === "close" };
      }
      setResults((prev) => {
        const next = [...prev];
        next[pos] = r;
        return next;
      });
    },
    [questions, pos, results]
  );

  const finished = questions && pos >= questions.length;

  useEffect(() => {
    if (!finished || !questions.length) return;
    const correct = results.filter((r) => r?.correct).length;
    void window.studyHub?.db?.sessions?.log?.({
      courseUuid,
      kind: "test",
      startedAt: startedRef.current,
      endedAt: new Date().toISOString(),
      reviewed: questions.length,
      correct,
      incorrect: questions.length - correct,
    });
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="main-content sh-mirror-view sh-pt">
      <div className="sh-mirror-head">
        <div className="sh-section-label">PRACTICE TEST</div>
        {questions && !finished ? (
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={() => setQuestions(null)}>
            QUIT
          </button>
        ) : null}
      </div>
      {!questions ? (
        <TestSetup modules={modules} pool={pool} onStart={start} />
      ) : !questions.length ? (
        <>
          <p className="sh-today-empty">Not enough terms in that scope for the chosen formats.</p>
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={() => setQuestions(null)}>
            BACK
          </button>
        </>
      ) : finished ? (
        <TestResults
          questions={questions}
          results={results}
          modules={modules}
          onRetakeMissed={(missed) => begin(retakeQuestions(missed, pool))}
          onNewTest={() => setQuestions(null)}
        />
      ) : (
        <QuestionCard
          q={questions[pos]}
          index={pos}
          total={questions.length}
          result={results[pos]}
          onAnswer={answer}
          onNext={() => setPos((p) => p + 1)}
        />
      )}
    </div>
  );
}
