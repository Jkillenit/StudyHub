import { useCallback, useEffect, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { buildTodayView } from "./todayView.js";

const RELOAD_EVENTS = ["studyhub-mirror-changed", "studyhub-bb-synced", "studyhub-target-changed", "studyhub-exam-scope-changed"];

/** Loads the Today snapshot and grading scales, and keeps the view fresh when mirror data changes. */
export function useTodayModel(refreshKey = 0) {
  const [state, setState] = useState({ loaded: false, view: null });

  const load = useCallback(async () => {
    const data = await courseStore.loadTodayData();
    const pairs = await Promise.all((data.courses || []).map(async (c) => [c.uuid, await courseStore.getGradingScale(c.uuid)]));
    setState({ loaded: true, view: buildTodayView(data, { scales: Object.fromEntries(pairs) }) });
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = () => void load();
    RELOAD_EVENTS.forEach((name) => window.addEventListener(name, onChange));
    return () => RELOAD_EVENTS.forEach((name) => window.removeEventListener(name, onChange));
  }, [load]);

  return { ...state, reload: load };
}
