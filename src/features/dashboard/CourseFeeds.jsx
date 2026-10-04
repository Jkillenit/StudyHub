import { useCallback, useEffect, useState } from "react";
import { daysFromToday, dueLabel, shortDate } from "./dateLabels.js";
import { cardsInScope, estimateExam, formatMinutes } from "../study/examEstimate.js";
import { courseStore } from "../../db/courseStore.js";
import { shortCourse } from "./courseLabel.js";

const EMPTY = { upcoming: [], announcements: [], dueCards: [], stats: null };

function CardsDue({ rows, onOpenCourse }) {
  if (!rows.length) return <p className="sh-today-empty">No flashcards yet.</p>;
  return (
    <ul className="sh-today-list">
      {rows.map((r) => (
        <li key={r.course_uuid}>
          <button type="button" className="sh-today-row sh-today-row--button" onClick={() => onOpenCourse(r.course_uuid)}>
            <span className="sh-today-row-main">
              <span className="sh-today-row-title">{shortCourse(r.course_name)}</span>
              <span className="sh-today-row-sub">{r.total} cards</span>
            </span>
            <span className={`sh-today-count${r.due ? " sh-today-count--due" : ""}`}>{r.due || 0} due</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Announcements({ items, onRead }) {
  const [openId, setOpenId] = useState(null);
  if (!items.length) return <p className="sh-today-empty">No announcements synced.</p>;
  return (
    <ul className="sh-today-list">
      {items.map((a) => {
        const open = openId === a.uuid;
        return (
          <li key={a.uuid}>
            <button
              type="button"
              className="sh-today-row sh-today-row--button"
              aria-expanded={open}
              onClick={() => {
                setOpenId(open ? null : a.uuid);
                if (!a.read) onRead(a);
              }}
            >
              <span className={`sh-today-dot${a.read ? "" : " sh-today-dot--unread"}`} />
              <span className="sh-today-row-main">
                <span className="sh-today-row-title sh-today-row-title--wrap">{a.title}</span>
                <span className="sh-today-row-sub">
                  {shortCourse(a.course_name)}
                  {a.posted_at ? ` · ${shortDate(a.posted_at)}` : ""}
                </span>
              </span>
            </button>
            {open && a.body ? <p className="sh-today-ann-body">{a.body}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ExamPrep({ exams, userCourses, pace, onOpenCourse }) {
  const [scopes, setScopes] = useState({});
  const examKey = exams.map((e) => e.uuid).join(",");

  useEffect(() => {
    let alive = true;
    const load = () => {
      const courseUuids = [...new Set(exams.map((e) => e.course_uuid))];
      void Promise.all(courseUuids.map((uuid) => courseStore.getExamScopes(uuid))).then((all) => {
        if (!alive) return;
        const merged = Object.assign({}, ...all);
        setScopes(Object.fromEntries(Object.entries(merged).map(([uuid, s]) => [uuid, s.moduleIds])));
      });
    };
    load();
    window.addEventListener("studyhub-exam-scope-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("studyhub-exam-scope-changed", load);
    };
  }, [examKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = exams
    .map((e) => {
      const course = userCourses.find((c) => (c.uuid || c.id) === e.course_uuid);
      const est = estimateExam(cardsInScope(course?.flashcards, scopes[e.uuid]), {
        avgSecondsPerCard: pace,
        examDate: e.due_date,
      });
      return { e, est };
    })
    .filter((r) => r.est.total > 0);
  if (!rows.length) return null;

  return (
    <div className="sh-panel sh-feed" data-perch>
      <h2 className="sh-hud-title">EXAM PREP</h2>
      <ul className="sh-today-list">
        {rows.map(({ e, est }) => (
          <li key={e.uuid}>
            <button type="button" className="sh-today-row sh-today-row--button" onClick={() => onOpenCourse(e.course_uuid)}>
              <span className="sh-today-row-main">
                <span className="sh-today-row-title">{e.title}</span>
                <span className="sh-today-row-sub">
                  {shortCourse(e.course_name)} · {dueLabel(e.due_date)} · {est.readiness}% ready
                </span>
              </span>
              <span className="sh-today-count sh-today-count--due">
                {est.perDayMinutes ? `${formatMinutes(est.perDayMinutes)}/day` : "Ready"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Announcements, flashcards due and exam prep across every course (the Courses page side column). */
export function CourseFeeds({ refreshKey = 0, onOpenCourse, userCourses = [] }) {
  const [data, setData] = useState(EMPTY);

  const load = useCallback(async () => {
    const res = await courseStore.getDashboard();
    if (res) setData({ ...EMPTY, ...res });
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener("studyhub-mirror-changed", onChange);
    window.addEventListener("studyhub-bb-synced", onChange);
    return () => {
      window.removeEventListener("studyhub-mirror-changed", onChange);
      window.removeEventListener("studyhub-bb-synced", onChange);
    };
  }, [load]);

  const markRead = async (a) => {
    await courseStore.markAnnouncementRead(a.uuid);
    setData((d) => ({ ...d, announcements: d.announcements.map((x) => (x.uuid === a.uuid ? { ...x, read: 1 } : x)) }));
  };

  return (
    <div className="sh-feeds">
      <ExamPrep
        exams={data.upcoming.filter((a) => a.kind === "exam" && !a.completed && (daysFromToday(a.due_date) ?? -1) >= 0)}
        userCourses={userCourses}
        pace={data.stats?.avgSecondsPerCard || null}
        onOpenCourse={onOpenCourse}
      />
      <div className="sh-panel sh-feed" data-perch data-tour-id="today-cards">
        <h2 className="sh-hud-title">FLASHCARDS</h2>
        <CardsDue rows={data.dueCards} onOpenCourse={onOpenCourse} />
      </div>
      <div className="sh-panel sh-feed" data-perch>
        <h2 className="sh-hud-title">ANNOUNCEMENTS</h2>
        <Announcements items={data.announcements} onRead={markRead} />
      </div>
    </div>
  );
}
