import { useEffect, useMemo, useState } from "react";
import { examForCard, getDueCards } from "../../study/sm2.js";
import { loadFlashcardDeck } from "../../study/flashcards/flashcardPersistence.js";
import { ensureUserCourse } from "../../hub/userCourseModel.js";
import { loadUpcomingExams } from "../study/examEstimate.js";
import { buildDecksView } from "./decksView.js";

const RELOAD_EVENTS = ["studyhub-mirror-changed", "studyhub-bb-synced", "studyhub-exam-scope-changed"];

/** `onOpenCourse(id, { tab: "drill" })` opens that course on its flashcard deck. */
export function DecksScreen({ userCourses, onOpenCourse }) {
  const courses = useMemo(
    () => [
      { id: "builtin", name: "OM 300", cards: loadFlashcardDeck() },
      ...(userCourses || []).map((c) => {
        const ec = ensureUserCourse(c);
        return { id: ec.id, name: ec.name, cards: ec.flashcards };
      }),
    ],
    [userCourses]
  );
  const [exams, setExams] = useState({});
  const [pace, setPace] = useState(null);

  useEffect(() => {
    let alive = true;
    const ids = courses.filter((c) => c.id !== "builtin" && c.cards.length).map((c) => c.id);
    const load = () =>
      void Promise.all(ids.map((id) => loadUpcomingExams(id))).then((lists) => {
        if (alive) setExams(Object.fromEntries(ids.map((id, i) => [id, lists[i]])));
      });
    load();
    RELOAD_EVENTS.forEach((name) => window.addEventListener(name, load));
    return () => {
      alive = false;
      RELOAD_EVENTS.forEach((name) => window.removeEventListener(name, load));
    };
  }, [courses]);

  useEffect(() => {
    let alive = true;
    void window.studyHub?.db?.dashboard?.get?.().then((res) => {
      if (alive) setPace(res?.stats?.avgSecondsPerCard || null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(() => {
    const dueByCourse = Object.fromEntries(
      courses.map((c) => [c.id, getDueCards(c.cards, { examFor: (card) => examForCard(card, exams[c.id])?.dueDate ?? null }).length])
    );
    return buildDecksView({ courses, dueByCourse, exams, avgSecondsPerCard: pace });
  }, [courses, exams, pace]);

  const review = (id) => onOpenCourse(id, { tab: "drill" });

  return (
    <section className="sh-decks-screen">
      <header className="sh-decks-head">
        <div>
          <h1 className="sh-decks-title">Decks</h1>
          <p className="sh-decks-sum">
            <span className="sh-decks-num">{view.totalDue}</span> cards due · ~<span className="sh-decks-num">{view.minutes}</span> min
          </p>
        </div>
        <button
          type="button"
          className="sh-btn-accent sh-btn-accent--glow"
          disabled={!view.urgentCourseId}
          onClick={() => review(view.urgentCourseId)}
        >
          Review all due
        </button>
      </header>

      {view.groups.length === 0 ? (
        <div className="sh-panel sh-decks-empty">
          <p>No flashcards yet. Import a course or make cards in one and they show up here.</p>
        </div>
      ) : (
        view.groups.map((g) => (
          <div key={g.courseId} className="sh-panel sh-decks-group">
            <div className="sh-decks-group-head">
              <h2 className="sh-decks-course">{g.name}</h2>
              {g.examLabel ? <span className="sh-decks-exam">{g.examLabel}</span> : null}
            </div>
            <ul className="sh-decks-rows">
              {g.rows.map((r) => (
                <li key={r.name} className="sh-decks-row">
                  <span className="sh-decks-row-name">{r.name}</span>
                  <span className={`sh-decks-due${r.due ? "" : " sh-decks-due--none"}`}>
                    <b>{r.due}</b>/{r.total} due
                  </span>
                  <span className="sh-decks-mastery" title={`${Math.round(r.mastery * 100)}% mastered`}>
                    <span className="sh-decks-bar">
                      <i style={{ width: `${Math.round(r.mastery * 100)}%` }} />
                    </span>
                    <span className="sh-decks-pct">{Math.round(r.mastery * 100)}%</span>
                  </span>
                  <button type="button" className="sh-btn-quiet sh-decks-review" onClick={() => review(g.courseId)}>
                    Review
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
