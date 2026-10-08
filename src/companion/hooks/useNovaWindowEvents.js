import { useEffect, useState } from "react";
import { setVoiceLevel } from "../../nova/voice.js";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { GREET_POINT_DELAY_MS } from "../layer/constants.js";

/** Window-level glue: voice level, settings open requests, greet/talk events, the html dataset, quiet toggles. */
export function useNovaWindowEvents(core, { visibleNow, quiet, onSettingsChange }) {
  const { api, stateRef, modeRef, reducedRef, setMood, setTalkUntil, busy, playGesture, pointAt, say, later, quietNow } = core;
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

  /* Today's arrival gathers her out of the field (once a day), then she waves hello and says the day's line; the briefing's voice moves her mouth. */
  useEffect(() => {
    let retry = 0;
    const onGreet = (e) => {
      let tries = 0;
      api.current.arrive?.();
      const attempt = () => {
        if (!visibleNow || stateRef.current?.quiet) return;
        /* She may still be walking to her spot or finishing a line; wait up to ~8s for her. */
        if (!AUTONOMOUS.has(modeRef.current) || busy()) {
          if (++tries < 10) retry = window.setTimeout(attempt, 800);
          return;
        }
        setMood("happy");
        if (!reducedRef.current) playGesture("wave");
        if (!e.detail?.text) return;
        say(e.detail.text);
        /* The day's line is about the top item: she points at it once the wave is done. */
        later(() => {
          const top = document.querySelector('[data-nova-anchor="home.row.1"]');
          if (!top || !AUTONOMOUS.has(modeRef.current) || busy()) return;
          pointAt(top.getBoundingClientRect());
          api.current.linkTo(top);
        }, reducedRef.current ? 0 : GREET_POINT_DELAY_MS);
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
  }, [visibleNow, busy, playGesture, pointAt, say, later]);

  /* A Today row she was showing is done (HomeScreen streams it into her): she's proud of it. */
  useEffect(() => {
    const onDone = (e) => {
      if (!visibleNow || quietNow() || !AUTONOMOUS.has(modeRef.current) || busy()) return;
      setMood("happy");
      if (!reducedRef.current) playGesture("wink");
      say(line("home.taskDone", { title: e.detail?.title }));
    };
    window.addEventListener("studyhub-companion-task-done", onDone);
    return () => window.removeEventListener("studyhub-companion-task-done", onDone);
  }, [visibleNow, busy, playGesture, say, quietNow]);

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
