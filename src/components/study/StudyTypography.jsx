export function FormulaBox({ children }) {
  return (
    <div className="def-card def-card--formula">
      <div className="def-card__label">FORMULA</div>
      <pre className="formula-pre mb-0">{children}</pre>
    </div>
  );
}

export function Card({ title, children }) {
  return (
    <div className="def-card">
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
  return <span style={{ color: "var(--sh-text)", fontWeight: 600 }}>{children}</span>;
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
    <ul className="sh-bulletlist">
      {items.map((item, i) => (
        <li key={i} className="font-sans">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function NumList({ items }) {
  return (
    <ol className="sh-numlist">
      {items.map((item, i) => (
        <li key={i} className="font-sans">
          {item}
        </li>
      ))}
    </ol>
  );
}
