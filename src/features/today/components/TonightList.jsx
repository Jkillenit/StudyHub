import { PRIORITY_CONFIG } from "../priority.js";
import { ArrowIcon, HudPanel } from "./HudPanel.jsx";
import { CourseChip } from "./CourseChip.jsx";

function sentenceCase(label) {
  const s = String(label || "").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function primaryLabel(action) {
  if (action?.type === "blackboard") return "Open in Blackboard";
  return sentenceCase(action?.label) || "Open";
}

function EmptyState({ hasCourses, synced }) {
  if (!hasCourses || !synced) {
    return (
      <div className="sh-tonight-empty">
        <p>Connect Blackboard and sync your courses. Study Hub will rank what matters here every day.</p>
        <button type="button" className="sh-btn-outline" onClick={() => void window.studyHub?.blackboard?.open?.()}>
          Connect Blackboard
        </button>
      </div>
    );
  }
  return (
    <div className="sh-tonight-empty">
      <p>Nothing due in the next {PRIORITY_CONFIG.horizonDays} days. Good time to get ahead on flashcards.</p>
    </div>
  );
}

export function TonightList({ items, hasCourses, synced, onRun, index = 0 }) {
  return (
    <HudPanel className="sh-tonight" index={index} aria-label="Tonight" data-tour-id="today-tonight" data-nova-anchor="panel.tonight" data-perch>
      <header className="sh-panel-head">
        <div className="sh-panel-head-main">
          <h2 className="sh-hud-title sh-hud-title--lg">Tonight</h2>
          {items.length ? (
            <span className="sh-panel-count">
              {items.length} task{items.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <span className="sh-panel-hint">Ranked by due date, weight and grade risk</span>
      </header>
      {items.length === 0 ? (
        <EmptyState hasCourses={hasCourses} synced={synced} />
      ) : (
        <ol className="sh-tonight-list">
          {items.map((item, i) => {
            const first = i === 0;
            return (
              <li key={item.id} className={`sh-tonight-row${first ? " sh-tonight-row--first" : ""}`} data-nova-anchor={`tonight.item.${i + 1}`} data-nova-drop={item.type === "EXAM_PREP" ? "exam" : "task"}>
                <span className="sh-tonight-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="sh-tonight-main">
                  <div className="sh-tonight-title" title={item.title}>
                    {item.title}
                  </div>
                  <div className="sh-tonight-meta">
                    <CourseChip label={item.courseLabel} state={item.courseState} />
                    {item.reasonParts.map((p, j) => (
                      <span key={p} className="sh-tonight-reason">
                        {j > 0 ? <span className="sh-sep" aria-hidden>·</span> : null}
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                {first ? (
                  <button type="button" className="sh-btn-accent" onClick={() => onRun(item.action)}>
                    {primaryLabel(item.action)}
                    <ArrowIcon diagonal={item.action.type === "blackboard"} />
                  </button>
                ) : (
                  <button type="button" className="sh-btn-quiet" onClick={() => onRun(item.action)}>
                    Open
                    <ArrowIcon size={14} diagonal />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </HudPanel>
  );
}
