import { useEffect, useRef } from "react";
import { AUTONOMOUS } from "../machine.js";
import { mayAct, maySpeak } from "../attention.js";
import { dayPart } from "../idleDirector.js";
import { callbackFor } from "../memory/derive.js";
import { setVoiceTone } from "../../nova/voice.js";
import { INTENTS, choose, events as directorEvents, onWake, ran, take, timing, today as directorToday } from "../../nova/director.js";
import { current, rapportTier, tierAtLeast, tone as moodTone } from "../../nova/mood.js";
import { sceneFrom } from "../../nova/scenePlayer.js";
import { DIRECTOR_TICK_MS, EPISODE_GRADE_JUMP } from "../layer/constants.js";

/** The Director: every tick it picks what she does on her own next (see src/nova/director.js). */
export function useNovaDirector(core, { dueNow, memoryActions, syncRef }) {
  const { stateRef, modeRef, navRef, api, memory, feelIt, startedRef, openerDoneRef, lastInputRef, lastStudyRef, lastTypingRef, quietNow } = core;
  /** The gauge under the pointer and since when; hovering one long enough is a question. */
  const hoverRef = useRef({ anchor: null, since: 0 });
  useEffect(() => {
    const onOver = (e) => {
      const anchor = e.target.closest?.('[data-nova-anchor$=".gauge"]')?.dataset.novaAnchor || null;
      if (anchor !== hoverRef.current.anchor) hoverRef.current = { anchor, since: Date.now() };
    };
    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, []);

  api.current.directorTick = () => {
    const cur = stateRef.current;
    if (!cur?.enabled || !startedRef.current || !openerDoneRef.current) return;
    const now = Date.now();
    setVoiceTone(moodTone(cur.feelings, now));
    const onToday = !!navRef.current.stageActive;
    const lastInput = lastInputRef.current;
    const lastStudy = lastStudyRef.current;
    const idle = mayAct({ lastInput, lastStudy, now });
    const hover = { anchor: hoverRef.current.anchor, ms: now - hoverRef.current.since };
    const feelings = current(cur.feelings, now);
    const tier = rapportTier(feelings.rapport).id;
    const bday = memory.fact("birthday");
    const today = new Date(now);
    const ctx = {
      skip: new Set(memory.fact("never_bug")?.intents || []),
      birthday: !!bday && bday.month === today.getMonth() + 1 && bday.day === today.getDate(),
      callback: idle ? callbackFor(memory.snapshot(), { allowed: (min) => tierAtLeast(tier, min), now: today }) : null,
      blocked: quietNow() || document.hidden || !!syncRef.current || !AUTONOMOUS.has(modeRef.current),
      typing: !maySpeak({ lastTyping: lastTypingRef.current, lastStudy, now }),
      idle,
      feelings,
      events: directorEvents,
      onToday,
      today: directorToday,
      part: dayPart(),
      hover,
      gauge: onToday && hover.anchor ? directorToday?.courses?.find((c) => `course.${c.uuid}.gauge` === hover.anchor) || null : null,
      due: idle ? dueNow() : null,
    };
    const it = choose(INTENTS, ctx, timing, now);
    if (!it) return;
    ran(it, now);
    if (it.id === "dueCards") void api.current.nudgeDue(ctx.due);
    else if (it.id === "briefingOffer") api.current.offerBriefing();
    else if (it.id === "birthday") void api.current.sayMemoryLine("birthday", { name: memory.fact("name")?.name }, { celebrate: true });
    else if (it.id === "callback") void api.current.sayCallback(ctx.callback);
    else if (it.id === "gradeMoved") {
      const grade = directorEvents.find((e) => e.type === "grade");
      if (!api.current.playScene(sceneFrom(it, { ...ctx, grade }))) return;
      take("grade");
      feelIt(grade.up ? "gradeUp" : "gradeDown");
      if (grade.up && grade.to - grade.from >= EPISODE_GRADE_JUMP) {
        memory.record("episode:grade_up", { course: grade.course, fromPct: grade.from.toFixed(1), toPct: grade.pct, at: new Date(now).toISOString(), refs: 0, lastRef: null });
      }
    } else {
      if (it.id === "explainGauge") hoverRef.current = { anchor: null, since: now };
      api.current.playScene(sceneFrom(it, ctx));
    }
  };

  api.current.sayMemoryLine = async (trigger, vars, opts = {}) => {
    const picked = await memory.lineFor(trigger, vars);
    return picked ? api.current.speakMemory({ line: picked, vars }, opts) : false;
  };

  /** "Remember when...": one episode or running joke, then it rests for a while. */
  api.current.sayCallback = async (cb) => {
    const pick = { line: await memory.lineFor(`callback.${cb.kind}`, cb.vars), vars: cb.vars, action: cb.kind === "nemesis" ? "weakDrill" : null };
    if (!(await api.current.speakMemory(pick, { actions: memoryActions(pick) }))) return;
    memory.patchFact(cb.key, { refs: (cb.vars.refs || 0) + 1, lastRef: new Date().toISOString() });
  };

  useEffect(() => {
    const tick = () => api.current.directorTick();
    const id = window.setInterval(tick, DIRECTOR_TICK_MS);
    const off = onWake(tick);
    return () => {
      window.clearInterval(id);
      off();
    };
  }, []);
}
