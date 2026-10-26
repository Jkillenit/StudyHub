/**
 * Station remote API client (BRIEFING §3.4). Same-origin by default (Tailscale serve).
 */

import { isRunPreset } from "./viewModels.js";

/**
 * @param {object} [opts]
 * @param {string} [opts.baseUrl]
 * @param {() => string} [opts.getToken]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export function createApiClient(opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const getToken = opts.getToken || (() => "");
  const baseUrl = () => String(opts.baseUrl ?? "").replace(/\/$/, "");

  async function request(path, init = {}) {
    const token = getToken();
    if (!token) {
      const err = new Error("missing_token");
      err.status = 401;
      throw err;
    }
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetchImpl(`${baseUrl()}${path}`, { ...init, headers });
    if (!res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      const err = new Error(body?.error || `http_${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  return {
    getHealth: () => request("/api/health"),
    getBriefing: () => request("/api/briefing"),
    listJobs: () => request("/api/jobs"),
    cancelJob: (id) => request(`/api/jobs/${encodeURIComponent(id)}`, { method: "POST" }),
    /**
     * @param {string} preset
     */
    startRun: (preset) => {
      if (!isRunPreset(preset)) {
        return Promise.reject(Object.assign(new Error("invalid_preset"), { status: 400 }));
      }
      return request("/api/run", {
        method: "POST",
        body: JSON.stringify({ preset }),
      });
    },
    getDraft: (id) => request(`/api/drafts/${encodeURIComponent(id)}`),
    setDraftStatus: (id, status) =>
      request(`/api/drafts/${encodeURIComponent(id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
  };
}
