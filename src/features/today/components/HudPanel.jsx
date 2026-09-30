/** A glass panel. `brackets` adds the accent HUD corners; `index` sets its place in the arrival stagger. */
export function HudPanel({ as: Tag = "section", className = "", brackets = false, index = 0, children, style, ...rest }) {
  return (
    <Tag
      className={["sh-panel", "sh-arrive", brackets ? "sh-panel--hud" : "", className].filter(Boolean).join(" ")}
      style={{ "--i": index, ...style }}
      {...rest}
    >
      {brackets ? (
        <>
          <span className="sh-bracket sh-bracket--tl" aria-hidden />
          <span className="sh-bracket sh-bracket--tr" aria-hidden />
          <span className="sh-bracket sh-bracket--bl" aria-hidden />
          <span className="sh-bracket sh-bracket--br" aria-hidden />
        </>
      ) : null}
      {children}
    </Tag>
  );
}

export function ArrowIcon({ size = 15, diagonal = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {diagonal ? (
        <>
          <path d="M7 17L17 7" />
          <path d="M8 7h9v9" />
        </>
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}
