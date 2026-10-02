import { useCallback, useState } from "react";
import { pointBeside, waitForTarget } from "../safeZones.js";
import { nextFrame } from "../layer/geometry.js";
import { ENGAGED_SPEED } from "../layer/constants.js";

/** Help / Ask Nova bubble: open, close, and "show me" (she flies over and points at the answer). */
export function useNovaHelp(core, { setMarks, ensureRoute }) {
  const { modeRef, send, setBubble, setMood, refreshAnchor, later, cancel, flyTo, sizeRef, setFacing, pointAt } = core;
  const [help, setHelp] = useState(null);

  const openHelp = useCallback(
    (answer) => {
      setBubble(null);
      cancel();
      if (send("HELP") !== "help") return false;
      setHelp({ query: "", answer, pointed: false });
      setMood(answer ? "happy" : "thinking");
      refreshAnchor();
      return true;
    },
    [cancel, send, refreshAnchor]
  );

  /** Ask Nova: the message box when one is on screen, otherwise her bubble. */
  const startHelp = useCallback(() => {
    const bar = document.querySelector(".sh-novabar-input");
    if (bar) {
      if (modeRef.current === "menu") send("CLOSE");
      bar.focus();
      return;
    }
    openHelp(null);
  }, [openHelp, send]);

  /** Her answer bubble for a FAQ entry picked in the message box. */
  const openAnswer = useCallback((entry) => openHelp(entry), [openHelp]);

  const closeHelp = useCallback(() => {
    setHelp(null);
    setMarks([]);
    send("CLOSE");
    setMood("neutral");
  }, [send]);

  const showMe = useCallback(
    async (entry) => {
      ensureRoute(entry.route);
      const el = await waitForTarget(entry.pointTo, 3000);
      if (modeRef.current !== "help") return;
      if (!el) {
        setMood("confused");
        setHelp((h) => (h ? { ...h, pointed: true } : h));
        return;
      }
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      await nextFrame();
      const rect = el.getBoundingClientRect();
      const s = sizeRef.current;
      const p = pointBeside(rect, s, "right");
      setHelp((h) => (h ? { ...h, pointed: true } : h));
      const ok = await flyTo(p, { speed: ENGAGED_SPEED });
      if (!ok || modeRef.current !== "help") return;
      setFacing(p.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
      setMood("point");
      pointAt(el.getBoundingClientRect());
      refreshAnchor();
      setMarks([{ key: "help", el, style: null }]);
      later(() => setMarks((list) => list.filter((m) => m.key !== "help")), 2600);
    },
    [ensureRoute, flyTo, setFacing, refreshAnchor, pointAt]
  );

  return { help, setHelp, startHelp, closeHelp, showMe, openAnswer };
}
