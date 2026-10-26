import { useEffect, useRef } from "react";

const SPEAK_MS_PER_CHAR = 65;

/**
 * When Station emits briefing.ready (via preload onBriefing), Nova speaks the headline
 * through the existing companion greet → say() path.
 */
export function useStationBriefingSpeech() {
  const lastRef = useRef("");

  useEffect(() => {
    const api = window.studyHub?.station;
    if (!api?.onBriefing) return undefined;

    const off = api.onBriefing((briefing) => {
      const headline = typeof briefing?.headline === "string" ? briefing.headline.trim() : "";
      if (!headline || headline === lastRef.current) return;
      lastRef.current = headline;
      window.dispatchEvent(new CustomEvent("studyhub-companion-greet", { detail: { text: headline } }));
      window.dispatchEvent(
        new CustomEvent("studyhub-companion-talk", { detail: { ms: Math.max(2000, headline.length * SPEAK_MS_PER_CHAR) } }),
      );
    });

    return () => {
      if (typeof off === "function") off();
    };
  }, []);
}
