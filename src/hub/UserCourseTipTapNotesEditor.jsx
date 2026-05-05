import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import { useEffect, useMemo, useRef } from "react";
import { createGlossaryPlugin, glossaryPluginKey } from "../study/applyGlossaryHighlights.js";

function plainTextToHtml(text) {
  const escaped = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  if (!escaped.trim()) return "";
  return escaped
    .split(/\n{2,}/)
    .map((chunk) => `<p>${chunk.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function UserCourseTipTapNotesEditor({
  sectionId,
  value,
  glossaryTerms = [],
  onChangeValue,
  onAutosaveStatus,
}) {
  const debounceRef = useRef(null);
  const glossaryTermsRef = useRef(glossaryTerms);
  const editorRef = useRef(null);
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

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] } }),
        Placeholder.configure({
          placeholder: "Type notes...",
          emptyEditorClass: "sh-editor-empty",
        }),
        Typography,
        TaskList,
        TaskItem.configure({ nested: true }),
        GlossaryExtension,
      ],
      content: plainTextToHtml(value),
      onUpdate: ({ editor: ed }) => {
        onAutosaveStatus?.("saving");
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          onChangeValue?.(ed.getText({ blockSeparator: "\n\n" }));
          onAutosaveStatus?.("saved");
          window.setTimeout(() => onAutosaveStatus?.("local"), 1200);
        }, 500);
      },
      editorProps: {
        attributes: {
          class: "sh-editor-content",
          spellcheck: "true",
        },
      },
    },
    [sectionId, GlossaryExtension]
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const prev = JSON.stringify(glossaryTermsRef.current || []);
    const next = JSON.stringify(glossaryTerms || []);
    if (prev === next) return;
    glossaryTermsRef.current = glossaryTerms || [];
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed && ed.view) {
      ed.view.dispatch(ed.state.tr.setMeta(glossaryPluginKey, true));
    }
  }, [glossaryTerms, editor]);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="sh-notes-wrapper-inner" style={{ touchAction: "auto" }}>
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}
