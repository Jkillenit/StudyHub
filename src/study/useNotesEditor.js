import { useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createGlossaryPlugin, glossaryPluginKey } from "./applyGlossaryHighlights.js";

const SAVE_DEBOUNCE_MS = 500;
const SAVED_STATUS_MS = 1500;

/**
 * Shared TipTap setup for chapter notes: glossary highlighting, debounced save, and a flush of the
 * pending edit on section change and unmount (the html is buffered, so saving never needs the editor).
 * @param {{ sectionId: string, initialHtml: string, glossaryTerms: Array, onSave: (html: string, sectionId: string) => void,
 *   onAutosaveStatus?: (phase: 'saving' | 'saved' | 'local') => void, placeholder?: string, extraExtensions?: Array }} opts
 */
export function useNotesEditor({ sectionId, initialHtml, glossaryTerms, onSave, onAutosaveStatus, placeholder, extraExtensions }) {
  const debounceRef = useRef(null);
  const statusTimerRef = useRef(null);
  const pendingHtmlRef = useRef(null);
  const glossaryTermsRef = useRef(glossaryTerms || []);
  const onSaveRef = useRef(onSave);
  const onStatusRef = useRef(onAutosaveStatus);
  onSaveRef.current = onSave;
  onStatusRef.current = onAutosaveStatus;

  const extensions = useMemo(() => {
    const plugin = createGlossaryPlugin(() => glossaryTermsRef.current);
    return [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: { HTMLAttributes: { class: "sh-code-block" } } }),
      Placeholder.configure({ placeholder: placeholder || "Start typing notes...", emptyEditorClass: "sh-editor-empty" }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      ...(extraExtensions || []),
      Extension.create({ name: "glossaryHighlight", addProseMirrorPlugins: () => [plugin] }),
    ];
    // Extensions are fixed for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = () => {
    window.clearTimeout(debounceRef.current);
    if (pendingHtmlRef.current == null) return;
    const html = pendingHtmlRef.current;
    pendingHtmlRef.current = null;
    onSaveRef.current?.(html, sectionId);
  };

  const editor = useEditor(
    {
      extensions,
      content: initialHtml,
      onUpdate: ({ editor: ed }) => {
        onStatusRef.current?.("saving");
        pendingHtmlRef.current = ed.isEmpty ? "" : ed.getHTML();
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          flush();
          onStatusRef.current?.("saved");
          window.clearTimeout(statusTimerRef.current);
          statusTimerRef.current = window.setTimeout(() => onStatusRef.current?.("local"), SAVED_STATUS_MS);
        }, SAVE_DEBOUNCE_MS);
      },
      editorProps: { attributes: { class: "sh-editor-content", spellcheck: "true" } },
    },
    [sectionId]
  );

  useEffect(() => {
    const next = glossaryTerms || [];
    if (JSON.stringify(glossaryTermsRef.current) === JSON.stringify(next)) return;
    glossaryTermsRef.current = next;
    if (editor && !editor.isDestroyed && editor.view) editor.view.dispatch(editor.state.tr.setMeta(glossaryPluginKey, true));
  }, [glossaryTerms, editor]);

  useEffect(
    () => () => {
      flush();
      window.clearTimeout(statusTimerRef.current);
    },
    // flush() closes over this sectionId, so the pending edit is saved to the section it was typed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionId]
  );

  const isPending = useCallback(() => pendingHtmlRef.current != null, []);
  return { editor, isPending };
}
