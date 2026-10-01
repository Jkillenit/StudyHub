import { useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { shortCourse } from "../../features/dashboard/courseLabel.js";
import { SYNC_CLOSE_MS, SYNC_STALE_MS } from "../layer/constants.js";

/** Sync: she opens a portal and pulls the data in; glitches on failure, static offline. */
export function useNovaSync(core, { flashReaction, sfx }) {
  const { stateRef, modeRef, navRef, api, send, setBubble, say, setMood, refreshAnchor, bubbleRef } = core;
  /** Blackboard sync in progress: `{ phase: "open" | "ok" | "fail", step }`, drawn as a portal beside her. */
  const [sync, setSync] = useState(null);
  const syncRef = useRef(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const bb = window.studyHub?.blackboard;
    if (!bb?.onSyncProgress || !bb?.onSyncComplete) return undefined;
    let closeTimer = 0;
    let staleTimer = 0;
    const courseLabel = (uuid) => {
      const c = navRef.current.courses.find((x) => x.uuid === uuid || x.id === uuid);
      return shortCourse(c?.courseCode || c?.code || c?.name) || c?.name || "that course";
    };
    const close = (ms) => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        syncRef.current = null;
        setSync(null);
      }, ms);
    };
    const offProgress = bb.onSyncProgress((p) => {
      const cur = stateRef.current;
      const m = modeRef.current;
      if (!cur?.enabled || cur.quiet || !(AUTONOMOUS.has(m) || m === "sleep")) return;
      if (!syncRef.current) {
        api.current.endActivity?.();
        if (modeRef.current === "sleep") send("WAKE");
        setBubble(null);
      }
      window.clearTimeout(closeTimer);
      window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => close(0), SYNC_STALE_MS);
      syncRef.current = { phase: "open", step: p?.step || null };
      setSync(syncRef.current);
      setMood("thinking");
    });
    const offComplete = bb.onSyncComplete((res) => {
      window.clearTimeout(staleTimer);
      if (!syncRef.current) return;
      if (res?.ok) {
        syncRef.current = { phase: "ok" };
        setSync(syncRef.current);
        setMood("happy");
        close(SYNC_CLOSE_MS);
        return;
      }
      syncRef.current = { phase: "fail" };
      setSync(syncRef.current);
      flashReaction("glitch");
      sfx("glitch");
      setMood("stern");
      close(SYNC_CLOSE_MS + 300);
      const error = String(res?.error || "").trim();
      const course = courseLabel(res?.courseUuid);
      if (stateRef.current?.quiet) return;
      refreshAnchor();
      if (error === "not-logged-in") say(line("syncFailLogin", { course }));
      else if (error) say(line("syncFail", { course, error: error.replace(/\.$/, "") }));
    });
    return () => {
      offProgress?.();
      offComplete?.();
      window.clearTimeout(closeTimer);
      window.clearTimeout(staleTimer);
    };
  }, [send, flashReaction, sfx, refreshAnchor, say]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      const m = modeRef.current;
      if (stateRef.current?.enabled && !stateRef.current?.quiet && AUTONOMOUS.has(m) && !bubbleRef.current) {
        refreshAnchor();
        say(line("offline"));
      }
    };
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshAnchor, say]);

  return { sync, syncRef, offline };
}
