import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGlossaryTermsForChapter } from "../glossary/index.js";
import { createGlossaryPlugin, glossaryPluginKey } from "./applyGlossaryHighlights.js";
import { getStudyChapterNote, saveStudyChapterNote } from "./chapterNotesStorage.js";

/** Escape legacy markdown to HTML paragraphs for one-time migration into TipTap. */
function legacyMarkdownToHtml(md) {
  if (!md || !md.trim()) return "";
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${esc.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

function initialHtmlForSection(sectionId) {
  const note = getStudyChapterNote(sectionId);
  if (note.html && note.html.trim()) return note.html;
  if (note.markdown && note.markdown.trim()) return legacyMarkdownToHtml(note.markdown);
  return "";
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
  const debounceRef = useRef(null);
  const savedCooldownRef = useRef(null);
  const onPersistRef = useRef(onPersist);
  const onAutosaveStatusRef = useRef(onAutosaveStatus);
  const glossaryTermsRef = useRef([]);
  const prevTermsRef = useRef([]);
  const editorRef = useRef(null);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [popover, setPopover] = useState(null);
  const glossaryPlugin = useMemo(() => createGlossaryPlugin(() => glossaryTermsRef.current), []);
  const GlossaryHighlightExtension = useMemo(
    () =>
      Extension.create({
        name: "glossaryHighlight",
        addProseMirrorPlugins() {
          return [glossaryPlugin];
        },
      }),
    [glossaryPlugin]
  );

  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  useEffect(() => {
    onAutosaveStatusRef.current = onAutosaveStatus;
  }, [onAutosaveStatus]);

  useEffect(() => {
    const terms = getGlossaryTermsForChapter(sectionId);
    setGlossaryTerms(terms);
    glossaryTermsRef.current = terms;
  }, [sectionId]);

  const initialContent = useMemo(() => initialHtmlForSection(sectionId), [sectionId]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: {
          HTMLAttributes: {
            class: "sh-code-block",
          },
        },
      }),
      Placeholder.configure({
        placeholder: "Start typing notes...",
        emptyEditorClass: "sh-editor-empty",
      }),
      Typography,
      Highlight.configure({
        multicolor: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      GlossaryHighlightExtension,
    ],
    [GlossaryHighlightExtension]
  );

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
      glossaryTermsRef.current.find((t) => t.term.toLowerCase() === dataGloss.toLowerCase())?.definition ||
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

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      onUpdate: ({ editor: ed }) => {
        onAutosaveStatusRef.current?.("saving");
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          const html = ed.getHTML();
          saveStudyChapterNote(sectionId, html);
          onPersistRef.current?.();
          onAutosaveStatusRef.current?.("saved");
          window.clearTimeout(savedCooldownRef.current);
          savedCooldownRef.current = window.setTimeout(() => {
            onAutosaveStatusRef.current?.("local");
          }, 2000);
        }, 500);
      },
      editorProps: {
        attributes: {
          class: "sh-editor-content",
          spellcheck: "true",
        },
      },
    },
    [sectionId, extensions, initialContent]
  );

  useEffect(() => {
    editorRef.current = editor;
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    const termsChanged = JSON.stringify(prevTermsRef.current) !== JSON.stringify(glossaryTerms);
    if (!termsChanged) return;
    prevTermsRef.current = glossaryTerms;
    glossaryTermsRef.current = glossaryTerms;
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed && glossaryTerms.length > 0) {
      ed.view.dispatch(ed.state.tr.setMeta(glossaryPluginKey, true));
    }
  }, [glossaryTerms]);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceRef.current);
      window.clearTimeout(savedCooldownRef.current);
      if (editor && !editor.isDestroyed) {
        saveStudyChapterNote(sectionId, editor.getHTML());
        onPersistRef.current?.();
      }
    };
  }, [editor, sectionId]);

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
