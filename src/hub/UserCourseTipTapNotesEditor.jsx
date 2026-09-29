import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import { useEffect, useMemo, useRef } from "react";
import { createGlossaryPlugin, glossaryPluginKey } from "../study/applyGlossaryHighlights.js";
import { bodyToHtml } from "../lib/notesBody.js";

const SAVE_DEBOUNCE_MS = 500;

export function UserCourseTipTapNotesEditor({
  sectionId,
  value,
  glossaryTerms = [],
  onChangeValue,
  onAutosaveStatus,
}) {
  const debounceRef = useRef(null);
  const statusTimerRef = useRef(null);
  const pendingHtmlRef = useRef(null);
  const lastHtmlRef = useRef(bodyToHtml(value));
  const glossaryTermsRef = useRef(glossaryTerms);
  const onChangeRef = useRef(onChangeValue);
  const onStatusRef = useRef(onAutosaveStatus);
  onChangeRef.current = onChangeValue;
  onStatusRef.current = onAutosaveStatus;

  const plugin = useMemo(() => createGlossaryPlugin(() => glossaryTermsRef.current), []);
  const GlossaryExtension = useMemo(
    () =>
      Extension.create({
        name: "userCourseGlossaryHighlight",
        addProseMirrorPlugins() {
          return [plugin];
        },
      }),
    [plugin]
  );

  const flush = () => {
    window.clearTimeout(debounceRef.current);
    if (pendingHtmlRef.current == null) return;
    const html = pendingHtmlRef.current;
    pendingHtmlRef.current = null;
    lastHtmlRef.current = html;
    onChangeRef.current?.(html, sectionId);
  };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] } }),
        Placeholder.configure({ placeholder: "Type notes...", emptyEditorClass: "sh-editor-empty" }),
        Typography,
        TaskList,
        TaskItem.configure({ nested: true }),
        GlossaryExtension,
      ],
      content: lastHtmlRef.current,
      onUpdate: ({ editor: ed }) => {
        onStatusRef.current?.("saving");
        pendingHtmlRef.current = ed.isEmpty ? "" : ed.getHTML();
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          flush();
          onStatusRef.current?.("saved");
          window.clearTimeout(statusTimerRef.current);
          statusTimerRef.current = window.setTimeout(() => onStatusRef.current?.("local"), 1200);
        }, SAVE_DEBOUNCE_MS);
      },
      editorProps: { attributes: { class: "sh-editor-content", spellcheck: "true" } },
    },
    [sectionId, GlossaryExtension]
  );

  // Imports can append to the body while the tab is open; adopt those changes unless the user is typing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = bodyToHtml(value);
    if (incoming === lastHtmlRef.current || pendingHtmlRef.current != null || editor.isFocused) return;
    lastHtmlRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    const next = glossaryTerms || [];
    if (JSON.stringify(glossaryTermsRef.current || []) === JSON.stringify(next)) return;
    glossaryTermsRef.current = next;
    if (editor && !editor.isDestroyed && editor.view) {
      editor.view.dispatch(editor.state.tr.setMeta(glossaryPluginKey, true));
    }
  }, [glossaryTerms, editor]);

  useEffect(
    () => () => {
      flush();
      window.clearTimeout(statusTimerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionId]
  );

  return (
    <div className="sh-notes-wrapper-inner" style={{ touchAction: "auto" }}>
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}

export default UserCourseTipTapNotesEditor;
