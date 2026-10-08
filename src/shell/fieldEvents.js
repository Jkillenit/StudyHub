/** The ambient particle field's window-event API (studyhub-field-*), plus its pure tuning helpers. */
export const FIELD_EVENTS = {
  targets: "studyhub-field-targets", // { points: [x, y][], duration }  gather particles to screen points
  release: "studyhub-field-release", // send gathered particles home
  attractor: "studyhub-field-attractor", // { x, y, strength }  Nova's position
  emit: "studyhub-field-emit", // { rect, to: { x, y }, count }  stream from a DOM rect to a point
  state: "studyhub-field-state", // { state: "idle" | "thinking" | "pointing", from, to }
  dim: "studyhub-field-dim", // { amount }  0 = normal, 1 = nearly gone
  gathered: "studyhub-field-gathered", // fired by the field when a targets gather completes
};

const send = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

let attractorAt = null;
/** Nova's last published position (`{ x, y }`), or null before the first. */
export const lastAttractor = () => attractorAt;
/** Where to stream particles into Nova: her last position while she's on screen and not tucked away, else null. */
export const novaAttractor = () => {
  const d = document.documentElement.dataset;
  return d.nova === "on" && !("novaTucked" in d) ? attractorAt : null;
};

export const fieldTargets = (points, duration = 900) => send(FIELD_EVENTS.targets, { points, duration });
export const fieldRelease = () => send(FIELD_EVENTS.release);
export const fieldAttractor = (x, y, strength = 1) => {
  attractorAt = { x, y };
  send(FIELD_EVENTS.attractor, { x, y, strength });
};
export const fieldEmit = (rect, to, count = 60) =>
  send(FIELD_EVENTS.emit, { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, to, count });
export const fieldState = (state, from, to) => send(FIELD_EVENTS.state, { state, from, to });
export const fieldDim = (amount) => send(FIELD_EVENTS.dim, { amount });

export const FIELD_COUNT = 3000;
export const FIELD_FPS = 30;

/** Density (share of FIELD_COUNT drawn) and drift speed by time of day: sparse and slow late at night. */
export function fieldTuning(part) {
  if (part === "late") return { density: 0.45, speed: 0.5 };
  if (part === "evening") return { density: 0.75, speed: 0.8 };
  if (part === "morning") return { density: 0.9, speed: 1 };
  return { density: 1, speed: 1 };
}

/** Frame gate: true when enough time has passed since the last drawn frame for the target fps. */
export const frameDue = (now, last, fps = FIELD_FPS) => now - last >= 1000 / fps - 1;
