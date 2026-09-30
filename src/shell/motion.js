import { useSyncExternalStore } from "react";
import { loadJson, saveJson } from "../lib/storage.js";

/** null = follow the OS setting; true / false = the user's explicit choice in Settings. */
const KEY = "studyHub.v2.prefs.reducedMotion";
const EVENT = "studyhub-motion-changed";
const QUERY = "(prefers-reduced-motion: reduce)";

function systemPrefersReduced() {
  return typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;
}

export function getMotionPref() {
  const v = loadJson(KEY, null);
  return typeof v === "boolean" ? v : null;
}

export function isReducedMotion() {
  const pref = getMotionPref();
  return pref ?? systemPrefersReduced();
}

export function applyStoredMotionPref() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = isReducedMotion() ? "reduced" : "full";
}

export function setMotionPref(value) {
  saveJson(KEY, typeof value === "boolean" ? value : null);
  applyStoredMotionPref();
  window.dispatchEvent(new CustomEvent(EVENT));
}

function subscribe(callback) {
  const mq = window.matchMedia?.(QUERY);
  const onSystem = () => {
    applyStoredMotionPref();
    callback();
  };
  window.addEventListener(EVENT, callback);
  mq?.addEventListener?.("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, callback);
    mq?.removeEventListener?.("change", onSystem);
  };
}

/** True when motion should be minimal: the Settings toggle wins, otherwise the OS setting. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, isReducedMotion, () => false);
}

export function useMotionPref() {
  return useSyncExternalStore(subscribe, getMotionPref, () => null);
}
