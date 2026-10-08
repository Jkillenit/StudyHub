import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSyllabus } from "../../syllabus/syllabusParser";
import { courseStore } from "../../db/courseStore.js";
import InlineEdit from "./InlineEdit";
import {
  averageScore,
  currentGrade as weightedGrade,
  gradeTone,
  hasScore,
  letterFor,
  neededAverage,
  neededTone,
  normalized,
  totalWeight,
} from "../../features/grades/gradeMath.js";
import { neededScores } from "../../features/today/priority.js";
import { NeedBadge } from "../../features/today/NeedBadge.jsx";
import { dueLabel } from "../../features/dashboard/dateLabels.js";

const SCORE_SAVE_DEBOUNCE_MS = 600;
const keyOf = (c, i) => c.uuid || (c.id != null ? `id${c.id}` : `new${i}`);

function GradeScaleDisplay({ scale, currentGrade }) {
  if (!scale) return null;
  const grades = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  const currentLetter = letterFor(currentGrade, scale);
  const rows = grades.some(([letter]) => letter === "F") ? grades : [...grades, ["F", 0]];
  return (
    <div className="sh-grade-scale">
      <div className="sh-section-label">Grading scale</div>
      <div className="sh-grade-scale-grid">
        {rows.map(([letter, threshold]) => {
          const isCurrent = letter === currentLetter;
          return (
            <div key={letter} className={`sh-grade-scale-row ${isCurrent ? "sh-grade-scale-row--current" : ""}`}>
              <span className="sh-grade-scale-letter">{letter}</span>
              <span className="sh-grade-scale-threshold mono">
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

function TargetSelector({ target, gradingScale, onChange }) {
  const [draft, setDraft] = useState(String(target));
  const timerRef = useRef(null);
  useEffect(() => setDraft(String(target)), [target]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

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

  const typed = (value) => {
    setDraft(value);
    window.clearTimeout(timerRef.current);
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    timerRef.current = window.setTimeout(() => onChange(n), SCORE_SAVE_DEBOUNCE_MS);
  };

  return (
    <div className="sh-target-selector" title="Today ranks this course against your target">
      <span className="sh-target-label">TARGET:</span>
      <div className="sh-target-options">
        {targetOptions.map((opt) => (
          <button
            key={opt.letter}
            type="button"
            className={`sh-target-btn ${target === opt.threshold ? "sh-target-btn--active" : ""}`}
            onClick={() => {
              window.clearTimeout(timerRef.current);
              onChange(opt.threshold);
            }}
          >
            {opt.letter}
          </button>
        ))}
        <input
          type="number"
          min="0"
          max="100"
          value={draft}
          aria-label="Target grade percent"
          onChange={(event) => typed(event.target.value)}
          className="sh-target-input"
        />
      </div>
    </div>
  );
}

function HypotheticalEngine({ components, gradingScale, target }) {
  const scored = components.filter(hasScore);
  const unscored = components.filter((c) => !hasScore(c));
  if (scored.length === 0 || unscored.length === 0) return null;

  const needed = neededAverage(normalized(components), target);
  const isPossible = needed !== null && needed <= 100;
  const isAlreadyAchieved = needed !== null && needed <= 0;
  const letter = (gradingScale && letterFor(target, gradingScale)) || `${target}%`;

  return (
    <div className="sh-hypothetical">
      <div className="sh-hypothetical-header">
        <div className="sh-section-label">WHAT DO I NEED?</div>
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
              <span className={`sh-hyp-score sh-tone--${neededTone(needed)}`}>
                {needed.toFixed(1)}%
              </span>{" "}
              across remaining components to get a {letter}.
            </div>
            <div className="sh-hyp-components">
              {unscored.map((component, i) => (
                <div key={keyOf(component, i)} className="sh-hyp-row">
                  <span className="sh-hyp-name">{component.name}</span>
                  <span className={`sh-hyp-needed mono sh-tone--${neededTone(needed)}`}>
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

function HoldTargetRow({ label, entry }) {
  const sub = [label, entry.dueDate ? dueLabel(entry.dueDate) : null, `worth ${Math.round(entry.share * 1000) / 10}%`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="sh-hold-row">
      <span className="sh-hold-name">
        {entry.title}
        <span className="sh-hold-sub">{sub}</span>
      </span>
      {entry.needed != null ? (
        <NeedBadge needed={entry.needed} />
      ) : (
        <span className="sh-hold-sub">Match to a component</span>
      )}
    </div>
  );
}

/** Score needed on the next major item and on the final to hold the target (same math as Today). */
function HoldTarget({ snapshot, components, target }) {
  if (!snapshot) return null;
  const extra = new Map((snapshot.components || []).map((c) => [c.uuid, c]));
  const live = components.map((c) => ({ ...extra.get(c.uuid), ...c, score: hasScore(c) ? Number(c.score) : null }));
  const needs = neededScores({ ...snapshot, components: live, targetGrade: target });
  if (needs.current == null || (!needs.next && !needs.final)) return null;
  const sameItem = needs.next && needs.final && needs.next.uuid && needs.next.uuid === needs.final.uuid;
  return (
    <div className="sh-hold-target">
      <div className="sh-section-label">HOLD YOUR {target}% TARGET</div>
      {needs.next && !sameItem ? <HoldTargetRow label="Next major" entry={needs.next} /> : null}
      {needs.final ? <HoldTargetRow label={sameItem ? "NEXT MAJOR · FINAL" : "FINAL"} entry={needs.final} /> : null}
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
  const projectedGrade = weightedGrade(
    components.map((c, i) => (hasScore(c) ? c : { ...c, score: simFor(keyOf(c, i)) }))
  );

  return (
    <div className="sh-whatif">
      <div className="sh-section-label">What-if simulator</div>
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
        <span className="sh-grade-label">Projected grade</span>
        <span className={`sh-whatif-grade sh-tone--${gradeTone(projectedGrade)}`}>
          {projectedGrade.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function GradeDropCalculator({ components }) {
  if (!components.some(hasScore)) return null;
  const current = weightedGrade(components);
  const impacts = components
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => hasScore(c))
    .map(({ c, i }) => {
      const gradeWithZero = weightedGrade(components.map((x) => (x === c ? { ...x, score: 0 } : x)));
      return { key: keyOf(c, i), name: c.name, gradeWithZero, impact: current - gradeWithZero };
    })
    .sort((a, b) => b.impact - a.impact);
  return (
    <div className="sh-drop-calc">
      <div className="sh-section-label">IF I SCORE ZERO ON...</div>
      <div className="sh-drop-table">
        {impacts.map((item) => (
          <div key={item.key} className="sh-drop-row">
            <span className="sh-drop-name">{item.name}</span>
            <span className={`sh-drop-result mono sh-tone--${gradeTone(item.gradeWithZero)}`}>
              {item.gradeWithZero.toFixed(1)}%
            </span>
            <span className="sh-drop-delta mono">
              -{item.impact.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentRow({ component, index, weightSum, onScoreChange, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [subEntries, setSubEntries] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [newScore, setNewScore] = useState("");

  useEffect(() => {
    if (!expanded || !component.id) return;
    let cancelled = false;
    courseStore.getGradeSubEntries(component.id).then((rows) => {
      if (!cancelled) setSubEntries(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, component.id]);

  const applySubAverage = (rows) => {
    setSubEntries(rows);
    if (!rows.length) return;
    onScoreChange(index, String(averageScore(rows)));
  };

  async function addSubEntry() {
    const score = parseFloat(newScore);
    if (Number.isNaN(score) || !component.id) return;
    await courseStore.saveGradeSubEntry({
      componentId: component.id,
      score,
      label: newLabel || `Entry ${subEntries.length + 1}`,
    });
    applySubAverage(await courseStore.getGradeSubEntries(component.id));
    setNewLabel("");
    setNewScore("");
  }

  async function deleteSubEntry(id) {
    await courseStore.deleteGradeSubEntry(id);
    applySubAverage(subEntries.filter((entry) => entry.id !== id));
  }

  const share = weightSum > 0 ? Number(component.weight || 0) / weightSum : 0;
  const contrib = hasScore(component) ? Number(component.score) * share : null;
  const dropImpact = contrib !== null ? contrib : share * 80;

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
          <span className={`sh-grades-col sh-grades-col--contribution mono${contrib === null ? " sh-tone--none" : ""}`}>
            {contrib !== null ? contrib.toFixed(2) : "—"}
          </span>
          <button className="sh-grades-delete-btn" onClick={() => onDelete(index)} title="Delete component">
            ✕
          </button>
        </div>
        {hasScore(component) ? (
          <div className="sh-score-bar-wrap">
            <div
              className={`sh-score-bar sh-tone--${gradeTone(Number(component.score))}`}
              style={{ width: `${Math.min(100, Number(component.score))}%` }}
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
            />
            <button className="sh-btn-ghost sh-btn-xs" onClick={() => void addSubEntry()}>
              + ADD
            </button>
          </div>
          {subEntries.length > 0 ? (
            <div className="sh-subentry-avg">
              <span className="sh-section-label">Average</span>
              <span className="mono">
                {averageScore(subEntries).toFixed(1)}
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
      <span className={`sh-drop-result mono sh-tone--${gradeTone(pct)}`}>
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
          <option value="">Auto</option>
          {components.map((c, i) => (
            <option key={keyOf(c, i)} value={c.uuid}>
              {c.name}
            </option>
          ))}
          <option value="none">Don't count</option>
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
  if (excluded.length) groups.push({ key: "excluded", label: "Not counted", items: excluded });

  return (
    <div className="sh-bb-gradebook">
      <div className="sh-section-label">Blackboard grades</div>
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
              <span className={`mono sh-tone--${gradeTone(pct)}`}>
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
  const [target, setTarget] = useState(80);
  const [snapshot, setSnapshot] = useState(null);
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
      courseStore.getGradeComponents(courseUuid),
      courseStore.getGradingScale(courseUuid),
      courseStore.getBbGradeItems(courseUuid),
      courseStore.getTargetGrade(courseUuid),
      courseStore.loadTodayData(courseUuid),
    ])
      .then(([rows, scale, items, targetGrade, today]) => {
        if (cancelled) return;
        setComponents(Array.isArray(rows) ? rows : []);
        setGradingScale(scale || null);
        setBbItems(Array.isArray(items) ? items : []);
        setTarget(targetGrade);
        setSnapshot(today?.courses?.[0] || null);
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

  /** After an edit: components, BB matches and the HOLD YOUR TARGET snapshot. Scale and target don't change. */
  const refreshAfterEdit = useCallback(async () => {
    const [rows, items, today] = await Promise.all([
      courseStore.getGradeComponents(courseUuid),
      courseStore.getBbGradeItems(courseUuid),
      courseStore.loadTodayData(courseUuid),
    ]);
    setComponents(rows);
    setBbItems(items);
    setSnapshot(today?.courses?.[0] || null);
  }, [courseUuid]);

  const assignBbItem = useCallback(
    async (bbId, componentUuid) => {
      await courseStore.setBbItemComponent({ courseUuid, bbId, componentUuid });
      await refreshAfterEdit();
    },
    [courseUuid, refreshAfterEdit]
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
          void courseStore.upsertGradeEntry({ courseUuid, componentId: row.id, score: row.score });
        }
      });
      if (bbItemsRef.current.length) {
        await courseStore.applyBbGrades(courseUuid);
        await refreshAfterEdit();
      } else {
        const today = await courseStore.loadTodayData(courseUuid);
        setSnapshot(today?.courses?.[0] || null);
      }
    },
    [courseUuid, onComponentsChange, refreshAfterEdit]
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
          void courseStore.upsertGradeEntry({ courseUuid, componentId: component.id, score });
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

  const currentGrade = useMemo(() => weightedGrade(components), [components]);

  const changeTarget = useCallback(
    (value) => {
      setTarget(value);
      void courseStore.setTargetGrade(courseUuid, value);
    },
    [courseUuid]
  );

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
    await courseStore.setSyllabusCoverage(courseUuid, text);
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
      void courseStore.saveGradingScale(courseUuid, parsed.gradingScale);
      setGradingScale(parsed.gradingScale);
    }
    setStatus(`Found ${parsed.grading.length} components - enter your scores below`);
  }

  if (loading) return <div className="sh-skeleton-pulse" style={{ height: 240 }} />;

  if (components.length === 0) {
    return (
      <div className="sh-grades-empty">
        <div className="sh-section-label">Grade calculator</div>
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

  const weightSum = totalWeight(components);
  const weightOff = Math.abs(weightSum - 1) > 0.01;

  return (
    <div className="sh-grades-view">
      <div className="sh-grades-header">
        <div className="sh-section-label">Grade calculator</div>
        <button className="sh-btn-ghost sh-btn-xs" onClick={handleImport}>
          RE-IMPORT SYLLABUS
        </button>
      </div>

      {status ? (
        <div className={`sh-grades-status${status.startsWith("Found") ? " sh-grades-status--ok" : ""}`}>
          {status}
        </div>
      ) : null}

      <div className="sh-current-grade">
        <span className={`sh-grade-value sh-tone--${gradeTone(currentGrade)}`}>
          {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : "—"}
        </span>
        {currentGrade !== null && gradingScale ? (
          <span className="sh-grade-letter">{letterFor(currentGrade, gradingScale)}</span>
        ) : null}
        <span className="sh-grade-label">{currentGrade !== null ? "CURRENT GRADE" : "NO SCORES YET"}</span>
      </div>
      <TargetSelector target={target} gradingScale={gradingScale} onChange={changeTarget} />

      <div className="sh-grades-table">
        <div className="sh-grades-thead">
          <span className="sh-grades-col sh-grades-col--name">Component</span>
          <span className="sh-grades-col sh-grades-col--weight">Weight</span>
          <span className="sh-grades-col sh-grades-col--score">Score</span>
          <span className="sh-grades-col sh-grades-col--contribution">Contrib</span>
          <span className="sh-grades-col sh-grades-col--actions" />
        </div>

        {components.map((component, i) => (
          <ComponentRow
            key={keyOf(component, i)}
            component={component}
            index={i}
            weightSum={weightSum}
            onScoreChange={handleScoreChange}
            onUpdate={updateComponent}
            onDelete={deleteComponent}
          />
        ))}

        <div className="sh-grades-row sh-grades-row--total">
          <span className="sh-grades-col sh-grades-col--name mono">Total</span>
          <span
            className={`sh-grades-col sh-grades-col--weight mono${weightOff ? " sh-tone--warn" : ""}`}
            title={weightOff ? "Weights do not add up to 100%" : undefined}
          >
            {(weightSum * 100).toFixed(0)}%
          </span>
          <span className="sh-grades-col sh-grades-col--score" />
          <span className={`sh-grades-col sh-grades-col--contribution mono sh-tone--${gradeTone(currentGrade)}`}>
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
      <HoldTarget snapshot={snapshot} components={components} target={target} />
      <HypotheticalEngine components={components} gradingScale={gradingScale} target={target} />
      <WhatIfSimulator components={components} />
      <GradeDropCalculator components={components} />
      <BlackboardGradebook items={bbItems} components={components} onAssign={assignBbItem} />
    </div>
  );
}
