import { useEffect, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import { NotesEditor } from "./NotesEditor.jsx";

/**
 * Notes beside chapter content (split) or stacked below on narrow viewports.
 */
export function ChapterNotesSplitPanel({ show, onClose, sectionId, sectionTitle, onPersist, stacked }) {
  const [savePhase, setSavePhase] = useState("local");

  useEffect(() => {
    if (!show || !sectionId) setSavePhase("local");
  }, [show, sectionId]);

  const handleClose = () => {
    onPersist?.();
    onClose();
  };

  if (!show) return null;

  const badgeLabel =
    savePhase === "saving" ? "Saving…" : savePhase === "saved" ? "Saved" : "Local";

  return (
    <aside
      aria-label="Chapter notes"
      className={
        stacked
          ? "sh-notes-split w-100 border-top border-secondary d-flex flex-column bg-dark flex-shrink-0"
          : "sh-notes-split border-start border-secondary d-flex flex-column bg-dark flex-shrink-0"
      }
      style={
        stacked
          ? { maxHeight: "min(48vh, 440px)", minHeight: 200 }
          : { width: "min(42vw, 440px)", minWidth: 280, maxHeight: "calc(100vh - 100px)" }
      }
    >
      <div className="d-flex align-items-start justify-content-between gap-2 p-2 border-bottom border-secondary flex-shrink-0">
        <div className="min-w-0">
          <div className="text-light fw-semibold small">Notes</div>
          {sectionTitle ? (
            <div className="text-secondary text-truncate small" title={sectionTitle}>
              {sectionTitle}
            </div>
          ) : null}
        </div>
        <Button variant="outline-secondary" size="sm" className="flex-shrink-0" onClick={handleClose} aria-label="Close notes panel">
          Close
        </Button>
      </div>
      <div className="flex-grow-1 overflow-hidden min-h-0 d-flex flex-column">
        <div className="sh-notes-wrapper sh-notes-wrapper--split flex-grow-1 min-h-0 d-flex flex-column">
          <NotesEditor
            key={sectionId}
            sectionId={sectionId}
            onPersist={onPersist}
            onAutosaveStatus={setSavePhase}
          />
        </div>
        <div className="d-flex align-items-center gap-2 small text-secondary flex-shrink-0 px-2 py-1 border-top border-secondary">
          <Badge bg="secondary">{badgeLabel}</Badge>
        </div>
      </div>
    </aside>
  );
}
