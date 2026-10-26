import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiClient } from "./api.js";
import { createStorage } from "./storage.js";
import { connectJobStream } from "./sse.js";
import { parseTokenInput, sortJobs, upsertJob } from "./viewModels.js";
import { TokenGate } from "./components/TokenGate.jsx";
import { BriefingView } from "./components/BriefingView.jsx";
import { RunBar } from "./components/RunBar.jsx";
import { JobsList } from "./components/JobsList.jsx";
import { DraftReader } from "./components/DraftReader.jsx";

const storage = createStorage();

function readQueryToken() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) return null;
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return parseTokenInput(`https://local/?token=${encodeURIComponent(token)}`);
  } catch {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState(() => storage.getToken());
  const [baseUrl, setBaseUrl] = useState(() => storage.getBaseUrl());
  const [briefing, setBriefing] = useState(() => storage.getLastBriefing());
  const [jobs, setJobs] = useState([]);
  const [preset, setPreset] = useState("full");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [bootError, setBootError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [streamState, setStreamState] = useState("idle");
  const tokenRef = useRef(token);
  const hydratedRef = useRef(false);
  tokenRef.current = token;

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
      }),
    [baseUrl],
  );

  const applyBriefing = useCallback((next) => {
    if (!next || typeof next !== "object") return;
    setBriefing(next);
    storage.setLastBriefing(next);
  }, []);

  const refresh = useCallback(async () => {
    const [b, j] = await Promise.all([api.getBriefing(), api.listJobs()]);
    applyBriefing(b);
    setJobs(sortJobs(Array.isArray(j) ? j : []));
  }, [api, applyBriefing]);

  const connectWithToken = useCallback(
    async ({ token: nextToken, baseUrl: nextBase }) => {
      setAuthBusy(true);
      setBootError("");
      try {
        const client = createApiClient({
          baseUrl: nextBase || baseUrl,
          getToken: () => nextToken,
        });
        await client.getHealth();
        storage.setToken(nextToken);
        if (nextBase) {
          storage.setBaseUrl(nextBase);
          setBaseUrl(nextBase);
        }
        setToken(nextToken);
        const [b, j] = await Promise.all([client.getBriefing(), client.listJobs()]);
        applyBriefing(b);
        setJobs(sortJobs(Array.isArray(j) ? j : []));
        hydratedRef.current = true;
      } catch (err) {
        setBootError(err?.status === 401 ? "Token rejected. Check the PC QR." : "Could not reach Station.");
        throw err;
      } finally {
        setAuthBusy(false);
      }
    },
    [applyBriefing, baseUrl],
  );

  useEffect(() => {
    const fromQuery = readQueryToken();
    if (fromQuery?.token) {
      connectWithToken(fromQuery).catch(() => {});
    }
  }, [connectWithToken]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!token || hydratedRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) hydratedRef.current = true;
      } catch (err) {
        if (!cancelled && err?.status === 401) {
          storage.clearToken();
          setToken("");
          setBootError("Token rejected. Enter it again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  useEffect(() => {
    if (!token || !online) {
      setStreamState("idle");
      return undefined;
    }
    const ac = new AbortController();
    let retryTimer = 0;
    let stopped = false;

    const loop = async () => {
      while (!stopped && !ac.signal.aborted) {
        try {
          setStreamState("live");
          await connectJobStream({
            baseUrl,
            token: tokenRef.current,
            signal: ac.signal,
            onEvent: (event, data) => {
              if (event === "job.updated" && data && typeof data === "object") {
                setJobs((prev) => upsertJob(prev, data));
              }
              if (event === "briefing.ready" && data && typeof data === "object") {
                if (data.headline || data.generatedAt) applyBriefing(data);
                else refresh().catch(() => {});
              }
            },
          });
          if (!stopped) setStreamState("reconnect");
        } catch (err) {
          if (ac.signal.aborted || stopped) return;
          setStreamState("reconnect");
          if (err?.status === 401) {
            storage.clearToken();
            setToken("");
            return;
          }
        }
        await new Promise((resolve) => {
          retryTimer = window.setTimeout(resolve, 2000);
        });
      }
    };
    loop();
    return () => {
      stopped = true;
      ac.abort();
      window.clearTimeout(retryTimer);
    };
  }, [token, online, baseUrl, applyBriefing, refresh]);

  async function handleRun() {
    setRunBusy(true);
    setBootError("");
    try {
      await api.startRun(preset);
      await refresh();
    } catch (err) {
      setBootError(err?.message === "invalid_preset" ? "Unknown preset." : "Run failed.");
    } finally {
      setRunBusy(false);
    }
  }

  async function openDraft(id) {
    setDraftId(id);
    setDraft(null);
    setDraftError("");
    setDraftBusy(true);
    try {
      const row = await api.getDraft(id);
      setDraft(row);
    } catch {
      setDraftError("Could not load draft.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function setDraftStatus(status) {
    if (!draftId) return;
    setDraftBusy(true);
    setDraftError("");
    try {
      await api.setDraftStatus(draftId, status);
      setDraft((prev) =>
        prev ? { ...prev, meta: { ...prev.meta, status } } : prev,
      );
      await refresh();
      if (status === "dismissed") {
        setDraftId(null);
        setDraft(null);
      }
    } catch {
      setDraftError("Could not update draft status.");
    } finally {
      setDraftBusy(false);
    }
  }

  function signOut() {
    storage.clearToken();
    setToken("");
    setJobs([]);
    setDraftId(null);
    setDraft(null);
  }

  if (!token) {
    return (
      <div className="remote-app">
        <TokenGate
          busy={authBusy}
          error={bootError}
          onSave={(parsed) => {
            connectWithToken(parsed).catch(() => {});
          }}
        />
      </div>
    );
  }

  if (draftId) {
    return (
      <div className="remote-app">
        <DraftReader
          draft={draft}
          busy={draftBusy}
          error={draftError || (draftBusy && !draft ? "Loading…" : "")}
          onBack={() => {
            setDraftId(null);
            setDraft(null);
          }}
          onStatus={setDraftStatus}
        />
      </div>
    );
  }

  return (
    <div className="remote-app">
      <header className="remote-brand">
        <h1>Study Hub</h1>
        <p>
          {online ? (streamState === "live" ? "Live" : "Connected") : "Offline"} · Station remote
        </p>
      </header>

      {!online ? (
        <div className="remote-banner" data-tone="warn" role="status">
          Offline — showing last briefing. Run is disabled until you are back on the tailnet.
        </div>
      ) : null}
      {bootError ? (
        <div className="remote-banner" data-tone="danger" role="alert">
          {bootError}
        </div>
      ) : null}

      <BriefingView briefing={briefing} offline={!online} onOpenDraft={openDraft} />
      <JobsList jobs={jobs} onCancel={(id) => api.cancelJob(id).then(refresh).catch(() => {})} />

      <div className="remote-footer-actions">
        <button type="button" className="remote-btn remote-btn-ghost" onClick={signOut}>
          Clear token
        </button>
        <button
          type="button"
          className="remote-btn remote-btn-ghost"
          onClick={() => refresh().catch(() => {})}
          disabled={!online}
        >
          Refresh
        </button>
      </div>

      <RunBar
        preset={preset}
        onPresetChange={setPreset}
        onRun={handleRun}
        disabled={!online}
        running={runBusy}
      />
    </div>
  );
}
