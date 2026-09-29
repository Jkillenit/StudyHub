import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSyllabus } from "../../syllabus/syllabusParser";
import { courseStore } from "../../db/courseStore.js";
import InlineEdit from "./InlineEdit";

const SCORE_SAVE_DEBOUNCE_MS = 600;
const hasScore = (c) => c.score !== null && c.score !== undefined && !Number.isNaN(c.score);
const keyOf = (c, i) => c.uuid || (c.id != null ? `id${c.id}` : `new${i}`);

function gradeColor(pct) {
  if (pct === null || pct === undefined) return "var(--sh-text-dim)";
  if (pct >= 90) return "var(--sh-green)";
  if (pct >= 80) return "var(--sh-cyan)";
  if (pct >= 70) return "var(--sh-amber)";
  return "var(--sh-red)";
}

export function getCurrentLetter(grade, scale) {
  if (grade === null || grade === undefined || !scale) return null;
  const grades = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  for (const [letter, threshold] of grades) {
    if (grade >= threshold) return letter;
  }
  return "F";
}

function neededColor(needed) {
  if (needed <= 70) return "var(--sh-green)";
  if (needed <= 85) return "var(--sh-cyan)";
  if (needed <= 95) return "var(--sh-amber)";
  return "var(--sh-red)";
}

