const TAGGED = { exam: "EXAM", quiz: "QUIZ" };

export function KindTag({ kind }) {
  const label = TAGGED[kind];
  return label ? <span className={`sh-today-tag sh-today-tag--${kind}`}>{label}</span> : null;
}
