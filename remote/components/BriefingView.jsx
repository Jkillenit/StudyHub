import {
  briefingSections,
  cardMetaText,
  cardPrimaryText,
  sessionLine,
} from "../viewModels.js";

export function BriefingView({ briefing, offline, onOpenDraft }) {
  const sections = briefingSections(briefing);
  const spend = briefing?.aiSpend;

  return (
    <div className="remote-section">
      <article className="remote-card">
        <h2>Briefing</h2>
        <p className="remote-headline">
          {briefing?.headline || "No briefing yet. Hit Run when you are ready."}
        </p>
        <p className="remote-meta">{sessionLine(briefing, { offline })}</p>
        {briefing?.jobs ? (
          <p className="remote-meta">
            Jobs ran {briefing.jobs.ran}
            {briefing.jobs.failed ? ` · ${briefing.jobs.failed} failed` : ""}
          </p>
        ) : null}
        {spend ? (
          <p className="remote-spend">
            AI {spend.todayCents}¢ / {spend.capCents}¢ today
          </p>
        ) : null}
      </article>

      {sections.map((section) => (
        <section key={section.id} className="remote-section">
          <h2 className="remote-section-title">{section.title}</h2>
          {section.items.length === 0 ? (
            <p className="remote-empty">{section.empty}</p>
          ) : (
            section.items.map((item, index) => {
              const draftId = item.draftId || (section.id === "needsYou" && item.kind === "review_draft" ? item.ref : null);
              const key = `${section.id}-${draftId || item.title || item.text || index}`;
              const body = (
                <>
                  <span className="remote-item-title">{cardPrimaryText(item, section.id)}</span>
                  {cardMetaText(item, section.id) ? (
                    <span className="remote-item-meta">{cardMetaText(item, section.id)}</span>
                  ) : null}
                </>
              );
              if (draftId && onOpenDraft) {
                return (
                  <button
                    key={key}
                    type="button"
                    className="remote-item"
                    onClick={() => onOpenDraft(draftId)}
                  >
                    {body}
                  </button>
                );
              }
              return (
                <div key={key} className="remote-item">
                  {body}
                </div>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}
