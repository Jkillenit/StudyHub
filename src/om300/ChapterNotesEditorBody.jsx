import { Om300TipTapNotesEditor } from "./Om300TipTapNotesEditor.jsx";

/**
 * Rich notes (TipTap) for main column. Remount editor via key on Om300TipTapNotesEditor parent (Study Hub passes key={sectionId}).
 */
export function ChapterNotesEditorBody({ sectionId, sectionTitle, onPersist, onAutosaveStatus, onEditorReady }) {
  return (
    <div>
      {sectionTitle ? (
        <div className="ctx-label" style={{ marginBottom: 12 }}>
          {sectionTitle.toUpperCase()}
        </div>
      ) : null}
      <div className="sh-notes-wrapper">
        <Om300TipTapNotesEditor
          key={sectionId}
          sectionId={sectionId}
          onPersist={onPersist}
          onAutosaveStatus={onAutosaveStatus}
          onEditorReady={onEditorReady}
        />
      </div>
    </div>
  );
}
