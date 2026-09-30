import { EditorContent, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Highlight from "@tiptap/extension-highlight";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGlossaryTermsForChapter } from "../glossary/index.js";
import { getStudyChapterNote, saveStudyChapterNote } from "./chapterNotesStorage.js";
import { bodyToHtml } from "../lib/notesBody.js";
import { useNotesEditor } from "./useNotesEditor.js";

const EXTRA_EXTENSIONS = [Highlight.configure({ multicolor: false })];

function initialHtmlForSection(sectionId) {
  const note = getStudyChapterNote(sectionId);
  return bodyToHtml(note.html.trim() ? note.html : note.markdown);
}

function NotesBubbleToolbar({ editor }) {
  const fmt = useEditorState({
    editor,
    selector: (snapshot) => ({
      bold: snapshot.editor.isActive("bold"),
      italic: snapshot.editor.isActive("italic"),
      h2: snapshot.editor.isActive("heading", { level: 2 }),
      h3: snapshot.editor.isActive("heading", { level: 3 }),
      highlight: snapshot.editor.isActive("highlight"),
      blockquote: snapshot.editor.isActive("blockquote"),
    }),
  });

  if (!fmt) return null;

  return (
    <div className="sh-bubble-menu">
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.bold ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
      >
        B
      </button>
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.italic ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
      >
        I
      </button>
      <div className="sh-bubble-sep" aria-hidden />
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.h2 ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 2 }).run();
        }}
      >
        H2
      </button>
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.h3 ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 3 }).run();
        }}
      >
        H3
      </button>
      <div className="sh-bubble-sep" aria-hidden />
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.highlight ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHighlight().run();
        }}
      >
        ◼
      </button>
      <button
        type="button"
        className={`sh-bubble-btn ${fmt.blockquote ? "is-active" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBlockquote().run();
        }}
      >
        {'"'}
      </button>
    </div>
  );
}

/**
 * Rich notes editor (TipTap). Remount with key={sectionId} for clean chapter state.
 * @param {(phase: 'saving' | 'saved' | 'local') => void} [onAutosaveStatus]
 */
export function NotesEditor({ sectionId, onPersist, onAutosaveStatus, className, onEditorReady }) {
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  const [popover, setPopover] = useState(null);
  const glossaryTerms = useMemo(() => getGlossaryTermsForChapter(sectionId), [sectionId]);
  const initialHtml = useMemo(() => initialHtmlForSection(sectionId), [sectionId]);
  const { editor } = useNotesEditor({
    sectionId,
    initialHtml,
    glossaryTerms,
    onAutosaveStatus,
    extraExtensions: EXTRA_EXTENSIONS,
    onSave: (html, id) => {
      saveStudyChapterNote(id, html);
      onPersistRef.current?.();
    },
  });

  function handleEditorClick(e) {
    const mark = e.target.closest("[data-glossary]");
    if (!mark) {
      setPopover(null);
      return;
    }
    const rect = mark.getBoundingClientRect();
    const dataGloss = mark.getAttribute("data-glossary") ?? "";
    const defAttr = mark.getAttribute("data-definition");
    const definition =
      defAttr ||
      glossaryTerms.find((t) => t.term.toLowerCase() === dataGloss.toLowerCase())?.definition ||
      "";
    setPopover({
      term: dataGloss,
      definition,
      x: rect.left,
      y: rect.bottom + 6,
    });
    e.stopPropagation();
  }

  useEffect(() => {
    const close = () => setPopover(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  return (
    <div
      className={className ?? "sh-notes-wrapper-inner"}
      style={{ touchAction: "auto" }}
      onClick={handleEditorClick}
    >
      {editor ? (
        <>
          <BubbleMenu
            editor={editor}
            appendTo={() => document.body}
            options={{ placement: "top" }}
          >
            <NotesBubbleToolbar editor={editor} />
          </BubbleMenu>
          <EditorContent editor={editor} />
        </>
      ) : null}
      {popover ? (
        <div
          className="sh-glossary-popover"
          style={{ left: popover.x, top: popover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sh-glossary-popover-term">{popover.term}</div>
          <div className="sh-glossary-popover-def">{popover.definition}</div>
        </div>
      ) : null}
    </div>
  );
}
