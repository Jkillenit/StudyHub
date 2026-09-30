/** Mono course pill: warn colors when the course is below target, accent otherwise. */
export function CourseChip({ label, state }) {
  if (!label) return null;
  return <span className={`sh-chip sh-chip--${state === "warn" ? "warn" : "accent"}`}>{label}</span>;
}
