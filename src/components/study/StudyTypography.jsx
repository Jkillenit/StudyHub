export function FormulaBox({ children }) {
  return (
    <div className="def-card def-card--formula mb-2">
      <div className="def-card__label">FORMULA</div>
      <pre className="formula-pre mb-0">{children}</pre>
    </div>
  );
}

export function Card({ title, children, accent }) {
  const border = accent ? { borderLeftColor: accent } : undefined;
  return (
    <div className="def-card mb-2" style={border}>
      {title ? <div className="def-card__title">{title}</div> : null}
      <div className="def-card__body">{children}</div>
    </div>
  );
}

export function SLabel({ children, id }) {
  return (
    <div id={id} className="sh-section-label" style={{ scrollMarginTop: id ? 12 : undefined }}>
      {children}
    </div>
  );
}

export function Term({ children }) {
  return <span style={{ color: "var(--sh-text-primary)", fontWeight: 600 }}>{children}</span>;
}

export function Grid2({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function BulletList({ items }) {
  return (
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} className="font-sans" style={{ fontSize: 12, color: "var(--sh-text-secondary)", lineHeight: 1.75, marginBottom: 2 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function NumList({ items }) {
  return (
    <ol style={{ paddingLeft: 18, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} className="font-sans" style={{ fontSize: 12, color: "var(--sh-text-secondary)", lineHeight: 1.75, marginBottom: 2 }}>
          {item}
        </li>
      ))}
    </ol>
  );
}
