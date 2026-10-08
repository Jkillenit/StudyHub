import { useEffect, useRef } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { coversContent, livePlatform, pointBeside, standOn } from "../safeZones.js";
import { nextFrame } from "../layer/geometry.js";
import { ENGAGED_SPEED } from "../layer/constants.js";
import { onScreen } from "../../nova/anchors.js";
import { workspace } from "../../nova/workspace.js";

/** The spoken briefing: what the Stage does with her body and the page, and how scenes start and end. */
export function useNovaBriefing(core, { ensureRoute, setMarks, glanceAtRect, setGlance }) {
  const {
    stateRef,
    modeRef,
    api,
    stageRef,
    send,
    setBubble,
    say,
    setMood,
    refreshAnchor,
    later,
    reducedRef,
    playGesture,
    setTalkUntil,
    cancel,
    flyTo,
    sizeRef,
    posRef,
    platRef,
    awayFromSpotRef,
    setFacing,
    pointAt,
  } = core;
  const focusedRef = useRef(null);
  /** The utterance a scene is speaking aloud, so aborting the scene can silence it. */
  const speakingRef = useRef(null);
  const briefRef = useRef({ token: 0 });

  /** Where to stand for a briefing target: on its panel's top edge above it, else beside it. */
  const briefSpot = (el, rect, s) => {
    const panel = el.closest("[data-perch]");
    const plat = panel ? livePlatform({ el: panel }, s) : null;
    const cx = rect.left + rect.width / 2;
    if (plat) {
      for (const dx of [-0.45, 0.45, 0]) {
        const p = standOn(plat, cx + dx * s, s);
        if (!coversContent(p, s)) return { p, plat };
      }
    }
    return { p: pointBeside(rect, s, "left"), plat: null };
  };

  api.current.briefStart = () => {
    const m = modeRef.current;
    if (!stateRef.current?.enabled || stateRef.current?.quiet || !(AUTONOMOUS.has(m) || m === "sleep")) return;
    cancel();
    setBubble(null);
    if (send("BRIEF") !== "brief") return;
    briefRef.current.token += 1;
    setMood("point");
  };

  const faceToward = (rect) => {
    const s = sizeRef.current;
    setFacing(posRef.current.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
  };

  /* What the Stage does with her body and the page. Rebuilt every render so it sees fresh state. */
  api.current.stageDeps = {
    stop: () => {
      cancel();
      if (speakingRef.current) window.speechSynthesis.cancel();
    },
    walkTo: async (el) => {
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      await nextFrame();
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) return false;
      setBubble(null);
      const s = sizeRef.current;
      const { p, plat } = briefSpot(el, rect, s);
      if (!(await flyTo(p, { speed: ENGAGED_SPEED }))) return false;
      platRef.current = plat;
      faceToward(el.getBoundingClientRect());
      return true;
    },
    lookAt: (el) => (el ? glanceAtRect(el.getBoundingClientRect(), 2500) : setGlance({ x: 0, y: 0, ms: 2500 })),
    pointAt: (el) => {
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) return false;
      faceToward(rect);
      setMood("point");
      pointAt(rect);
      api.current.linkTo(el);
    },
    mark: (key, el, style, note) => setMarks((list) => [...list.filter((m) => m.key !== key), { key, el, style, note }]),
    clearMarks: () => setMarks((list) => (list.length ? [] : list)),
    scrollTo: async (el) => {
      el.scrollIntoView?.({ block: "center", behavior: reducedRef.current ? "auto" : "smooth" });
      await new Promise((r) => window.setTimeout(r, reducedRef.current ? 0 : 450));
    },
    openTab: ensureRoute,
    focus: (el) => {
      api.current.stageDeps.unfocus();
      const panel = el.closest(".sh-arrive") || el;
      panel.dataset.novaFocus = "";
      document.body.dataset.novaFocusing = "";
      focusedRef.current = panel;
    },
    unfocus: () => {
      if (focusedRef.current) delete focusedRef.current.dataset.novaFocus;
      focusedRef.current = null;
      delete document.body.dataset.novaFocusing;
    },
    say: (text, { speak = false } = {}) => {
      refreshAnchor();
      say(text);
      if (!speak || !("speechSynthesis" in window)) return undefined;
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.onstart = () => setTalkUntil(performance.now() + 60 * 1000);
        u.onend = u.onerror = () => {
          if (speakingRef.current === u) speakingRef.current = null;
          setTalkUntil(0);
          resolve();
        };
        speakingRef.current = u;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      });
    },
    line,
    mood: setMood,
    gesture: (name) => playGesture(name),
    layout: () => workspace.get().layout,
    place: workspace.place,
    remember: workspace.remember,
    /* Using a panel = typing in it or having one of its popovers open. Hover and focus alone don't count (focus lingers after clicks). */
    inUse: (el) => {
      const a = document.activeElement;
      const typing = el.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
      return typing || !!el.querySelector('[aria-expanded="true"]');
    },
  };

  /** Run a Stage scene: she stops what she's doing, performs it, then heads back. Any input cuts it short. False if she can't start. */
  api.current.playScene = (scene) => {
    api.current.briefStart();
    if (modeRef.current !== "brief") return false;
    void stageRef.current.run(scene).then((done) => api.current.briefEnd({ now: !done }));
    return true;
  };

  /** End of the briefing (or cut short by input): back to her spot, full size at home. */
  api.current.briefEnd = ({ now = false } = {}) => {
    if (modeRef.current !== "brief") return;
    const token = ++briefRef.current.token;
    const finish = () => {
      if (modeRef.current !== "brief" || briefRef.current.token !== token) return;
      cancel();
      send("END");
      setMood("neutral");
      awayFromSpotRef.current = true;
      api.current.backToSpot?.();
    };
    if (now) finish();
    else later(finish, 1200);
  };

  useEffect(() => {
    const onScene = (e) => {
      const d = e.detail;
      if (typeof d?.scene === "function") d.handled = api.current.playScene(d.scene);
    };
    const stage = stageRef.current;
    window.addEventListener("studyhub-companion-scene", onScene);
    return () => {
      window.removeEventListener("studyhub-companion-scene", onScene);
      stage.abort();
    };
  }, []);
}
