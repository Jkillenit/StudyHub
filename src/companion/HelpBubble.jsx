import { useMemo } from "react";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { searchFaq } from "./faq.js";
import { line } from "./character.js";
import { CHIPS, describeCommand, parseCommand } from "../nova/commands.js";

/**
 * Ask Nova: type a command ("quiz me on mis 430", "focus 50"), small talk, or a how-do-I question.
 * Commands run through `onCommand`; questions search the local answer sheet, then she answers
 * and offers to point.
 */
export function HelpBubble({ help, h, v, courses, onQuery, onPick, onBack, onClose, onShowMe, onAction, onCommand }) {
  const query = help.query.trim();
  const cmd = useMemo(() => parseCommand(query, { courses }), [query, courses]);
  const preview = describeCommand(cmd);
  const results = useMemo(() => (query && cmd?.id !== "talk" ? searchFaq(query, preview ? 3 : 4) : []), [query, cmd, preview]);
  const dunno = useMemo(() => line("cmd.unknown"), []);
  const run = (text) => {
    const c = parseCommand(text, { courses });
    if (c) onCommand(c);
  };

  if (help.answer) {
    const e = help.answer;
    const actions = [];
    if (e.pointTo && !help.pointed) actions.push({ label: "SHOW ME", primary: true, autoFocus: true, onClick: () => onShowMe(e) });
    if (e.tour) actions.push({ label: "TAKE THE TOUR", onClick: () => onAction("tour", e) });
    if (e.action === "quiz") actions.push({ label: "QUIZ ME", primary: true, autoFocus: true, onClick: () => onAction("quiz", e) });
    if (e.action === "open-ai") actions.push({ label: "OPEN AI SETTINGS", primary: true, autoFocus: true, onClick: () => onAction("open-ai", e) });
    actions.push({ label: "BACK", onClick: onBack });
    actions.push({ label: "DONE", onClick: onClose });
    return <SpeechBubble title={e.q} text={e.a} actions={actions} h={h} v={v} wide />;
  }

  const lost = query && !cmd && !results.length;
  return (
    <SpeechBubble title="ASK NOVA" h={h} v={v} wide actions={[{ label: "CLOSE", onClick: onClose }]}>
      <input
        className="sc-help-input"
        type="text"
        value={help.query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cmd) onCommand(cmd);
          else if (e.key === "Enter" && results[0]) onPick(results[0]);
          if (e.key === "Escape") onClose();
        }}
        placeholder="Ask, or tell me what to do…"
        aria-label="Ask Nova"
        autoFocus
      />
      {lost ? <p className="sc-bubble-text sc-help-dunno">{dunno}</p> : null}
      {!query || lost ? (
        <div className="sc-ask-chips">
          {CHIPS.map((c) => (
            <button key={c.label} type="button" className="sc-ask-chip" onClick={() => run(c.text)}>
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="sc-help-list">
        {preview ? (
          <li>
            <button type="button" className="sc-help-q sc-ask-run" onClick={() => onCommand(cmd)}>
              ▸ {preview}
            </button>
          </li>
        ) : null}
        {results.map((f) => (
          <li key={f.id}>
            <button type="button" className="sc-help-q" onClick={() => onPick(f)}>
              {f.q}
            </button>
          </li>
        ))}
      </ul>
      {!query ? <p className="sc-ask-hint">Ctrl+J anytime</p> : null}
    </SpeechBubble>
  );
}
