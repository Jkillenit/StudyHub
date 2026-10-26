import { renderMarkdown } from "../markdown.js";

export function DraftReader({ draft, busy, error, onBack, onStatus }) {
  const html = renderMarkdown(draft?.markdown || "");
  const meta = draft?.meta || {};

  return (
    <div className="remote-draft">
      <div className="remote-draft-toolbar">
        <button type="button" className="remote-btn remote-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="remote-btn remote-btn-primary"
          disabled={busy || meta.status === "reviewed"}
          onClick={() => onStatus("reviewed")}
        >
          Mark reviewed
        </button>
        <button
          type="button"
          className="remote-btn remote-btn-ghost"
          disabled={busy}
          onClick={() => onStatus("dismissed")}
        >
          Dismiss
        </button>
      </div>
      <article className="remote-card">
        <h2>Draft</h2>
        <p className="remote-headline">
          {meta.mode ? String(meta.mode).replace(/_/g, " ") : "Draft"}
          {meta.check_count != null ? ` · ${meta.check_count} checks` : ""}
        </p>
        <p className="remote-meta">Status: {meta.status || "ready"}</p>
      </article>
      {error ? (
        <div className="remote-banner" data-tone="danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="remote-card remote-md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
