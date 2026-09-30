import idle from "./nova/idle.jpg?inline";
import smile from "./nova/smile.jpg?inline";
import wink from "./nova/wink.jpg?inline";
import stern from "./nova/stern.jpg?inline";
import thinking from "./nova/thinking.jpg?inline";
import point from "./nova/point.jpg?inline";
import sleep from "./nova/sleep.jpg?inline";
import rampant from "./nova/rampant.jpg?inline";

/** Portraits are rendered on black; black becomes transparent the way a projector's light would. */
export const RAW_FRAMES = { idle, smile, wink, stern, thinking, point, sleep, rampant };

const FLOOR = 14;
const OPACITY = 0.94;
const FADE_FROM = 0.8;

let keyed = null;
let pending = null;

function keyImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        const p = data.data;
        const fadeStart = Math.floor(h * FADE_FROM);
        for (let y = 0; y < h; y += 1) {
          const fade = y < fadeStart ? 1 : 1 - (y - fadeStart) / (h - fadeStart);
          for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            const m = Math.max(p[i], p[i + 1], p[i + 2]);
            if (m <= FLOOR) {
              p[i + 3] = 0;
              continue;
            }
            const s = 255 / m;
            p[i] = Math.min(255, p[i] * s);
            p[i + 1] = Math.min(255, p[i + 1] * s);
            p[i + 2] = Math.min(255, p[i + 2] * s);
            p[i + 3] = Math.round(((m - FLOOR) / (255 - FLOOR)) * 255 * OPACITY * fade);
          }
        }
        ctx.putImageData(data, 0, 0);
        canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : src), "image/png");
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function keyedFramesSync() {
  return keyed;
}

/** Keys every portrait once per app session; falls back to the raw frame if canvas is unavailable. */
export function loadKeyedFrames() {
  if (!pending) {
    pending = Promise.all(Object.entries(RAW_FRAMES).map(async ([k, src]) => [k, await keyImage(src)])).then((entries) => {
      keyed = Object.fromEntries(entries);
      return keyed;
    });
  }
  return pending;
}
