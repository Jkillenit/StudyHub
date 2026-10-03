import { useSyncExternalStore } from "react";
import { loadJson, saveJson } from "../lib/storage.js";

/** Flavor packs swap token values, art, copy and celebrations; layout never changes. */
export const PACKS = ["nova", "zombies"];
const KEY = "studyHub.v2.prefs.pack";
const EVENT = "studyhub-pack-changed";

export function getPack() {
  const v = loadJson(KEY, null);
  return PACKS.includes(v) ? v : PACKS[0];
}

export function applyStoredPack() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.pack = getPack();
}

export function setPack(id) {
  saveJson(KEY, PACKS.includes(id) ? id : PACKS[0]);
  applyStoredPack();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { pack: getPack() } }));
}

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

export function usePack() {
  return useSyncExternalStore(subscribe, getPack, () => PACKS[0]);
}
