import { useMemo } from "react";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { searchFaq } from "./faq.js";
import { line } from "./character.js";

/** "How do I...?" — search the local answer sheet, then answer and offer to point. */
export function HelpBubble({ help, h, v, onQuery, onPick, onBack, onClose, onShowMe, onAction }) {
  const results = useMemo(() => searchFaq(help.query), [help.query]);
  const dunno = useMemo(() => line("dunno"), []);

  if (help.answer) {
    const e = help.answer;
    const actions = [];
    if (e.pointTo && !help.pointed) actions.push({ label: "SHOW ME", primary: true, autoFocus: true, onClick: () => onShowMe(e) });
    if (e.tour) actions.push({ label: "TAKE THE TOUR", onClick: () => onAction("tour", e) });
    if (e.action === "quiz") actions.push({ label: "QUIZ ME", primary: true, autoFocus: true, onClick: () => onAction("quiz", e) });
    if (e.action === "open-ai") actions.push({ label: "OPEN AI SETTINGS", primary: true, autoFocus: true, onClick: () => onAction("open-ai", e) });
    actions.push({ label: "BACK", onClick: onBack });
    actions.push({ label: "DONE", onClick: onClose });
    return <SpeechBubble title={e.q.toUpperCase()} text={e.a} actions={actions} h={h} v={v} wide />;
  }

  return (
    <SpeechBubble title="HOW DO I…?" h={h} v={v} wide actions={[{ label: "CLOSE", onClick: onClose }]}>
      <input
        className="sc-help-input"
        type="text"
        value={help.query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) onPick(results[0]);
          if (e.key === "Escape") onClose();
        }}
        placeholder="Ask about Study Hub…"
        aria-label="Ask Nova a question"
        autoFocus
      />
      {help.query.trim() && !results.length ? <p className="sc-bubble-text sc-help-dunno">{dunno}</p> : null}
      <ul className="sc-help-list">
        {results.map((f) => (
          <li key={f.id}>
            <button type="button" className="sc-help-q" onClick={() => onPick(f)}>
              {f.q}
            </button>
          </li>
        ))}
      </ul>
    </SpeechBubble>
  );
}
