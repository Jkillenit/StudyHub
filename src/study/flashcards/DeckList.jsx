import { useEffect, useMemo, useState } from "react";
import { daysUntilExam, daysUntilReview, isCardDue } from "../sm2.js";
import { cardKey } from "./useDeckCards.js";

const VISIBLE_ROWS = 12;

export function DeckModeChips({ modes, value, onChange, dueCount = 0 }) {
  return (
    <div className="sh-deck-chips" role="group" aria-label="Deck mode">
      {modes.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`sh-deck-chip${value === opt.id ? " is-active" : ""}`}
          aria-pressed={value === opt.id}
          onClick={() => onChange?.(opt.id)}
        >
          {opt.label}
          {opt.id === "due" && dueCount > 0 ? <span className="sh-deck-chip-count"> · {dueCount}</span> : null}
        </button>
      ))}
    </div>
  );
}

function CardEditor({ initialFront = "", initialBack = "", onSave, onCancel }) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const ok = front.trim() && back.trim();
  const save = () => {
    if (ok) onSave(front.trim(), back.trim());
  };
  return (
    <div
      className="sh-deck-editor"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
      }}
    >
      <input autoFocus className="sh-inline-edit-input" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" aria-label="Front" />
      <textarea className="sh-inline-edit-input" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" aria-label="Back" rows={3} />
      <div className="sh-deck-editor-actions">
        <button type="button" className="sh-btn-accent sh-session-btn" onClick={save} disabled={!ok}>
          Save
        </button>
        <button type="button" className="sh-btn-outline sh-session-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Inline browse/edit list for a deck: counts, Start session, Add card, and one row per card with
 * its due state; hover a row for Edit / Delete. `addTriggerRef.current()` opens the add editor.
 */
export function DeckList({ cards, onStart, onAdd, onEdit, onDelete, examFor = null, addTriggerRef = null, emptyLabel = "No cards here yet." }) {
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!addTriggerRef) return undefined;
    addTriggerRef.current = () => {
      setEditingKey(null);
      setAdding(true);
    };
    return () => {
      addTriggerRef.current = null;
    };
  }, [addTriggerRef]);

  const rows = useMemo(
    () =>
      (cards || []).map((card) => {
        const examDate = examFor ? examFor(card) : null;
        const examDays = examDate ? daysUntilExam(examDate) : null;
        return { card, key: cardKey(card), due: isCardDue(card, { examDate }), examDays };
      }),
    [cards, examFor]
  );
  const dueCount = rows.filter((r) => r.due).length;
  const visible = showAll ? rows : rows.slice(0, VISIBLE_ROWS);

  return (
    <section className="sh-deck-list" aria-label="Flashcards">
      <header className="sh-deck-list-head">
        <span className="sh-deck-list-count">
          {rows.length} {rows.length === 1 ? "card" : "cards"} · {dueCount} due
        </span>
        <div className="sh-deck-list-actions">
          <button type="button" className="sh-btn-outline sh-session-btn" onClick={() => setAdding(true)} disabled={adding}>
            Add card
          </button>
          <button type="button" className="sh-btn-accent sh-session-btn" onClick={onStart} disabled={!rows.length}>
            Start session
          </button>
        </div>
      </header>

      {adding ? (
        <CardEditor
          onSave={(front, back) => {
            onAdd(front, back);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {!rows.length && !adding ? <p className="sh-deck-list-empty">{emptyLabel}</p> : null}

      {rows.length ? (
        <ul className="sh-deck-rows">
          {visible.map(({ card, key, due, examDays }) =>
            editingKey === key ? (
              <li key={key} className="sh-deck-row sh-deck-row--editing">
                <CardEditor
                  initialFront={card.front}
                  initialBack={card.back}
                  onSave={(front, back) => {
                    onEdit(key, front, back);
                    setEditingKey(null);
                  }}
                  onCancel={() => setEditingKey(null)}
                />
              </li>
            ) : (
              <li key={key} className="sh-deck-row">
                <div className="sh-deck-row-text">
                  <span className="sh-deck-row-front">{card.front}</span>
                  <span className="sh-deck-row-back">{card.back}</span>
                </div>
                <div className="sh-deck-row-meta">
                  {examDays != null ? <span className="sh-deck-row-exam">EXAM IN {examDays} D</span> : null}
                  <span className={`sh-deck-row-due${due ? " is-due" : ""}`}>{due ? "due" : `in ${daysUntilReview(card)} d`}</span>
                  <span className="sh-deck-row-tools">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setEditingKey(key);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="sh-deck-row-delete"
                      onClick={() => {
                        if (window.confirm("Remove this card from your deck?")) onDelete(key);
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              </li>
            )
          )}
        </ul>
      ) : null}

      {rows.length > VISIBLE_ROWS && !showAll ? (
        <button type="button" className="sh-deck-show-all" onClick={() => setShowAll(true)}>
          Show all {rows.length}
        </button>
      ) : null}
    </section>
  );
}
