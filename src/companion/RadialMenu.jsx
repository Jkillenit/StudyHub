import { useEffect, useRef } from "react";

/**
 * Options fanned around Nova, opening toward the middle of the window so they never
 * spill off-screen. Arrow keys move focus, Enter picks, Escape closes.
 */
export function RadialMenu({ items, center, size, onClose, footer, caption }) {
  const refs = useRef([]);
  const radius = 64 + size * 0.45;

  useEffect(() => {
    refs.current[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const list = refs.current.filter(Boolean);
      const i = list.indexOf(document.activeElement);
      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      list[(i + step + list.length) % list.length]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toward = Math.atan2(window.innerHeight / 2 - center.y, window.innerWidth / 2 - center.x);
  const spread = Math.PI * 0.9;
  const n = items.length;

  return (
    <div className="sc-menu" role="menu" aria-label="Nova menu" onPointerDown={(e) => e.stopPropagation()}>
      {items.map((item, i) => {
        const a = toward - spread / 2 + (n === 1 ? spread / 2 : (spread * i) / (n - 1));
        const x = size / 2 + Math.cos(a) * radius;
        const y = size / 2 + Math.sin(a) * radius;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            className="sc-menu-item mono"
            style={{ left: x, top: y, animationDelay: `${i * 35}ms` }}
            onClick={item.onClick}
          >
            <span className="sc-menu-icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        );
      })}
      {caption ? (
        <div className="sc-menu-caption" aria-live="polite">
          {caption}
        </div>
      ) : null}
      {footer ? (
        <div className="sc-menu-footer mono" style={{ top: size + 6 }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
