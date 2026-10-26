/**
 * Minimal SSE parser for fetch()-based streams (EventSource cannot send Bearer).
 */

/**
 * @param {string} chunk
 * @param {{ event: string, data: string }} buffer
 * @param {(event: string, data: unknown) => void} onEvent
 * @returns {{ event: string, data: string }}
 */
export function feedSse(chunk, buffer, onEvent) {
  const state = buffer || { event: "message", data: "" };
  const parts = String(chunk || "").split(/\r?\n/);
  // If chunk did not end with newline, last piece is incomplete — caller should
  // keep a remainder. We accept full lines only when the chunk includes newlines.
  for (let i = 0; i < parts.length; i += 1) {
    const line = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast && chunk && !/\r?\n$/.test(chunk)) {
      state._rest = (state._rest || "") + line;
      continue;
    }
    const full = (state._rest || "") + line;
    state._rest = "";
    if (full.startsWith("event:")) {
      state.event = full.slice(6).trim() || "message";
    } else if (full.startsWith("data:")) {
      const piece = full.slice(5).trimStart();
      state.data = state.data ? `${state.data}\n${piece}` : piece;
    } else if (full === "") {
      if (state.data !== "") {
        let parsed = state.data;
        try {
          parsed = JSON.parse(state.data);
        } catch {
          // keep raw string
        }
        onEvent(state.event || "message", parsed);
      }
      state.event = "message";
      state.data = "";
    }
  }
  return state;
}

/**
 * Open /api/stream with Authorization and dispatch named events.
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.token
 * @param {(event: string, data: unknown) => void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function connectJobStream(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const base = String(opts.baseUrl || "").replace(/\/$/, "");
  const res = await fetchImpl(`${base}/api/stream`, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "text/event-stream",
    },
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = new Error(`stream_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    throw new Error("stream_unsupported");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = { event: "message", data: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    buffer = feedSse(text, buffer, opts.onEvent);
  }
}
