export const AMBIENT_LINES = 12;

export function ambientY(i, count, x, w, h, t) {
  const band = (h * (i + 0.5)) / count;
  const u = x / w;
  return band
    + Math.sin(u * 6 + t * 0.25 + i * 0.7) * h * 0.06
    + Math.sin(u * 13 - t * 0.15 + i) * h * 0.02;
}

export function ambientAlpha(i, t) {
  return 0.05 + 0.01 * Math.sin(t * 0.3 + i);
}
