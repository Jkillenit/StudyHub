/** Her body's resolve amount (0 = scattered, 1 = whole) at `now` for a tween `{ from, to, start, ms }`, eased in and out. */
export function resolveAt({ from, to, start, ms }, now) {
  const p = ms > 0 ? Math.min(1, Math.max(0, (now - start) / ms)) : 1;
  return from + (to - from) * p * p * (3 - 2 * p);
}
