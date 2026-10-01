import { useEffect, useRef } from "react";
import { line } from "../character.js";
import { isRampant } from "../companionStore.js";
import { getDueCards } from "../../study/sm2.js";
import { loadFlashcardDeck } from "../../study/flashcards/flashcardPersistence.js";
import { shortCourse } from "../../features/dashboard/courseLabel.js";
import { pointBeside } from "../safeZones.js";
import { snooze, today as directorToday } from "../../nova/director.js";
import { sceneFrom } from "../../nova/scenePlayer.js";
import briefingScene from "../../nova/scenes/briefing.json";
import { builtinCourse } from "../layer/geometry.js";
import { BUILTIN_ID, BUILTIN_NAME, NUDGE_COOLDOWN_MS, NUDGE_FIRST_MS, NUDGE_MAX_PER_SESSION, NUDGE_SHOW_MS } from "../layer/constants.js";

/** Nudges: due-card reminders and the morning briefing offer, both started by the Director. */
export function useNovaNudges(core, { mode, flashReaction, startQuiz }) {
  const { stateRef, modeRef, navRef, api, send, setBubble, say, setMood, refreshAnchor, feelIt, playGesture, update, cancel, flyTo, sizeRef, awayFromSpotRef, sfx } = core;
  const nudgeRef = useRef({ mountedAt: Date.now(), last: 0, cooldown: NUDGE_COOLDOWN_MS, count: 0 });

  /** The course with the most due cards, while due-card nudges are allowed this session. */
  const dueNow = () => {
    const cur = stateRef.current;
    const n = nudgeRef.current;
    if (!cur.nudges || !cur.onboarded || n.count >= NUDGE_MAX_PER_SESSION || Date.now() - n.mountedAt < NUDGE_FIRST_MS) return null;
    const best = [...navRef.current.courses, builtinCourse(loadFlashcardDeck())]
      .map((c) => ({ c, count: getDueCards(c.flashcards || []).length }))
      .sort((a, b) => b.count - a.count)[0];
    return best?.count ? best : null;
  };

  /* Due-card nudges (the Director's dueCards intent): rare, polite, and they back off when dismissed. */
  api.current.nudgeDue = async (best) => {
    const cur = stateRef.current;
    const n = nudgeRef.current;
    n.count += 1;
    n.kind = "due";
    cancel();
    if (send("NUDGE") !== "nudge") return;
    const spot = document.querySelector('[data-tour-id="today-cards"]');
    if (spot) {
      const r = spot.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < window.innerHeight) {
        awayFromSpotRef.current = true;
        await flyTo(pointBeside(r, sizeRef.current, "right"), { speed: 200 });
        if (modeRef.current !== "nudge") return;
      }
    }
    const rampant = isRampant(cur);
    setMood(rampant ? "stern" : "happy");
    if (rampant) {
      flashReaction("glitch");
      sfx("glitch");
    }
    refreshAnchor();
    n.answered = false;
    const course = best.c.id === BUILTIN_ID ? BUILTIN_NAME : shortCourse(best.c.courseCode || best.c.name) || best.c.name;
    say(line(rampant ? "dueRampant" : "due", { count: best.count, course }), {
      sticky: true,
      nudge: true,
      actions: [
        {
          label: "QUIZ ME",
          primary: true,
          onClick: () => {
            n.answered = true;
            feelIt("nudgeTaken");
            startQuiz(best.c.id);
          },
        },
        {
          label: "NOT NOW",
          onClick: () => {
            n.answered = true;
            n.cooldown *= 2;
            snooze("dueCards", n.cooldown);
            update((s) => ({ ignored: (s.ignored || 0) + 1 }));
            feelIt("nudgeDismissed");
            send("CLOSE");
            setMood("neutral");
            say(line("dismissed"));
          },
        },
      ],
    });
  };

  /* The Director's briefingOffer intent: a morning "want the rundown?" that plays the briefing scene. */
  api.current.offerBriefing = () => {
    const n = nudgeRef.current;
    n.kind = "briefing";
    n.answered = false;
    cancel();
    if (send("NUDGE") !== "nudge") return;
    setMood("happy");
    refreshAnchor();
    say(line("briefingOffer"), {
      sticky: true,
      nudge: true,
      actions: [
        {
          label: "BRIEF ME",
          primary: true,
          onClick: () => {
            n.answered = true;
            send("CLOSE");
            setBubble(null);
            api.current.playScene(sceneFrom(briefingScene, directorToday || {}));
          },
        },
        {
          label: "LATER",
          onClick: () => {
            n.answered = true;
            send("CLOSE");
            setMood("neutral");
            setBubble(null);
          },
        },
      ],
    });
  };

  useEffect(() => {
    if (mode !== "nudge") return undefined;
    const t = window.setTimeout(() => {
      if (modeRef.current !== "nudge") return;
      send("CLOSE");
      setMood("neutral");
      if (!nudgeRef.current.answered && nudgeRef.current.kind === "due") {
        update((s) => ({ ignored: (s.ignored || 0) + 1 }));
        feelIt("nudgeIgnored");
        say(line("ignoredNudge"));
        playGesture("taunt");
      } else {
        setBubble(null);
      }
    }, NUDGE_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [mode, send, update, say, playGesture, feelIt]);

  return { dueNow };
}
