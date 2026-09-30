/** Nova's sound effects, synthesized on the fly so there are no audio assets to ship. */
let ctx = null;

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function envelope(ac, at, dur, peak) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(ac.destination);
  return g;
}

function tone(ac, { from, to = from, dur = 0.15, type = "sine", peak = 0.05, delay = 0 }) {
  const at = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  osc.connect(envelope(ac, at, dur, peak));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function noise(ac, { dur = 0.12, peak = 0.04, freq = 2400, q = 1.2, delay = 0 }) {
  const at = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  src.connect(bp);
  bp.connect(envelope(ac, at, dur, peak));
  src.start(at);
}

const SOUNDS = {
  appear: (ac) => {
    tone(ac, { from: 280, to: 880, dur: 0.35, peak: 0.04 });
    tone(ac, { from: 1320, to: 1760, dur: 0.25, type: "triangle", peak: 0.015, delay: 0.18 });
    noise(ac, { dur: 0.3, peak: 0.012, freq: 5000, q: 0.8 });
  },
  teleportOut: (ac) => {
    tone(ac, { from: 1400, to: 220, dur: 0.18, type: "triangle", peak: 0.03 });
    noise(ac, { dur: 0.16, peak: 0.02, freq: 3500 });
  },
  teleportIn: (ac) => {
    tone(ac, { from: 240, to: 1100, dur: 0.22, type: "triangle", peak: 0.03 });
  },
  correct: (ac) => {
    tone(ac, { from: 660, dur: 0.1, type: "triangle", peak: 0.04 });
    tone(ac, { from: 990, dur: 0.16, type: "triangle", peak: 0.04, delay: 0.08 });
  },
  streak: (ac) => {
    [660, 880, 1320].forEach((f, i) => tone(ac, { from: f, dur: 0.12, type: "triangle", peak: 0.035, delay: i * 0.07 }));
  },
  wrong: (ac) => {
    tone(ac, { from: 190, to: 110, dur: 0.28, type: "square", peak: 0.025 });
  },
  glitch: (ac) => {
    for (let i = 0; i < 5; i += 1) {
      noise(ac, { dur: 0.04, peak: 0.03, freq: 800 + Math.random() * 4000, q: 4, delay: i * 0.06 + Math.random() * 0.03 });
    }
    tone(ac, { from: 90, to: 60, dur: 0.35, type: "sawtooth", peak: 0.015 });
  },
  open: (ac) => {
    tone(ac, { from: 1200, to: 1600, dur: 0.07, peak: 0.025 });
  },
};

export function playSound(name) {
  try {
    const ac = audio();
    if (ac) SOUNDS[name]?.(ac);
  } catch {
    /* audio is optional */
  }
}
