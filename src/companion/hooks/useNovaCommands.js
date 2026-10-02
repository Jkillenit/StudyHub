import { useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { shortCourse } from "../../features/dashboard/courseLabel.js";
import { courseStore } from "../../db/courseStore.js";
import { openCourseView } from "../../features/today/courseView.js";
import { playScene } from "../../nova/stage.js";
import { PANEL_LABELS, canPlace, workspace } from "../../nova/workspace.js";
import { NEXT_SCENE, dueBetween } from "../../nova/commands.js";
import { formatPct, neededScores } from "../../features/today/priority.js";
import { arrangeWorkspace } from "../../nova/scenes/arrange.js";
import { today as directorToday } from "../../nova/director.js";
import { sceneFrom } from "../../nova/scenePlayer.js";
import { paletteOpen } from "../../lib/hotkeys.js";

/** Ask Nova: typed commands (see src/nova/commands.js), focus mode and Ctrl+J. */
export function useNovaCommands(core, { startQuiz, startHelp, closeHelp }) {
  const { stateRef, modeRef, navRef, api, send, setBubble, say, setMood, refreshAnchor, later, memory, feelIt, focusRef } = core;
  const focusMinutesRef = useRef(25);

  /** On Full plan first, then (after the route settles) do `fn`. */
  const onToday = (fn) => {
    navRef.current.onGoHub?.("plan");
    later(fn, 300);
  };

  api.current.runCommand = async (cmd) => {
    const nav = navRef.current;
    const reply = (key, vars = {}) => {
      setMood("happy");
      refreshAnchor();
      say(line(key, { name: memory.fact("name")?.name, ...vars }));
    };
    closeHelp();
    switch (cmd.id) {
      case "quiz":
        return startQuiz(cmd.course?.id);
      case "focus":
        return api.current.startFocus(cmd.minutes);
      case "talk":
        if (cmd.key === "sorry") feelIt("apology");
        return reply(`talk.${cmd.key}`);
      case "next":
        return onToday(() => playScene(sceneFrom(NEXT_SCENE, directorToday || {})));
      case "view":
        return nav.onGoHub?.(cmd.view);
      case "open":
        if (!cmd.tab) return nav.onOpenCourse?.(cmd.course.id);
        return openCourseView(nav.onOpenCourse, cmd.course.id, cmd.tab === "deck" ? { item: "qz-deck" } : { tab: cmd.tab });
      case "grades":
        if (cmd.course) return openCourseView(nav.onOpenCourse, cmd.course.id, { tab: "grades" });
        return onToday(() => arrangeWorkspace("grades"));
      case "layout":
        return onToday(() => (cmd.name === "back" ? workspace.putBack() : arrangeWorkspace(cmd.name)));
      case "move":
        if (!canPlace(cmd.panel, cmd.slot)) return reply("cmd.cantMove", { panel: PANEL_LABELS[cmd.panel] });
        return onToday(() => playScene((stage) => stage.movePanel(cmd.panel, cmd.slot)));
      case "due": {
        const list = dueBetween(await courseStore.loadTodayData(), cmd.days, new Date(), cmd.course?.id);
        return reply(list.length > 1 ? "cmd.dueMany" : list.length ? "cmd.dueOne" : "cmd.dueNone", { when: cmd.when, count: list.length, first: list[0] });
      }
      case "need": {
        if (!cmd.course) return reply("cmd.needWhich");
        const data = await courseStore.loadTodayData();
        const course = data?.courses?.find((c) => c.uuid === cmd.course.id);
        const label = shortCourse(cmd.course.courseCode || cmd.course.name) || cmd.course.name;
        const s = course ? neededScores(course) : null;
        const item = cmd.item === "final" ? s?.final : s?.next;
        if (!item) return reply("cmd.needNone", { course: label, item: cmd.item });
        if (item.needed == null) return reply("cmd.needUnknown", { course: label });
        const vars = { course: label, title: item.title, needed: formatPct(item.needed), target: formatPct(s.target) };
        return reply(item.needed <= 0 ? "cmd.needSafe" : item.needed > 100 ? "cmd.needImpossible" : "cmd.need", vars);
      }
      default:
        return undefined;
    }
  };

  /* Focus mode: she goes quiet for N minutes, shows a countdown, and checks in at the end. */
  const [focusUntil, setFocusUntil] = useState(0);
  focusRef.current = focusUntil;
  api.current.startFocus = (minutes) => {
    setFocusUntil(Date.now() + minutes * 60000);
    focusMinutesRef.current = minutes;
    setMood("happy");
    refreshAnchor();
    say(line("cmd.focusStart", { minutes }));
    api.current.backToSpot?.();
  };
  const stopFocus = () => {
    setFocusUntil(0);
    say(line("cmd.focusStop"));
  };
  useEffect(() => {
    if (!focusUntil) return undefined;
    const t = window.setTimeout(() => {
      setFocusUntil(0);
      const minutes = focusMinutesRef.current;
      setMood("excited");
      refreshAnchor();
      say(line("cmd.focusEnd", { minutes }), {
        sticky: true,
        actions: [
          { label: "QUIZ ME", primary: true, onClick: () => startQuiz() },
          { label: `ANOTHER ${minutes}`, onClick: () => api.current.startFocus(minutes) },
          { label: "BREAK", onClick: () => setBubble(null) },
        ],
      });
    }, Math.max(0, focusUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [focusUntil, refreshAnchor, say, startQuiz]);

  /* Ctrl+J or Ctrl+/: Ask Nova from anywhere. */
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key.toLowerCase() !== "j" && e.key !== "/")) return;
      if (document.querySelector(".sh-novabar-input")) return;
      if (!stateRef.current?.enabled || modeRef.current === "hidden" || paletteOpen()) return;
      e.preventDefault();
      if (modeRef.current === "help") closeHelp();
      else {
        if (modeRef.current === "menu") send("CLOSE");
        startHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startHelp, closeHelp, send]);

  return { focusUntil, stopFocus };
}
