import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const glossaryPluginKey = new PluginKey("glossaryHighlight");

export function createGlossaryPlugin(getTerms) {
  return new Plugin({
    key: glossaryPluginKey,
    state: {
      init(_, { doc }) {
        return buildDecorations(doc, getTerms());
      },
      apply(tr, old) {
        if (!tr.docChanged && !tr.getMeta(glossaryPluginKey)) return old;
        return buildDecorations(tr.doc, getTerms());
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

function buildDecorations(doc, terms) {
  if (!terms?.length) {
    return DecorationSet.empty;
  }
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const decorations = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const hasCode = node.marks.some((m) => m.type.name === "code");
    if (hasCode) return true;
    const mid = pos + Math.min(1, node.text.length);
    const $p = doc.resolve(mid);
    for (let d = $p.depth; d > 0; d--) {
      if ($p.node(d).type.name === "codeBlock") return true;
    }

    sorted.forEach(({ term, definition }) => {
      const raw = term.trim();
      if (!raw) return;
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escapeRegex(raw)}(?:[^a-zA-Z0-9]|$)`, "gi");
      let match;
      while ((match = regex.exec(node.text)) !== null) {
        const leadingChar = /^[a-zA-Z0-9]/.test(match[0][0]) ? 0 : 1;
        const from = pos + match.index + leadingChar;
        const to = from + raw.length;
        decorations.push(
          Decoration.inline(from, to, {
            class: "sh-glossary-mark",
            "data-glossary": raw,
            "data-definition": definition ?? "",
          })
        );
      }
    });
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
