import { useCallback, useEffect, useRef, useState } from "react";
import { line, finishKey } from "../character.js";
import { levelForXp, unlockedTints, isRampant, xpFor, isStudyAward } from "../companionStore.js";
import { localDateString } from "../../study/sm2.js";
import { STUDY_EVENT } from "../studyEvents.js";
import { AUTONOMOUS } from "../machine.js";
import { rand } from "../layer/geometry.js";
import { RAMPANT_MUTTER_MS, XP_POP_MS } from "../layer/constants.js";

/** XP (the one place it's granted, with +XP pops), study events from the rest of the app, and rampancy. */
export function useNovaStudyEvents(core, { cstate, now, enabled, flashReaction }) {
  const { stateRef, modeRef, api, send, say, setMood, refreshAnchor, later, feelIt, playGesture, update, sfx, lastStudyRef, canAct } = core;
  const [pops, setPops] = useState([]);
  const popIdRef = useRef(0);
  const drillRef = useRef({ known: 0, missed: 0 });

  const pushPop = useCallback((text) => {
    popIdRef.current += 1;
    const id = popIdRef.current;
    setPops((list) => [...list.slice(-2), { id, text }]);
    later(() => setPops((list) => list.filter((p) => p.id !== id)), XP_POP_MS);
  }, []);

  /**
   * The one place XP is granted. Adds the daily bonus to the first study award of the day,
   * counts studying against rampancy, and (when `announce`) lets Nova react to level-ups.
   */
  const awardXp = useCallback(
    (parts, { announce = true } = {}) => {
      const cur = stateRef.current;
      if (!cur) return null;
      const today = localDateString();
      const studied = isStudyAward(parts);
      const daily = studied && cur.lastDailyOn !== today;
      const all = daily ? [...parts, ["daily", 1]] : parts;
      const xpGained = xpFor(all);
      if (!xpGained) return null;
      const before = levelForXp(cur.xp || 0);
      const level = levelForXp((cur.xp || 0) + xpGained);
      const prev = new Set(unlockedTints(cur.xp || 0).map((t) => t.id));
      const unlocked = unlockedTints((cur.xp || 0) + xpGained).find((t) => !prev.has(t.id))?.label || null;
      const wasRampant = isRampant(cur);
      update((s) => ({
        xp: (s.xp || 0) + xpGained,
        ...(studied ? { lastStudyAt: new Date().toISOString(), lastDailyOn: today, ignored: 0 } : {}),
      }));
      if (cur.enabled) pushPop(`+${xpGained} XP`);
      const leveledUp = level > before;
      let spoke = false;
      if (announce && studied && wasRampant) {
        setMood("happy");
        say(line("rampantRecover"));
        spoke = true;
      } else if (announce && leveledUp) {
        setMood("excited");
        sfx("streak");
        playGesture("kiss");
        say(line(unlocked ? "levelUnlock" : "levelUp", { level, tint: unlocked?.toLowerCase() }));
        spoke = true;
      }
      return { xpGained, level, leveledUp, unlocked, daily, spoke };
    },
    [update, pushPop, say, sfx, playGesture]
  );

  /* Drill cards and practice tests elsewhere in the app: XP, plus the odd comment. */
  useEffect(() => {
    const onStudy = (e) => {
      const d = e.detail || {};
      const m = modeRef.current;
      const canTalk = !!stateRef.current?.enabled && (AUTONOMOUS.has(m) || m === "sleep");
      if (canTalk && m === "sleep") send("WAKE");
      if (canTalk) api.current.backToSpot?.();
      if (d.type === "card") {
        /* Mid-drill she stays put and silent: XP pops and her expression only. */
        lastStudyRef.current = Date.now();
        const r = drillRef.current;
        if (d.correct) {
          r.known += 1;
          r.missed = 0;
        } else {
          r.missed += 1;
          r.known = 0;
        }
        awardXp([[d.correct ? "cardKnown" : "cardAgain", 1]], { announce: false });
        feelIt(d.correct ? "cardRight" : "cardWrong");
        if (!canTalk) return;
        if (d.correct && r.known % 5 === 0) setMood("excited");
        else if (!d.correct && r.missed === 3) setMood("stern");
        return;
      }
      if (d.type === "test" && d.total) {
        const res = awardXp([["testCorrect", d.correct], ["testDone", 1]], { announce: canTalk });
        feelIt("testDone");
        if (!canTalk || res?.spoke) return;
        const tier = finishKey(d.correct, d.total);
        setMood({ finishedGreat: "excited", finishedGood: "happy", finishedMeh: "neutral", finishedBad: "stern" }[tier]);
        if (tier === "finishedBad") {
          flashReaction("glitch");
          playGesture("facepalm");
        } else if (tier === "finishedGreat") {
          playGesture("kiss");
        }
        say(line(tier, { correct: d.correct, total: d.total }));
      }
    };
    window.addEventListener(STUDY_EVENT, onStudy);
    return () => window.removeEventListener(STUDY_EVENT, onStudy);
  }, [awardXp, say, sfx, flashReaction, send, playGesture, feelIt]);

  /* Rampant: now and then she mutters and glitches while idle. */
  const rampantNow = !!cstate && isRampant(cstate, now);
  useEffect(() => {
    if (!rampantNow || !enabled) {
      delete document.documentElement.dataset.novaRampant;
      return undefined;
    }
    document.documentElement.dataset.novaRampant = "";
    let timer = 0;
    const schedule = (ms) => {
      timer = window.setTimeout(tick, ms);
    };
    const tick = () => {
      const m = modeRef.current;
      if ((m === "idle" || m === "perch") && canAct()) {
        setMood("stern");
        flashReaction("glitch");
        sfx("glitch");
        refreshAnchor();
        say(line("rampant"));
      }
      schedule(rand(RAMPANT_MUTTER_MS));
    };
    schedule(20000);
    return () => {
      window.clearTimeout(timer);
      delete document.documentElement.dataset.novaRampant;
    };
  }, [rampantNow, enabled, canAct, flashReaction, sfx, refreshAnchor, say]);

  return { awardXp, pops, rampantNow };
}
