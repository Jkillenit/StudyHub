import { useEffect, useMemo, useState } from "react";
import { dueLabel, shortDate } from "../dashboard/dateLabels.js";
import { buildStudyGuide, guideToMarkdown } from "./studyGuide.js";
import { cardsInScope, estimateExam, formatMinutes, loadScope, saveScope } from "./examEstimate.js";

const CUSTOM = "custom";

function EstimatePanel({ est, exam }) {
  if (!est.total) {
    return <p className="sh-today-empty">No flashcards in this scope yet, so there is nothing to estimate.</p>;
  }
  const past = est.days != null && est.days < 0;
  return (
    <div className="sh-guide-est">
      <div className="sh-prog-stats">
        {exam && !past ? (
          <div className="sh-today-stat">
            <span className="sh-today-stat-value">{est.days}</span>
            <span className="sh-today-stat-label">DAYS LEFT</span>
          </div>
        ) : null}
        <div className="sh-today-stat">
          <span className="sh-today-stat-value">{formatMinutes(est.totalMinutes)}</span>
          <span className="sh-today-stat-label">REVIEW LEFT</span>
        </div>
        {est.perDayMinutes != null && !past ? (
          <div className="sh-today-stat">
            <span className="sh-today-stat-value">{formatMinutes(est.perDayMinutes)}</span>
            <span className="sh-today-stat-label">PER DAY</span>
          </div>
        ) : null}
        <div className="sh-today-stat">
          <span className="sh-today-stat-value">{est.readiness}%</span>
          <span className="sh-today-stat-label">READY</span>
        </div>
      </div>
      <p className="sh-guide-est-note mono">
        {est.total} CARDS · {est.fresh} NEW · {est.weak} WEAK · {est.learning} LEARNING · {est.mastered} MASTERED · ~
        {Math.round(est.pace)}S PER CARD
      </p>
    </div>
  );
}

