import { useEffect, useRef } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { maybeRephrase } from "../memory/rephrase.js";
import { EXAM_SESSION_EVENT } from "../../session/examSession.js";

const MOOD = {
  examOpen: "happy",
  examOpenTomorrow: "stern",
  examOpenToday: "stern",
  examNoCards: "neutral",
  examEndUp: "happy",
  examEndFlat: "neutral",
  examEndReady: "excited",
};

/**
 * Exam sessions announce their start and end ({ phase, key, vars }); she says the line from her lane.
 * Claude may rephrase it (numbers must survive), and a newer event supersedes a pending one.
 */
export function useNovaExamSession(core) {
  const { stateRef, modeRef, send, say, setMood, refreshAnchor, playGesture, quietNow } = core;
  const quietRef = useRef(quietNow);
  quietRef.current = quietNow;

  useEffect(() => {
    let latest = 0;
    const onExam = async (e) => {
      const { key, vars = {} } = e.detail || {};
      if (!key || !stateRef.current?.enabled || quietRef.current()) return;
      const text = line(key, vars);
      if (!text) return;
      const id = ++latest;
      const said = await maybeRephrase(text, vars);
      const m = modeRef.current;
      if (id !== latest || !stateRef.current?.enabled || !(AUTONOMOUS.has(m) || m === "sleep")) return;
      if (m === "sleep") send("WAKE");
      setMood(MOOD[key] || "neutral");
      if (key === "examEndReady") playGesture("kiss");
      refreshAnchor();
      say(said);
    };
    window.addEventListener(EXAM_SESSION_EVENT, onExam);
    return () => window.removeEventListener(EXAM_SESSION_EVENT, onExam);
  }, [stateRef, modeRef, send, say, setMood, refreshAnchor, playGesture]);
}
