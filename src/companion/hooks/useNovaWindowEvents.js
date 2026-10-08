import { useEffect, useState } from "react";
import { setVoiceLevel } from "../../nova/voice.js";
import { AUTONOMOUS } from "../machine.js";

/** Window-level glue: voice level, settings open requests, greet/talk events, the html dataset, quiet toggles. */
export function useNovaWindowEvents(core, { visibleNow, quiet, onSettingsChange }) {
  const { stateRef, modeRef, reducedRef, setMood, setTalkUntil, busy, playGesture, say } = core;
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void window.studyHub?.desktop?.get?.().then((d) => setVoiceLevel(d?.settings?.level));
  }, []);

  useEffect(() => {
    const open = () => setSettingsOpen((v) => !v);
    window.addEventListener("studyhub-scout-settings", open);
    const offTray = window.studyHub?.desktop?.onOpenSettings?.(() => setSettingsOpen(true));
    return () => {
      window.removeEventListener("studyhub-scout-settings", open);
      offTray?.();
    };
  }, []);

  /* Today's arrival waves her hello and says the day's line; the briefing's voice moves her mouth. */
  useEffect(() => {
    let retry = 0;
    const onGreet = (e) => {
      let tries = 0;
      const attempt = () => {
        if (!visibleNow || stateRef.current?.quiet) return;
        /* She may still be walking to her spot or finishing a line; wait up to ~8s for her. */
        if (!AUTONOMOUS.has(modeRef.current) || busy()) {
          if (++tries < 10) retry = window.setTimeout(attempt, 800);
          return;
        }
        setMood("happy");
        if (!reducedRef.current) playGesture("wave");
        if (e.detail?.text) say(e.detail.text);
      };
      window.clearTimeout(retry);
      attempt();
    };
    const onTalk = (e) => {
      const ms = e.detail?.ms;
      setTalkUntil(ms ? performance.now() + ms : 0);
    };
    window.addEventListener("studyhub-companion-greet", onGreet);
    window.addEventListener("studyhub-companion-talk", onTalk);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("studyhub-companion-greet", onGreet);
      window.removeEventListener("studyhub-companion-talk", onTalk);
    };
  }, [visibleNow, busy, playGesture, say]);

  useEffect(() => {
    document.documentElement.dataset.nova = visibleNow ? "on" : "off";
    document.documentElement.dataset.novaQuiet = quiet ? "on" : "off";
    window.dispatchEvent(new CustomEvent("studyhub-companion-state", { detail: { visible: visibleNow, quiet } }));
  }, [visibleNow, quiet]);

  /* Quiet mode can be flipped from the app Settings panel and from her menu too. */
  useEffect(() => {
    const onQuiet = (e) => onSettingsChange({ quiet: !!e.detail?.quiet });
    window.addEventListener("studyhub-companion-quiet", onQuiet);
    return () => window.removeEventListener("studyhub-companion-quiet", onQuiet);
  }, [onSettingsChange]);

  return { settingsOpen, setSettingsOpen };
}