function GuideModule({ m, includeNotes }) {
  const empty = !m.terms.length && !m.sections.length && !m.formulas.length && !(includeNotes && m.notes);
  return (
    <section className="sh-guide-module">
      <h2 className="sh-guide-module-title">{m.title}</h2>
      {empty ? <p className="sh-today-empty">Nothing imported for this module yet.</p> : null}
      {m.terms.length ? (
        <>
          <div className="sh-hub-section-label">KEY TERMS · {m.terms.length}</div>
          <dl className="sh-guide-terms">
            {m.terms.map((t) => (
              <div key={t.term} className={`sh-guide-term${t.weak ? " sh-guide-term--weak" : ""}`}>
                <dt>{t.term}</dt>
                <dd>{t.definition}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {m.sections.map((s, i) => (
        <div key={`${s.title}-${i}`} className="sh-guide-section">
          <div className="sh-hub-section-label">{String(s.title).toUpperCase()}</div>
          <ul>
            {s.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {m.formulas.length ? (
        <div className="sh-guide-section">
          <div className="sh-hub-section-label">FORMULAS</div>
          <ul>
            {m.formulas.map((f, i) => (
              <li key={i}>
                <code className="mono">{f.formula}</code>
                {f.context ? ` — ${f.context}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {includeNotes && m.notes ? (
        <div className="sh-guide-section">
          <div className="sh-hub-section-label">MY NOTES</div>
          <p className="sh-guide-notes">{m.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

export function StudyGuideView({ course }) {
  const courseUuid = course?.uuid || course?.id;
  const modules = useMemo(
    () => (course?.modules || []).filter((m) => !(course?.disabledModuleIds || []).includes(m.id)),
    [course?.modules, course?.disabledModuleIds]
  );
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState(CUSTOM);
  const [moduleIds, setModuleIds] = useState([]);
  const [pace, setPace] = useState(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      window.studyHub?.db?.assignments?.getByCourse?.(courseUuid),
      window.studyHub?.db?.sessions?.stats?.(courseUuid),
    ]).then(([rows, stats]) => {
      if (!alive) return;
      const upcoming = (Array.isArray(rows) ? rows : [])
        .filter((a) => a.kind === "exam" && !a.completed && a.due_date && new Date(a.due_date) >= new Date(Date.now() - 86400000))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      setExams(upcoming);
      setPace(stats?.avgSecondsPerCard || null);
      if (upcoming.length) setExamId(upcoming[0].uuid);
    });
    return () => {
      alive = false;
    };
  }, [courseUuid]);

  useEffect(() => {
    let alive = true;
    if (examId === CUSTOM) return undefined;
    void loadScope(examId).then((ids) => {
      if (alive) setModuleIds(ids.filter((id) => modules.some((m) => m.id === id)));
    });
    return () => {
      alive = false;
    };
  }, [examId, modules]);

  const exam = exams.find((e) => e.uuid === examId) || null;
  const guide = useMemo(() => buildStudyGuide(course, moduleIds), [course, moduleIds]);
  const est = useMemo(
    () => estimateExam(cardsInScope(course?.flashcards, moduleIds), { avgSecondsPerCard: pace, examDate: exam?.due_date }),
    [course?.flashcards, moduleIds, pace, exam?.due_date]
  );

  const setScope = (ids) => {
    setModuleIds(ids);
    if (exam) saveScope(exam.uuid, ids);
  };
  const toggleModule = (id) => setScope(moduleIds.includes(id) ? moduleIds.filter((x) => x !== id) : [...moduleIds, id]);

  const title = `${course?.name || "Course"} — ${exam ? exam.title : "Study Guide"}`;
  const copyMarkdown = async () => {
    const md = guideToMarkdown(guide, {
      title,
      examLabel: exam ? `Exam ${shortDate(exam.due_date)}` : "",
      includeNotes,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="main-content sh-mirror-view sh-guide">
      <div className="sh-mirror-head sh-no-print">
        <div className="sh-section-label">STUDY GUIDE</div>
        <div className="sh-bb-sync-actions">
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={() => void copyMarkdown()}>
            {copied ? "✓ COPIED" : "COPY AS MARKDOWN"}
          </button>
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" onClick={() => window.print()}>
            PRINT
          </button>
        </div>
      </div>

      <div className="sh-guide-controls sh-no-print">
        <div className="sh-hub-section-label">EXAM</div>
        <div className="sh-pt-chips">
          {exams.map((e) => (
            <button
              key={e.uuid}
              type="button"
              className={`sh-pt-chip${examId === e.uuid ? " active" : ""}`}
              onClick={() => setExamId(e.uuid)}
            >
              {e.title} · {dueLabel(e.due_date)}
            </button>
          ))}
          <button
            type="button"
            className={`sh-pt-chip${examId === CUSTOM ? " active" : ""}`}
            onClick={() => {
              setExamId(CUSTOM);
              setModuleIds([]);
            }}
          >
            NO EXAM DATE
          </button>
        </div>
        {!exams.length ? (
          <p className="sh-guide-hint">
            Exams from Blackboard or ones you add under Assignments (type: exam) show up here with a countdown.
          </p>
        ) : null}

        <div className="sh-hub-section-label">COVERS</div>
        <div className="sh-pt-chips">
          <button type="button" className={`sh-pt-chip${!moduleIds.length ? " active" : ""}`} onClick={() => setScope([])}>
            ALL MODULES
          </button>
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`sh-pt-chip${moduleIds.includes(m.id) ? " active" : ""}`}
              onClick={() => toggleModule(m.id)}
            >
              {m.title || m.label}
            </button>
          ))}
        </div>
        <label className="sh-pt-check">
          <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
          Include my notes
        </label>
      </div>

      <div className="sh-mirror-group sh-no-print">
        <div className="sh-hub-section-label">TIME ESTIMATE</div>
        <EstimatePanel est={est} exam={exam} />
      </div>

      <article className="sh-guide-doc">
        <h1 className="sh-guide-title">{title}</h1>
        {exam ? <p className="sh-guide-sub mono">EXAM {shortDate(exam.due_date)}</p> : null}
        {guide.focus.length ? (
          <section className="sh-guide-module sh-guide-focus">
            <h2 className="sh-guide-module-title">Focus list</h2>
            <p className="sh-guide-hint">Cards you have been missing. Start here.</p>
            <dl className="sh-guide-terms">
              {guide.focus.map((f) => (
                <div key={f.term} className="sh-guide-term sh-guide-term--weak">
                  <dt>{f.term}</dt>
                  <dd>{f.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {guide.modules.map((m) => (
          <GuideModule key={m.id} m={m} includeNotes={includeNotes} />
        ))}
      </article>
    </div>
  );
}
