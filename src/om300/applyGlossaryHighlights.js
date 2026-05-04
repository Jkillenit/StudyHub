export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlaps(a1, a2, b1, b2) {
  return Math.max(a1, b1) < Math.min(a2, b2);
}

function textNodeSkipped(schema, node, state, pos) {
  if (!node.isText) return true;
  if (schema.marks.code && schema.marks.code.isInSet(node.marks)) return true;
  const mid = pos + Math.min(1, node.text.length);
  const $p = state.doc.resolve(mid);
  for (let d = $p.depth; d > 0; d--) {
    if ($p.node(d).type.name === "codeBlock") return true;
  }
  return false;
}

/**
 * Strips and reapplies glossary marks after save. Restores selection.
 * Longer terms win overlaps; skips codeBlock + inline code.
 */
export function applyGlossaryHighlights(editor, glossaryTerms) {
  if (!editor || editor.isDestroyed) return;
  if (!glossaryTerms?.length) return;
  if (!editor.state.schema.marks.glossaryTerm) return;

  const savedSelection = editor.state.selection;
  const sortedTerms = [...glossaryTerms].sort((a, b) => b.term.length - a.term.length);
  const occupied = [];
  const matches = [];

  editor.chain().selectAll().unsetMark("glossaryTerm").run();

  const state = editor.state;
  for (const { term, definition } of sortedTerms) {
    const raw = term.trim();
    if (!raw) continue;
    const rx = new RegExp(`\\b${escapeRegex(raw)}\\b`, "gi");

    state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      if (textNodeSkipped(state.schema, node, state, pos)) return;
      rx.lastIndex = 0;
      let match;
      while ((match = rx.exec(node.text)) !== null) {
        const from = pos + match.index;
        const to = from + match[0].length;
        if (occupied.some(([a, b]) => overlaps(from, to, a, b))) continue;
        occupied.push([from, to]);
        matches.push({
          from,
          to,
          term: raw,
          definition: definition ?? "",
        });
      }
    });
  }

  matches.sort((a, b) => b.from - a.from);
  for (const { from, to, term, definition } of matches) {
    editor
      .chain()
      .setTextSelection({ from, to })
      .setMark("glossaryTerm", { term, definition })
      .run();
  }

  const maxPos = editor.state.doc.content.size;
  const anchor = Math.max(1, Math.min(savedSelection.anchor, maxPos));
  const head = Math.max(1, Math.min(savedSelection.head, maxPos));
  editor.chain().setTextSelection({ anchor, head }).run();
}