function GradeScaleDisplay({ scale, currentGrade }) {
  if (!scale) return null;
  const grades = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  const currentLetter = getCurrentLetter(currentGrade, scale);
  const rows = grades.some(([letter]) => letter === "F") ? grades : [...grades, ["F", 0]];
  return (
    <div className="sh-grade-scale">
      <div className="sh-section-label">GRADING SCALE</div>
      <div className="sh-grade-scale-grid">
        {rows.map(([letter, threshold]) => {
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
                {letter === "F" && !threshold ? "below" : `${threshold}%+`}
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
  const scored = components.filter(hasScore);
  const unscored = components.filter((c) => !hasScore(c));
  if (scored.length === 0 || unscored.length === 0) return null;

  const scoredContrib = scored.reduce((sum, c) => sum + Number(c.score) * Number(c.weight || 0), 0);
  const remainingWeight = unscored.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  const needed = remainingWeight > 0 ? (target - scoredContrib) / remainingWeight : null;
  const isPossible = needed !== null && needed <= 100;
  const isAlreadyAchieved = needed !== null && needed <= 0;
  const letter = getCurrentLetter(target, gradingScale) || `${target}%`;

  const targetOptions = gradingScale
    ? Object.entries(gradingScale)
        .filter(([l]) => l !== "F")
        .sort((a, b) => b[1] - a[1])
        .map(([l, threshold]) => ({ letter: l, threshold }))
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
            <span>Already achieved - you have a {letter} regardless of remaining work</span>
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
              <span className="sh-hyp-score" style={{ color: neededColor(needed) }}>
                {needed.toFixed(1)}%
              </span>{" "}
              across remaining components to get a {letter}.
            </div>
            <div className="sh-hyp-components">
              {unscored.map((component, i) => (
                <div key={keyOf(component, i)} className="sh-hyp-row">
                  <span className="sh-hyp-name">{component.name}</span>
                  <span className="sh-hyp-needed mono" style={{ color: neededColor(needed) }}>
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
  const unscored = useMemo(
    () => components.map((c, i) => ({ c, key: keyOf(c, i) })).filter(({ c }) => !hasScore(c)),
    [components]
  );
  const [simScores, setSimScores] = useState({});
  if (unscored.length === 0) return null;

  const simFor = (key) => simScores[key] ?? 80;
  const projectedGrade = components.reduce((sum, c, i) => {
    const score = hasScore(c) ? Number(c.score) : simFor(keyOf(c, i));
    return sum + score * Number(c.weight || 0);
  }, 0);

  return (
    <div className="sh-whatif">
      <div className="sh-section-label">WHAT-IF SIMULATOR</div>
      <div className="sh-whatif-note">Adjust sliders to simulate future scores. Does not affect saved grades.</div>
      <div className="sh-whatif-sliders">
        {unscored.map(({ c, key }) => (
          <div key={key} className="sh-whatif-row">
            <span className="sh-whatif-name">{c.name}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={simFor(key)}
              onChange={(event) => setSimScores((prev) => ({ ...prev, [key]: parseInt(event.target.value, 10) }))}
              className="sh-whatif-slider"
            />
            <span className="sh-whatif-val mono">{simFor(key)}%</span>
          </div>
        ))}
      </div>
      <div className="sh-whatif-projected">
        <span className="sh-grade-label">PROJECTED GRADE</span>
        <span className="sh-whatif-grade" style={{ color: gradeColor(projectedGrade) }}>
          {projectedGrade.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function GradeDropCalculator({ components }) {
  if (!components.some(hasScore)) return null;
  const contribution = (c) => (hasScore(c) ? Number(c.score) : 0) * Number(c.weight || 0);
  const totalGrade = components.reduce((sum, c) => sum + contribution(c), 0);
  const impacts = components
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => hasScore(c))
    .map(({ c, i }) => ({
      key: keyOf(c, i),
      name: c.name,
      gradeWithZero: totalGrade - contribution(c),
      impact: contribution(c),
    }))
    .sort((a, b) => b.impact - a.impact);
  return (
    <div className="sh-drop-calc">
      <div className="sh-section-label">IF I SCORE ZERO ON...</div>
      <div className="sh-drop-table">
        {impacts.map((item) => (
          <div key={item.key} className="sh-drop-row">
            <span className="sh-drop-name">{item.name}</span>
            <span className="sh-drop-result mono" style={{ color: gradeColor(item.gradeWithZero) }}>
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

function ComponentRow({ component, index, onScoreChange, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [subEntries, setSubEntries] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [newScore, setNewScore] = useState("");

  useEffect(() => {
    if (!expanded || !component.id) return;
    let cancelled = false;
    window.studyHub?.db?.grades?.getSubEntries(component.id).then((rows) => {
      if (!cancelled) setSubEntries(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, component.id]);

  const applySubAverage = (rows) => {
    setSubEntries(rows);
    if (!rows.length) return;
    const avg = rows.reduce((sum, entry) => sum + Number(entry.score || 0), 0) / rows.length;
    onScoreChange(index, String(Math.round(avg * 10) / 10));
  };

  async function addSubEntry() {
    const score = parseFloat(newScore);
    if (Number.isNaN(score) || !component.id) return;
    await window.studyHub?.db?.grades?.saveSubEntry({
      componentId: component.id,
      score,
      label: newLabel || `Entry ${subEntries.length + 1}`,
    });
    applySubAverage((await window.studyHub?.db?.grades?.getSubEntries(component.id)) || []);
    setNewLabel("");
    setNewScore("");
  }

  async function deleteSubEntry(id) {
    await window.studyHub?.db?.grades?.deleteSubEntry(id);
    applySubAverage(subEntries.filter((entry) => entry.id !== id));
  }

  const contrib = hasScore(component) ? Number(component.score) * Number(component.weight || 0) : null;
  const dropImpact = contrib !== null ? contrib : Number(component.weight || 0) * 80;

  return (
    <>
      <div className="sh-grades-row-wrap">
        <div className="sh-grades-row">
          <span className="sh-grades-col sh-grades-col--name">
            <button
              className="sh-expand-toggle"
              onClick={() => setExpanded((open) => !open)}
              title={component.id ? "Add individual grades" : "Saving…"}
              disabled={!component.id}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <span className={`sh-category-dot sh-category-dot--${component.category || "other"}`} />
            <InlineEdit value={component.name} className="sh-grade-name-edit" onSave={(name) => onUpdate(index, { name })} />
            <span className="sh-drop-impact" title={`Scoring 0 costs ~${dropImpact.toFixed(1)} grade points`}>
              ↓{dropImpact.toFixed(1)}
            </span>
          </span>
          <span className="sh-grades-col sh-grades-col--weight mono">
            <InlineEdit
              value={(Number(component.weight || 0) * 100).toFixed(0)}
              suffix="%"
              className="sh-grade-weight-edit mono"
              onSave={(newVal) => {
                const pct = parseFloat(newVal);
                if (Number.isNaN(pct) || pct <= 0 || pct > 100) return;
                onUpdate(index, { weight: pct / 100 });
              }}
            />
          </span>
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
          <button className="sh-grades-delete-btn" onClick={() => onDelete(index)} title="Delete component">
            ✕
          </button>
        </div>
        {hasScore(component) ? (
          <div className="sh-score-bar-wrap">
            <div
              className="sh-score-bar"
              style={{ width: `${Math.min(100, Number(component.score))}%`, background: gradeColor(Number(component.score)) }}
            />
          </div>
        ) : null}
      </div>
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

function itemPct(item) {
  return item.score != null && item.points_possible ? Math.round((item.score / item.points_possible) * 1000) / 10 : null;
}

function groupPct(items) {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    if (item.score == null || !item.points_possible) continue;
    earned += Number(item.score);
    possible += Number(item.points_possible);
  }
  return possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null;
}

function BbGradeRow({ item, components, onAssign }) {
  const pct = itemPct(item);
  const value = item.excluded ? "none" : item.auto ? "" : item.componentUuid || "";
  return (
    <div className="sh-drop-row">
      <span className="sh-drop-name">{item.name}</span>
      <span className="sh-drop-result mono" style={{ color: gradeColor(pct) }}>
        {item.score != null ? `${item.score}${item.points_possible ? ` / ${item.points_possible}` : ""}` : "—"}
        {pct != null ? ` · ${pct}%` : ""}
      </span>
      {components.length ? (
        <select
          className="sh-bb-apply-select"
          value={value}
          title="Which syllabus component this grade counts toward"
          onChange={(event) => onAssign(item.bb_id, event.target.value || null)}
        >
          <option value="">AUTO</option>
          {components.map((c, i) => (
            <option key={keyOf(c, i)} value={c.uuid}>
              {c.name}
            </option>
          ))}
          <option value="none">DON'T COUNT</option>
        </select>
      ) : null}
    </div>
  );
}

/** Synced Blackboard grades grouped under the syllabus component each one counts toward. */
function BlackboardGradebook({ items, components, onAssign }) {
  if (!items.length) return null;
  const groups = components
    .filter((c) => c.uuid)
    .map((c) => ({ key: c.uuid, label: c.name, items: items.filter((i) => i.componentUuid === c.uuid) }))
    .filter((g) => g.items.length);
  const unsorted = items.filter((i) => !i.componentUuid && !i.excluded);
  const excluded = items.filter((i) => i.excluded);
  if (unsorted.length) groups.push({ key: "unsorted", label: components.length ? "UNSORTED" : "ALL GRADES", items: unsorted });
  if (excluded.length) groups.push({ key: "excluded", label: "NOT COUNTED", items: excluded });

  return (
    <div className="sh-bb-gradebook">
      <div className="sh-section-label">BLACKBOARD GRADES</div>
      <div className="sh-whatif-note">
        {components.length
          ? "Sorted into your syllabus weights automatically. Each component's score is points earned ÷ points possible; change a match with the menu."
          : "Import your syllabus (or sync a course that has one) to sort these into weighted components."}
      </div>
      {groups.map((group) => {
        const pct = group.key === "excluded" ? null : groupPct(group.items);
        return (
          <div key={group.key} className="sh-bb-group">
            <div className="sh-bb-group-head">
              <span className="sh-bb-group-name">{group.label}</span>
              <span className="mono" style={{ color: gradeColor(pct) }}>
                {pct != null ? `${pct}%` : ""}
              </span>
            </div>
            {group.items.map((item) => (
              <BbGradeRow key={item.bb_id || item.id} item={item} components={components} onAssign={onAssign} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function GradesTab({ course, onComponentsChange }) {
  const courseUuid = course?.uuid || course?.id;
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [gradingScale, setGradingScale] = useState(null);
  const [bbItems, setBbItems] = useState([]);
  const componentsRef = useRef(components);
  const bbItemsRef = useRef(bbItems);
  const scoreTimersRef = useRef(new Map());
  componentsRef.current = components;
  bbItemsRef.current = bbItems;

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!courseUuid) return undefined;
    let cancelled = false;
    if (reloadKey === 0) setLoading(true);
    Promise.all([
      window.studyHub?.db?.grades?.getComponents(courseUuid),
      window.studyHub?.db?.grades?.getGradingScale(courseUuid),
      window.studyHub?.db?.bb?.getGradeItems?.(courseUuid),
    ])
      .then(([rows, scale, items]) => {
        if (cancelled) return;
        setComponents(Array.isArray(rows) ? rows : []);
        setGradingScale(scale || null);
        setBbItems(Array.isArray(items) ? items : []);
      })
      .catch(() => setStatus("Could not load grades"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseUuid, reloadKey]);

  useEffect(() => {
    const onSynced = (e) => {
      if (e.detail?.courseUuid === courseUuid) setReloadKey((k) => k + 1);
    };
    window.addEventListener("studyhub-bb-synced", onSynced);
    return () => window.removeEventListener("studyhub-bb-synced", onSynced);
  }, [courseUuid]);

  const assignBbItem = useCallback(
    async (bbId, componentUuid) => {
      const res = await window.studyHub?.db?.bb?.setItemComponent?.({ courseUuid, bbId, componentUuid });
      if (Array.isArray(res?.items)) setBbItems(res.items);
      const rows = await window.studyHub?.db?.grades?.getComponents(courseUuid);
      if (Array.isArray(rows)) setComponents(rows);
    },
    [courseUuid]
  );

  useEffect(
    () => () => {
      for (const timer of scoreTimersRef.current.values()) window.clearTimeout(timer);
    },
    []
  );

  /** Persist structure (names, weights, order). Scores are kept from local state. */
  const saveStructure = useCallback(
    async (next) => {
      setComponents(next);
      const rows = await courseStore.saveGradeComponents(courseUuid, next);
      if (!Array.isArray(rows)) return;
      const merged = rows.map((row, i) => ({ ...row, score: hasScore(next[i] || {}) ? next[i].score : row.score }));
      setComponents(merged);
      onComponentsChange?.(merged.length);
      // Components that were new when their score was typed have ids only now.
      merged.forEach((row, i) => {
        if (!next[i]?.id && hasScore(row)) {
          void window.studyHub?.db?.grades?.upsertEntry({ courseUuid, componentId: row.id, score: row.score });
        }
      });
      if (bbItemsRef.current.length) {
        await window.studyHub?.db?.bb?.applyGrades?.(courseUuid);
        setReloadKey((k) => k + 1);
      }
    },
    [courseUuid, onComponentsChange]
  );

  const handleScoreChange = useCallback(
    (index, value) => {
      const parsed = value === "" ? null : parseFloat(value);
      const score = parsed === null || Number.isNaN(parsed) ? null : parsed;
      setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, score } : c)));
      const component = componentsRef.current[index];
      if (!component?.id) return;
      const timers = scoreTimersRef.current;
      window.clearTimeout(timers.get(component.id));
      timers.set(
        component.id,
        window.setTimeout(() => {
          timers.delete(component.id);
          void window.studyHub?.db?.grades?.upsertEntry({ courseUuid, componentId: component.id, score });
        }, SCORE_SAVE_DEBOUNCE_MS)
      );
    },
    [courseUuid]
  );

  const updateComponent = (index, patch) =>
    void saveStructure(componentsRef.current.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const deleteComponent = (index) => void saveStructure(componentsRef.current.filter((_, i) => i !== index));
  const addComponent = (preset) =>
    void saveStructure([
      ...componentsRef.current,
      preset || { name: "New Component", weight: 0.05, category: "other", score: null },
    ]);

  const currentGrade = useMemo(() => {
    const scored = components.filter(hasScore);
    const scoredWeight = scored.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    if (!scored.length || scoredWeight <= 0) return null;
    return scored.reduce((sum, c) => sum + Number(c.score) * Number(c.weight || 0), 0) / scoredWeight;
  }, [components]);

  async function handleImport() {
    const result = await window.studyHub?.openFileDialog?.({
      filters: [{ name: "Syllabus", extensions: ["pdf", "docx", "doc", "pptx", "txt"] }],
    });
    if (result?.canceled || !result?.filePath) return;
    setStatus("READING SYLLABUS...");
    const isPdf = result.filePath.toLowerCase().endsWith(".pdf");
    const extracted = isPdf
      ? await window.studyHub?.extractPdfText?.(result.filePath)
      : await window.studyHub?.extractText?.(result.filePath);
    const text = extracted?.text || "";
    if (!(extracted?.success || extracted?.ok) || !text) {
      setStatus("Could not read file - try a different format");
      return;
    }
    const parsed = parseSyllabus(text);
    if (parsed.grading.length === 0) {
      setStatus("No grade components found - try adding manually");
      return;
    }
    if (components.length && !window.confirm(`Replace ${components.length} existing components with ${parsed.grading.length} from the syllabus?`)) {
      setStatus(null);
      return;
    }
    await saveStructure(parsed.grading.map((component) => ({ ...component, score: null })));
    if (parsed.gradingScale) {
      void window.studyHub?.db?.grades?.saveGradingScale({ courseUuid, scale: parsed.gradingScale });
      setGradingScale(parsed.gradingScale);
    }
    setStatus(`Found ${parsed.grading.length} components - enter your scores below`);
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
            onClick={() => addComponent({ name: "Homework", weight: 0.2, category: "homework", score: null })}
          >
            + ADD MANUALLY
          </button>
        </div>
        {status ? <div className="sh-grades-status">{status}</div> : null}
        <BlackboardGradebook items={bbItems} components={components} onAssign={assignBbItem} />
      </div>
    );
  }

  const totalWeight = components.reduce((sum, c) => sum + Number(c.weight || 0), 0);

  return (
    <div className="sh-grades-view">
      <div className="sh-grades-header">
        <div className="sh-section-label">GRADE CALCULATOR</div>
        <button className="sh-btn-ghost sh-btn-xs" onClick={handleImport}>
          RE-IMPORT SYLLABUS
        </button>
      </div>

      {status ? (
        <div className="sh-grades-status" style={{ color: status.startsWith("Found") ? "var(--sh-green)" : "var(--sh-amber)" }}>
          {status}
        </div>
      ) : null}

      <div className="sh-current-grade">
        <span className="sh-grade-value" style={{ color: gradeColor(currentGrade) }}>
          {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : "—"}
        </span>
        {currentGrade !== null && gradingScale ? (
          <span className="sh-grade-letter">{getCurrentLetter(currentGrade, gradingScale)}</span>
        ) : null}
        <span className="sh-grade-label">{currentGrade !== null ? "CURRENT GRADE" : "NO SCORES YET"}</span>
      </div>

      <div className="sh-grades-table">
        <div className="sh-grades-thead">
          <span className="sh-grades-col sh-grades-col--name">COMPONENT</span>
          <span className="sh-grades-col sh-grades-col--weight">WEIGHT</span>
          <span className="sh-grades-col sh-grades-col--score">SCORE</span>
          <span className="sh-grades-col sh-grades-col--contribution">CONTRIB</span>
          <span className="sh-grades-col sh-grades-col--actions" />
        </div>

        {components.map((component, i) => (
          <ComponentRow
            key={keyOf(component, i)}
            component={component}
            index={i}
            onScoreChange={handleScoreChange}
            onUpdate={updateComponent}
            onDelete={deleteComponent}
          />
        ))}

        <div className="sh-grades-row sh-grades-row--total">
          <span className="sh-grades-col sh-grades-col--name mono">TOTAL</span>
          <span
            className="sh-grades-col sh-grades-col--weight mono"
            style={{ color: Math.abs(totalWeight - 1) > 0.01 ? "var(--sh-amber)" : undefined }}
            title={Math.abs(totalWeight - 1) > 0.01 ? "Weights do not add up to 100%" : undefined}
          >
            {(totalWeight * 100).toFixed(0)}%
          </span>
          <span className="sh-grades-col sh-grades-col--score" />
          <span className="sh-grades-col sh-grades-col--contribution mono" style={{ color: gradeColor(currentGrade) }}>
            {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : "—"}
          </span>
          <span className="sh-grades-col sh-grades-col--actions" />
        </div>
      </div>

      <div className="sh-grades-actions">
        <button className="sh-btn-ghost sh-btn-xs" onClick={() => addComponent()}>
          + ADD COMPONENT
        </button>
      </div>
      <GradeScaleDisplay scale={gradingScale} currentGrade={currentGrade} />
      <HypotheticalEngine components={components} gradingScale={gradingScale} />
      <WhatIfSimulator components={components} />
      <GradeDropCalculator components={components} />
      <BlackboardGradebook items={bbItems} components={components} onAssign={assignBbItem} />
    </div>
  );
}
