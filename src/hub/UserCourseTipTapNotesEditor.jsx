import { EditorContent } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { useNotesEditor } from "../study/useNotesEditor.js";
import { bodyToHtml } from "../lib/notesBody.js";

export default function UserCourseTipTapNotesEditor({ sectionId, value, glossaryTerms = [], onChangeValue, onAutosaveStatus }) {
  const lastHtmlRef = useRef(bodyToHtml(value));
  const { editor, isPending } = useNotesEditor({
    sectionId,
    initialHtml: lastHtmlRef.current,
    glossaryTerms,
    placeholder: "Type notes...",
    onAutosaveStatus,
    onSave: (html, id) => {
      lastHtmlRef.current = html;
      onChangeValue?.(html, id);
    },
  });

  // Imports can append to the body while the tab is open; adopt those changes unless the user is typing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = bodyToHtml(value);
    if (incoming === lastHtmlRef.current || isPending() || editor.isFocused) return;
    lastHtmlRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor, isPending]);

  return (
    <div className="sh-notes-wrapper-inner" style={{ touchAction: "auto" }}>
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}
