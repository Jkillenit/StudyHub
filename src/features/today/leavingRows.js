/**
 * Rows shown last time that aren't in the new top three, with their slot. `done` only when the item is
 * known finished (`finished` ids); rows pushed out, re-ranked away or gone overdue are not.
 */
export function goneRows(prevRows, nextIds, finished = []) {
  const keep = new Set(nextIds);
  const doneIds = new Set(finished);
  return prevRows.flatMap((item, index) => (keep.has(item.id) ? [] : [{ item, index, done: doneIds.has(item.id) }]));
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
