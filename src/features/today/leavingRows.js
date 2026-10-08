/** Rows shown last time whose item is gone from the whole new list (not just pushed out of the top three), with their slot. */
export function goneRows(prevRows, nextIds) {
  const keep = new Set(nextIds);
  return prevRows.flatMap((item, index) => (keep.has(item.id) ? [] : [{ item, index }]));
}

/** `rows` with the leaving ones put back in their old slots, as `{ item, leaving, index }` (index = the row's slot in its own list). */
export function withLeaving(rows, leaving) {
  const out = rows.map((item, index) => ({ item, leaving: false, index }));
  const ids = new Set(rows.map((r) => r.id));
  for (const g of [...leaving].sort((a, b) => a.index - b.index)) {
    if (!ids.has(g.item.id)) out.splice(Math.min(g.index, out.length), 0, { item: g.item, leaving: true, index: g.index });
  }
  return out;
}
