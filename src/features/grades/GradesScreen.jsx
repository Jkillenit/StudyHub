import { useCallback, useEffect, useRef, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { formatPct } from "../today/priority.js";
import { buildGradesView } from "./gradesView.js";

const RELOAD_EVENTS = ["studyhub-mirror-changed", "studyhub-bb-synced", "studyhub-target-changed"];
const SPARK_W = 96;
const SPARK_H = 28;

async function gradeItemsFor(courseUuid) {
  try {
    const rows = await window.studyHub?.db?.bb?.getGradeItems?.(courseUuid);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function Sparkline({ points }) {
  if (points.length < 2) return <span className="sh-ghub-spark" aria-hidden="true" />;
  const min = Math.min(...points);
  const span = Math.max(...points) - min;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * SPARK_W;
    const y = span > 0 ? 2 + (1 - (p - min) / span) * (SPARK_H - 4) : SPARK_H / 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="sh-ghub-spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-label="Grade trend">
      <polyline points={coords.join(" ")} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** `onOpenCourse(id, { tab: "grades" })` opens that course on its grades tab. */
export function GradesScreen({ onOpenCourse }) {
  const [rows, setRows] = useState(null);
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadIdRef.current;
    const data = await courseStore.loadTodayData();
    const courses = data?.courses || [];
    const [scales, items] = await Promise.all([
      Promise.all(courses.map(async (c) => [c.uuid, await courseStore.getGradingScale(c.uuid)])),
      Promise.all(courses.map(async (c) => [c.uuid, await gradeItemsFor(c.uuid)])),
    ]);
    if (id !== loadIdRef.current) return;
    setRows(buildGradesView(courses, { now: data?.now, scales: Object.fromEntries(scales), gradeItems: Object.fromEntries(items) }));
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    RELOAD_EVENTS.forEach((name) => window.addEventListener(name, onChange));
    return () => RELOAD_EVENTS.forEach((name) => window.removeEventListener(name, onChange));
  }, [load]);

  return (
    <section className="sh-panel sh-hub-block sh-grades-screen">
      <h2 className="sh-ghub-title">Grades</h2>
      {rows && !rows.length && (
        <p className="sh-hub-empty-hint">No grades yet. Connect Blackboard or add a course and your grades show here.</p>
      )}
      {rows?.length > 0 && (
        <ul className="sh-ghub-list">
          {rows.map((r) => (
            <li key={r.courseId} className={`sh-ghub-row${r.atRisk ? " sh-ghub-row--risk" : ""}`}>
              <div className="sh-ghub-main">
                <div className="sh-ghub-name">{r.name}</div>
                <div className="sh-ghub-next">{r.nextStep || "No grades in yet"}</div>
              </div>
              <Sparkline points={r.trend} />
              <div className="sh-ghub-grade">
                <span className="sh-ghub-pct">{r.current == null ? "—" : `${formatPct(r.current)}%`}</span>
                {r.letter && <span className="sh-ghub-letter">{r.letter}</span>}
              </div>
              <button type="button" className="sh-ghub-whatif" onClick={() => onOpenCourse(r.courseId, { tab: "grades" })}>
                What if…
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
