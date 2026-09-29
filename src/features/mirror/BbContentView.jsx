import { useEffect, useMemo, useState } from "react";
import { openInBlackboard } from "./openInBlackboard.js";

const KIND_TAG = {
  folder: "DIR",
  file: "FILE",
  assignment: "ASGN",
  assessment: "TEST",
  link: "LINK",
  item: "ITEM",
};

function buildTree(rows) {
  const byParent = new Map();
  for (const row of rows) {
    const key = row.parent_bb_id || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  const ids = new Set(rows.map((r) => r.bb_id));
  // Items whose parent was not synced (depth limit) are shown at the top level.
  const roots = rows.filter((r) => !r.parent_bb_id || !ids.has(r.parent_bb_id));
  return { roots, childrenOf: (id) => byParent.get(id) || [] };
}

function Node({ item, depth, tree, openIds, onToggle }) {
  const children = tree.childrenOf(item.bb_id);
  const isFolder = item.kind === "folder" || children.length > 0;
  const open = openIds.has(item.bb_id);
  return (
    <li>
      <div className="sh-bbtree-row" style={{ paddingLeft: 8 + depth * 16 }}>
        {isFolder ? (
          <button type="button" className="sh-expand-toggle" onClick={() => onToggle(item.bb_id)} aria-expanded={open}>
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="sh-bbtree-spacer" />
        )}
        <span className="sh-bbtree-kind mono">{KIND_TAG[item.kind] || "ITEM"}</span>
        <span className="sh-bbtree-title">{item.title}</span>
        {item.url ? (
          <button type="button" className="sh-asg-action" onClick={() => openInBlackboard(item.url)}>
            OPEN
          </button>
        ) : null}
      </div>
      {isFolder && open && children.length ? (
        <ul className="sh-bbtree-list">
          {children.map((child) => (
            <Node key={child.bb_id} item={child} depth={depth + 1} tree={tree} openIds={openIds} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function BbContentView({ courseUuid }) {
  const [rows, setRows] = useState(null);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await window.studyHub?.db?.bb?.getItems?.(courseUuid);
      if (!cancelled) setRows(Array.isArray(res) ? res : []);
    };
    void load();
    const onSynced = (e) => {
      if (e.detail?.courseUuid === courseUuid) void load();
    };
    window.addEventListener("studyhub-bb-synced", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("studyhub-bb-synced", onSynced);
    };
  }, [courseUuid]);

  const tree = useMemo(() => buildTree(rows || []), [rows]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (rows || []).filter((r) => r.title.toLowerCase().includes(q)) : null;
  }, [rows, query]);

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows === null) return <div className="sh-skeleton-pulse" style={{ height: 200 }} />;

  return (
    <div className="main-content sh-mirror-view">
      <div className="sh-mirror-head">
        <div className="sh-section-label">BLACKBOARD CONTENT · {rows.length}</div>
        {rows.length ? (
          <input
            type="search"
            className="sh-asg-input"
            placeholder="Search content"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
      </div>
      {!rows.length ? (
        <p className="sh-today-empty">Nothing synced yet. Sync this course from Blackboard to see its content here.</p>
      ) : matches ? (
        <ul className="sh-bbtree-list">
          {matches.map((item) => (
            <Node key={item.bb_id} item={item} depth={0} tree={{ childrenOf: () => [] }} openIds={openIds} onToggle={toggle} />
          ))}
        </ul>
      ) : (
        <ul className="sh-bbtree-list">
          {tree.roots.map((item) => (
            <Node key={item.bb_id} item={item} depth={0} tree={tree} openIds={openIds} onToggle={toggle} />
          ))}
        </ul>
      )}
    </div>
  );
}
