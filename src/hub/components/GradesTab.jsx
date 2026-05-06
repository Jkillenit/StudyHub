import { useEffect, useMemo, useState } from "react";
import { parseSyllabus } from "../../syllabus/syllabusParser";

function getCurrentLetter(grade, scale) {
  if (grade === null || !scale) return null;
  const grades = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  for (const [letter, threshold] of grades) {
    if (grade >= threshold) return letter;
  }
  return grades.length ? grades[grades.length - 1][0] : null;
}

function GradeScaleDisplay({ scale, currentGrade }) {
  if (!scale) return null;
  const grades = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  const currentLetter = getCurrentLetter(currentGrade, scale);
  return (
    <div className="sh-grade-scale">
      <div className="sh-section-label">GRADING SCALE</div>
      <div className="sh-grade-scale-grid">
        {grades.map(([letter, threshold]) => {
          const isCurrent = letter === currentLetter;
          return (
            <div key={letter} className={`sh-grade-scale-row ${isCurrent ? "sh-grade-scale-row--current" : ""}`}>
              <span className="sh-grade-scale-letter" style={{ color: isCurrent ? "var(--sh-green)" : "var(--sh-text-dim)" }}>
                {letter}
              </span>
              <span
                className="sh-grade-scale-threshold mono"
                style={{ color: isCurrent ? "var(--sh-text-primary)" : "var(--sh-text-dim)" }}
              >
                {threshold}%+
              </span>
              {isCurrent ? <span className="sh-grade-scale-indicator">{"<- YOU ARE HERE"}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HypotheticalEngine({ components, gradingScale }) {
  const [target, setTarget] = useState(90);
  const scored = components.filter((c) => c.score !== null && c.score !== undefined);
  const unscored = components.filter((c) => c.score === null || c.score === undefined);
  if (scored.length === 0 || unscored.length === 0) return null;

  const scoredContrib = scored.reduce((sum, c) => sum + Number(c.score || 0) * Number(c.weight || 0), 0);
  const remainingWeight = unscored.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  const needed = remainingWeight > 0 ? (target - scoredContrib) / remainingWeight : null;
  const isPossible = needed !== null && needed <= 100;
  const isAlreadyAchieved = needed !== null && needed <= 0;

  function getLetter(pct) {
    return getCurrentLetter(pct, gradingScale);
  }

  const targetOptions = gradingScale
    ? Object.entries(gradingScale)
        .sort((a, b) => b[1] - a[1])
        .map(([letter, threshold]) => ({ letter, threshold }))
    : [
        { letter: "A", threshold: 90 },
        { letter: "B", threshold: 80 },
        { letter: "C", threshold: 70 },
        { letter: "D", threshold: 60 },
      ];

  return (
    <div className="sh-hypothetical">
      <div className="sh-hypothetical-header">
        <div className="sh-section-label">WHAT DO I NEED?</div>
        <div className="sh-target-selector">
          <span className="sh-target-label">TARGET:</span>
          <div className="sh-target-options">
            {targetOptions.map((opt) => (
              <button
                key={opt.letter}
                className={`sh-target-btn ${target === opt.threshold ? "sh-target-btn--active" : ""}`}
                onClick={() => setTarget(opt.threshold)}
              >
                {opt.letter}
              </button>
            ))}
            <input
              type="number"
              min="0"
              max="100"
              value={target}
              onChange={(event) => setTarget(parseFloat(event.target.value) || 0)}
              className="sh-target-input"
            />
          </div>
        </div>
      </div>
      <div className="sh-hypothetical-result">
        {isAlreadyAchieved ? (
          <div className="sh-hyp-achieved">
            <span className="sh-hyp-check">✓</span>
            <span>Already achieved - you have a {getLetter(target)} regardless of remaining work</span>
          </div>
        ) : !isPossible ? (
          <div className="sh-hyp-impossible">
            <span className="sh-hyp-x">✕</span>
            <span>NOT POSSIBLE - would need {needed?.toFixed(1)}% average on remaining work</span>
          </div>
        ) : (
          <div className="sh-hyp-breakdown">
            <div className="sh-hyp-summary">
              You need an average of{" "}
              <span
                className="sh-hyp-score"
                style={{
                  color:
                    needed <= 70
                      ? "var(--sh-green)"
                      : needed <= 85
                        ? "var(--sh-cyan)"
                        : needed <= 95
                          ? "var(--sh-amber)"
                          : "var(--sh-red)",
                }}
              >
                {needed.toFixed(1)}%
              </span>{" "}
              across remaining components to get a {getLetter(target)}.
            </div>
            <div className="sh-hyp-components">
              {unscored.map((component, i) => (
                <div key={`${component.name}-${i}`} className="sh-hyp-row">
                  <span className="sh-hyp-name">{component.name}</span>
                  <span
                    className="sh-hyp-needed mono"
                    style={{
                      color:
                        needed <= 100
                          ? needed <= 70
                            ? "var(--sh-green)"
                            : needed <= 85
                              ? "var(--sh-cyan)"
                              : "var(--sh-amber)"
                          : "var(--sh-red)",
                    }}
                  >
                    {needed.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WhatIfSimulator({ components }) {
  const unscored = components.filter((c) => c.score === null || c.score === undefined);
  const [simScores, setSimScores] = useState(() => {
    const initial = {};
    unscored.forEach((c) => {
      initial[c.name] = 80;
    });
    return initial;
  });

  useEffect(() => {
    setSimScores((prev) => {
      const next = { ...prev };
      unscored.forEach((c) => {
        if (next[c.name] === undefined) next[c.name] = 80;
      });
      Object.keys(next).forEach((name) => {
        if (!unscored.some((component) => component.name === name)) {
          delete next[name];
        }
      });
      return next;
    });
  }, [unscored]);

  if (unscored.length === 0) return null;

  const allWithSim = components.map((c) => {
    if (c.score !== null && c.score !== undefined) return c;
    return { ...c, score: simScores[c.name] ?? 80 };
  });
  const projectedGrade = allWithSim.reduce((sum, c) => sum + Number(c.score || 0) * Number(c.weight || 0), 0);

  return (
    <div className="sh-whatif">
      <div className="sh-section-label">WHAT-IF SIMULATOR</div>
      <div className="sh-whatif-note">Adjust sliders to simulate future scores. Does not affect saved grades.</div>
      <div className="sh-whatif-sliders">
        {unscored.map((component, i) => (
          <div key={`${component.name}-${i}`} className="sh-whatif-row">
            <span className="sh-whatif-name">{component.name}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={simScores[component.name] ?? 80}
              onChange={(event) =>
                setSimScores((prev) => ({
                  ...prev,
                  [component.name]: parseInt(event.target.value, 10),
                }))
              }
              className="sh-whatif-slider"
            />
            <span className="sh-whatif-val mono">{simScores[component.name] ?? 80}%</span>
          </div>
        ))}
      </div>
      <div className="sh-whatif-projected">
        <span className="sh-grade-label">PROJECTED GRADE</span>
        <span
          className="sh-whatif-grade"
          style={{
            color:
              projectedGrade >= 90
                ? "var(--sh-green)"
                : projectedGrade >= 80
                  ? "var(--sh-cyan)"
                  : projectedGrade >= 70
                    ? "var(--sh-amber)"
                    : "var(--sh-red)",
          }}
        >
          {projectedGrade.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function GradeDropCalculator({ components }) {
  const scored = components.filter((c) => c.score !== null && c.score !== undefined);
  if (scored.length === 0) return null;
  const totalGrade = components.reduce((sum, c) => sum + Number(c.score ?? 0) * Number(c.weight || 0), 0);
  const impacts = components
    .map((c) => {
      const withoutThis = components.reduce((sum, other) => {
        if (other.name === c.name) return sum;
        return sum + Number(other.score ?? 0) * Number(other.weight || 0);
      }, 0);
      return {
        name: c.name,
        currentScore: c.score,
        gradeWithZero: withoutThis,
        impact: totalGrade - withoutThis,
      };
    })
    .filter((c) => c.currentScore !== null && c.currentScore !== undefined)
    .sort((a, b) => b.impact - a.impact);
  return (
    <div className="sh-drop-calc">
      <div className="sh-section-label">IF I SCORE ZERO ON...</div>
      <div className="sh-drop-table">
        {impacts.map((item, i) => (
          <div key={`${item.name}-${i}`} className="sh-drop-row">
            <span className="sh-drop-name">{item.name}</span>
            <span
              className="sh-drop-result mono"
              style={{
                color:
                  item.gradeWithZero >= 90
                    ? "var(--sh-green)"
                    : item.gradeWithZero >= 80
                      ? "var(--sh-cyan)"
                      : item.gradeWithZero >= 70
                        ? "var(--sh-amber)"
                        : "var(--sh-red)",
              }}
            >
              {item.gradeWithZero.toFixed(1)}%
            </span>
            <span className="sh-drop-delta mono" style={{ color: "var(--sh-red)", opacity: 0.7 }}>
              -{item.impact.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentRow({ component, index, onScoreChange }) {
  const [expanded, setExpanded] = useState(false);
  const [subEntries, setSubEntries] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [newScore, setNewScore] = useState("");

  useEffect(() => {
    if (!expanded || !component.id) return;
    async function loadSubs() {
      const rows = await window.studyHub?.db?.grades?.getSubEntries(component.id);
      setSubEntries(rows || []);
    }
    void loadSubs();
  }, [expanded, component.id]);

  useEffect(() => {
    if (subEntries.length === 0) return;
    const avg = subEntries.reduce((sum, entry) => sum + Number(entry.score || 0), 0) / subEntries.length;
    const rounded = Math.round(avg * 10) / 10;
    const current = component.score === null || component.score === undefined ? null : Number(component.score);
    if (current !== rounded) {
      onScoreChange(index, rounded.toString());
    }
  }, [subEntries, component.score, index, onScoreChange]);

  async function addSubEntry() {
    const score = parseFloat(newScore);
    if (Number.isNaN(score) || !component.id) return;
    await window.studyHub?.db?.grades?.saveSubEntry({
      componentId: component.id,
      score,
      label: newLabel || `Entry ${subEntries.length + 1}`,
    });
    const rows = await window.studyHub?.db?.grades?.getSubEntries(component.id);
    setSubEntries(rows || []);
    setNewLabel("");
    setNewScore("");
  }

  async function deleteSubEntry(id) {
    await window.studyHub?.db?.grades?.deleteSubEntry(id);
    setSubEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  const contrib = component.score !== null && component.score !== undefined ? Number(component.score) * Number(component.weight || 0) : null;
  const currentContrib = component.score !== null && component.score !== undefined ? Number(component.score) * Number(component.weight || 0) : null;
  const dropImpact = currentContrib !== null ? currentContrib : Number(component.weight || 0) * 80;

  return (
    <>
      <div className="sh-grades-row">
        <span className="sh-grades-col sh-grades-col--name">
          <button className="sh-expand-toggle" onClick={() => setExpanded((open) => !open)} title="Add individual grades">
            {expanded ? "▾" : "▸"}
          </button>
          <span className={`sh-category-dot sh-category-dot--${component.category || "other"}`} />
          {component.name}
          <span className="sh-drop-impact" title={`Scoring 0 costs ~${dropImpact.toFixed(1)} grade points`}>
            ↓{dropImpact.toFixed(1)}
          </span>
        </span>
        <span className="sh-grades-col sh-grades-col--weight mono">{(Number(component.weight || 0) * 100).toFixed(0)}%</span>
        <span className="sh-grades-col sh-grades-col--score">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="—"
            value={component.score ?? ""}
            onChange={(event) => onScoreChange(index, event.target.value)}
            className="sh-score-input"
            title={subEntries.length > 0 ? `Average of ${subEntries.length} entries` : undefined}
          />
        </span>
        <span
          className="sh-grades-col sh-grades-col--contribution mono"
          style={{ color: contrib !== null ? "var(--sh-text-primary)" : "var(--sh-text-dim)" }}
        >
          {contrib !== null ? contrib.toFixed(2) : "—"}
        </span>
      </div>
      {component.score !== null && component.score !== undefined ? (
        <div className="sh-score-bar-wrap">
          <div
            className="sh-score-bar"
            style={{
              width: `${Math.min(100, Number(component.score || 0))}%`,
              background:
                Number(component.score || 0) >= 90
                  ? "var(--sh-green)"
                  : Number(component.score || 0) >= 80
                    ? "var(--sh-cyan)"
                    : Number(component.score || 0) >= 70
                      ? "var(--sh-amber)"
                      : "var(--sh-red)",
            }}
          />
        </div>
      ) : null}
      {expanded ? (
        <div className="sh-subentries">
          {subEntries.map((entry) => (
            <div key={entry.id} className="sh-subentry-row">
              <span className="sh-subentry-label">{entry.label}</span>
              <span className="sh-subentry-score mono">{entry.score}</span>
              <button className="sh-subentry-delete" onClick={() => void deleteSubEntry(entry.id)}>
                ✕
              </button>
            </div>
          ))}
          <div className="sh-subentry-add">
            <input
              className="sh-subentry-input"
              placeholder="Label (e.g. HW 1)"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addSubEntry();
              }}
            />
            <input
              type="number"
              className="sh-subentry-input sh-score-input"
              placeholder="Score"
              value={newScore}
              onChange={(event) => setNewScore(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addSubEntry();
              }}
              style={{ width: 70 }}
            />
            <button className="sh-btn-ghost sh-btn-xs" onClick={() => void addSubEntry()}>
              + ADD
            </button>
          </div>
          {subEntries.length > 0 ? (
            <div className="sh-subentry-avg">
              <span className="sh-section-label" style={{ fontSize: 9 }}>
                AVERAGE
              </span>
              <span className="mono" style={{ fontSize: 12 }}>
                {(subEntries.reduce((sum, entry) => sum + Number(entry.score || 0), 0) / subEntries.length).toFixed(1)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default function GradesTab({ course, onSaveComponents }) {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [gradingScale, setGradingScale] = useState(null);

  useEffect(() => {
    async function load() {
      const uuid = course?.uuid || course?.id;
      if (!uuid) {
        setLoading(false);
        return;
      }
      const [rows, entries, scale] = await Promise.all([
        window.studyHub?.db?.grades?.getComponents(uuid),
        window.studyHub?.db?.grades?.getEntries(uuid),
        window.studyHub?.db?.grades?.getGradingScale(uuid),
      ]);
      const scoreByComponent = new Map(entries.map((entry) => [entry.component_id, entry.score]));
      const hydrated = rows.map((row) => ({
        ...row,
        score: scoreByComponent.has(row.id) ? scoreByComponent.get(row.id) : null,
      }));
      if (hydrated.length > 0) setComponents(hydrated);
      if (scale) setGradingScale(scale);
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
    const current = scoredWeight > 0 ? weightedSum / scoredWeight : null;
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
    if (parsed.gradingScale) {
      const uuid = course?.uuid || course?.id;
      void window.studyHub?.db?.grades?.saveGradingScale({ courseUuid: uuid, scale: parsed.gradingScale });
      setGradingScale(parsed.gradingScale);
    }
    setStatus(`Found ${newComponents.length} components - enter your scores below`);
  }

  async function handleScoreChange(index, value) {
    const score = value === "" ? null : parseFloat(value);
    const updated = components.map((component, i) => (i === index ? { ...component, score } : component));
    setComponents(updated);
    const component = components[index];
    if (component?.id) {
      window.studyHub?.db?.grades
        ?.upsertEntry({
          courseUuid: course?.uuid || course?.id,
          componentId: component.id,
          score,
          label: component.name,
        })
        .catch((err) => console.warn("[GRADES] Save:", err));
    }
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
        {(() => {
          const gradeColor =
            currentGrade === null
              ? "var(--sh-text-dim)"
              : currentGrade >= 90
                ? "var(--sh-green)"
                : currentGrade >= 80
                  ? "var(--sh-cyan)"
                  : currentGrade >= 70
                    ? "var(--sh-amber)"
                    : "var(--sh-red)";
          const currentLetter = getCurrentLetter(currentGrade, gradingScale);
          return (
            <>
              <span className="sh-grade-value" style={{ color: gradeColor }}>
                {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : "—"}
              </span>
              {currentGrade !== null && gradingScale ? <span className="sh-grade-letter">{currentLetter}</span> : null}
              <span className="sh-grade-label">{currentGrade !== null ? "CURRENT GRADE" : "NO SCORES YET"}</span>
            </>
          );
        })()}
      </div>

      <div className="sh-grades-table">
        <div className="sh-grades-thead">
          <span className="sh-grades-col sh-grades-col--name">COMPONENT</span>
          <span className="sh-grades-col sh-grades-col--weight">WEIGHT</span>
          <span className="sh-grades-col sh-grades-col--score">SCORE</span>
          <span className="sh-grades-col sh-grades-col--contribution">CONTRIB</span>
        </div>

        {components.map((component, i) => (
          <ComponentRow
            key={`${component.id || component.name}-${i}`}
            component={component}
            index={i}
            onScoreChange={handleScoreChange}
          />
        ))}

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
      <GradeScaleDisplay scale={gradingScale} currentGrade={currentGrade} />
      <HypotheticalEngine components={components} gradingScale={gradingScale} />
      <WhatIfSimulator components={components} />
      <GradeDropCalculator components={components} />
    </div>
  );
}
