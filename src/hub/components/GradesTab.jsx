import { useEffect, useMemo, useState } from "react";
import { parseSyllabus } from "../../syllabus/syllabusParser";

export default function GradesTab({ course, onSaveComponents }) {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function load() {
      const uuid = course?.uuid || course?.id;
      if (!uuid) {
        setLoading(false);
        return;
      }
      const rows = (await window.studyHub?.db?.grades?.getComponents(uuid)) || [];
      const entries = (await window.studyHub?.db?.grades?.getEntries(uuid)) || [];
      const scoreByComponent = new Map(entries.map((entry) => [entry.component_id, entry.score]));
      const hydrated = rows.map((row) => ({
        ...row,
        score: scoreByComponent.has(row.id) ? scoreByComponent.get(row.id) : null,
      }));
      if (hydrated.length > 0) setComponents(hydrated);
      setLoading(false);
    }
    void load();
  }, [course?.uuid, course?.id]);

  const { currentGrade } = useMemo(() => {
    const scored = components.filter((component) => component.score !== null && component.score !== undefined);
    if (scored.length === 0) {
      return { currentGrade: null };
    }
    const scoredWeight = scored.reduce((sum, component) => sum + Number(component.weight || 0), 0);
    const weightedSum = scored.reduce(
      (sum, component) => sum + Number(component.score || 0) * Number(component.weight || 0),
      0
    );
    const current = scoredWeight > 0 ? (weightedSum / scoredWeight) * 100 : null;
    return { currentGrade: current };
  }, [components]);

  async function handleImport() {
    const result = await window.studyHub?.openFileDialog?.({
      filters: [{ name: "Syllabus", extensions: ["pdf", "docx", "doc", "pptx"] }],
    });
    if (result?.canceled || !result?.filePath) return;
    setStatus("READING SYLLABUS...");
    const extracted = await window.studyHub?.extractText?.(result.filePath);
    if (!extracted?.success || !extracted?.text) {
      setStatus("Could not read file - try a different format");
      return;
    }
    setStatus("EXTRACTING GRADE SCHEMA...");
    const parsed = parseSyllabus(extracted.text);
    if (parsed.grading.length === 0) {
      setStatus("No grade components found - try adding manually");
      return;
    }
    const newComponents = parsed.grading.map((component) => ({ ...component, score: null }));
    setComponents(newComponents);
    await onSaveComponents(newComponents);
    setStatus(`Found ${newComponents.length} components - enter your scores below`);
  }

  function handleScoreChange(index, value) {
    const parsed = value === "" ? null : parseFloat(value);
    const updated = components.map((component, i) => (i === index ? { ...component, score: parsed } : component));
    setComponents(updated);
    void onSaveComponents(updated);
  }

  if (loading) return <div className="sh-skeleton-pulse" style={{ height: 240 }} />;

  if (components.length === 0) {
    return (
      <div className="sh-grades-empty">
        <div className="sh-section-label">GRADE CALCULATOR</div>
        <p className="sh-grades-empty-text">Import your syllabus or add components manually.</p>
        <div className="sh-grades-empty-actions">
          <button className="sh-btn-ghost sh-btn-green" onClick={handleImport}>
            IMPORT SYLLABUS
          </button>
          <button
            className="sh-btn-ghost"
            onClick={() =>
              setComponents([{ name: "Homework", weight: 0.2, category: "homework", score: null }])
            }
          >
            + ADD MANUALLY
          </button>
        </div>
        {status ? <div className="sh-grades-status">{status}</div> : null}
      </div>
    );
  }

  return (
    <div className="sh-grades-view">
      <div className="sh-grades-header">
        <div className="sh-section-label">GRADE CALCULATOR</div>
        <button className="sh-btn-ghost sh-btn-xs" onClick={handleImport}>
          RE-IMPORT SYLLABUS
        </button>
      </div>

      {status ? (
        <div
          className="sh-grades-status"
          style={{ color: status.startsWith("Found") ? "var(--sh-green)" : "var(--sh-amber)" }}
        >
          {status}
        </div>
      ) : null}

      <div className="sh-current-grade">
        <span
          className="sh-grade-value"
          style={{
            color:
              currentGrade === null
                ? "var(--sh-text-dim)"
                : currentGrade >= 90
                  ? "var(--sh-green)"
                  : currentGrade >= 80
                    ? "var(--sh-cyan)"
                    : currentGrade >= 70
                      ? "var(--sh-amber)"
                      : "var(--sh-red)",
          }}
        >
          {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : "—"}
        </span>
        <span className="sh-grade-label">{currentGrade !== null ? "CURRENT GRADE" : "NO SCORES YET"}</span>
      </div>

      <div className="sh-grades-table">
        <div className="sh-grades-thead">
          <span className="sh-grades-col sh-grades-col--name">COMPONENT</span>
          <span className="sh-grades-col sh-grades-col--weight">WEIGHT</span>
          <span className="sh-grades-col sh-grades-col--score">SCORE</span>
          <span className="sh-grades-col sh-grades-col--contribution">CONTRIB</span>
        </div>

        {components.map((component, i) => {
          const contrib =
            component.score !== null && component.score !== undefined
              ? (component.score / 100) * Number(component.weight || 0) * 100
              : null;
          return (
            <div key={`${component.id || component.name}-${i}`} className="sh-grades-row">
              <span className="sh-grades-col sh-grades-col--name">
                <span className={`sh-category-dot sh-category-dot--${component.category || "other"}`} />
                {component.name}
              </span>
              <span className="sh-grades-col sh-grades-col--weight mono">
                {(Number(component.weight || 0) * 100).toFixed(0)}%
              </span>
              <span className="sh-grades-col sh-grades-col--score">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="—"
                  value={component.score ?? ""}
                  onChange={(event) => handleScoreChange(i, event.target.value)}
                  className="sh-score-input"
                />
              </span>
              <span
                className="sh-grades-col sh-grades-col--contribution mono"
                style={{ color: contrib !== null ? "var(--sh-text-primary)" : "var(--sh-text-dim)" }}
              >
                {contrib !== null ? contrib.toFixed(2) : "—"}
              </span>
            </div>
          );
        })}

        <div className="sh-grades-row sh-grades-row--total">
          <span className="sh-grades-col sh-grades-col--name mono">TOTAL</span>
          <span className="sh-grades-col sh-grades-col--weight mono">
            {(components.reduce((sum, component) => sum + Number(component.weight || 0), 0) * 100).toFixed(0)}%
          </span>
          <span className="sh-grades-col sh-grades-col--score" />
          <span
            className="sh-grades-col sh-grades-col--contribution mono"
            style={{ color: currentGrade !== null ? "var(--sh-green)" : "var(--sh-text-dim)" }}
          >
            {currentGrade !== null ? currentGrade.toFixed(2) : "—"}
          </span>
        </div>
      </div>

      <div className="sh-grades-actions">
        <button
          className="sh-btn-ghost sh-btn-xs"
          onClick={() => {
            const updated = [
              ...components,
              { name: "New Component", weight: 0.05, category: "other", score: null },
            ];
            setComponents(updated);
            void onSaveComponents(updated);
          }}
        >
          + ADD COMPONENT
        </button>
      </div>
    </div>
  );
}
