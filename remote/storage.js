/**
 * Local persistence for the Station remote PWA (token + last briefing).
 * Keys stay under studyHub.station.remote.* so they do not collide with desktop prefs.
 */

const TOKEN_KEY = "studyHub.station.remote.token";
const BRIEFING_KEY = "studyHub.station.remote.lastBriefing";
const BASE_URL_KEY = "studyHub.station.remote.baseUrl";

/** @param {Storage} [store] */
export function createStorage(store = globalThis.localStorage) {
  return {
    getToken() {
      return store.getItem(TOKEN_KEY) || "";
    },
    setToken(token) {
      const value = String(token || "").trim();
      if (!value) store.removeItem(TOKEN_KEY);
      else store.setItem(TOKEN_KEY, value);
    },
    clearToken() {
      store.removeItem(TOKEN_KEY);
    },
    getBaseUrl() {
      return store.getItem(BASE_URL_KEY) || "";
    },
    setBaseUrl(url) {
      const value = String(url || "").trim().replace(/\/$/, "");
      if (!value) store.removeItem(BASE_URL_KEY);
      else store.setItem(BASE_URL_KEY, value);
    },
    getLastBriefing() {
      const raw = store.getItem(BRIEFING_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    setLastBriefing(briefing) {
      if (!briefing || typeof briefing !== "object") {
        store.removeItem(BRIEFING_KEY);
        return;
      }
      store.setItem(BRIEFING_KEY, JSON.stringify(briefing));
    },
  };
}
