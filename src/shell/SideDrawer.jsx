import { useEffect } from "react";
import { paletteOpen } from "../lib/hotkeys.js";

export default function SideDrawer({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || paletteOpen()) return;
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="sh-drawer" role="dialog" aria-label={title} data-sprite-avoid>
      <div className="sh-drawer-head">
        <span className="sh-drawer-title">{title}</span>
        <button type="button" className="sh-drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="sh-drawer-body">{children}</div>
    </aside>
  );
}
