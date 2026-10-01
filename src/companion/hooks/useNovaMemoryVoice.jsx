import { useEffect } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { maySpeak } from "../attention.js";
import { clockLabel, dayPart } from "../idleDirector.js";
import { maybeRephrase } from "../memory/rephrase.js";
import { MEMORY_LINES, pickLine } from "../memory/lines.js";
import { NameForm } from "../NameForm.jsx";
import { BirthdayForm, MONTHS, NeverBugForm } from "../OnboardForms.jsx";
import { openCourseView } from "../../features/today/courseView.js";
import { blockedWhen } from "../../features/today/blocked.js";
import { ONBOARD_BEAT_MS } from "../layer/constants.js";

/** What she remembers: getting to know them, the launch line, memory lines and mid-visit news. */
export function useNovaMemoryVoice(core, { startQuiz, startTour, returnHome }) {
  const { stateRef, modeRef, navRef, api, send, setBubble, say, setMood, refreshAnchor, later, memory, update, busy, bubbleRef, sfx, playGesture, openerDoneRef, lastTypingRef, lastStudyRef, quietNow, dragRef } = core;

  /** Asks once what to call them. `intro` is her first-launch hello; `after` runs once they answer or skip. */
  api.current.askName = ({ intro = false, after = null } = {}) => {
    update({ askedName: true });
    const ask = intro ? { text: MEMORY_LINES.introName[0] } : pickLine("askName", {});
    const done = () => {
      if (!stateRef.current?.askedMore) api.current.askMore(after);
      else if (after) after();
      else setBubble(null);
    };
    setMood("happy");
    refreshAnchor();
    say(ask.text, {
      sticky: true,
      form: (
        <NameForm
          onSave={(name) => {
            void memory.remember("name", { name });
            say(pickLine("nameSaved", { name }).text, { sticky: true });
            later(done, ONBOARD_BEAT_MS);
          }}
          onSkip={done}
        />
      ),
    });
  };

  /** The rest of getting to know them: birthday, then what to leave alone. Asked once. */
  api.current.askMore = (after = null) => {
    update({ askedMore: true });
    const finish = () => (after ? after() : setBubble(null));
    const neverBug = () =>
      say(pickLine("askNeverBug", {}).text, {
        sticky: true,
        form: (
          <NeverBugForm
            initial={memory.fact("never_bug")?.intents || []}
            onSave={(intents) => {
              void memory.remember("never_bug", { intents });
              say(pickLine(intents.length ? "neverBugSaved" : "neverBugNone", {}).text, { sticky: true });
              later(finish, ONBOARD_BEAT_MS);
            }}
          />
        ),
      });
    setMood("happy");
    refreshAnchor();
    say(pickLine("askBirthday", {}).text, {
      sticky: true,
      form: (
        <BirthdayForm
          onSave={(b) => {
            void memory.remember("birthday", b);
            say(pickLine("birthdaySaved", { month: MONTHS[b.month - 1], day: b.day }).text, { sticky: true });
            later(neverBug, ONBOARD_BEAT_MS);
          }}
          onSkip={neverBug}
        />
      ),
    });
  };

  api.current.greet = () => {
    openerDoneRef.current = true;
    if (!memory.fact("name")) {
      api.current.askName({ intro: true, after: () => api.current.offerTour({ introduced: true }) });
      return;
    }
    api.current.offerTour();
  };

  api.current.offerTour = ({ introduced = false } = {}) => {
    const name = memory.fact("name")?.name;
    const text = name ? line("tourOffer", { name }) : line(introduced ? "tourOfferAnon" : "firstLaunch");
    say(text, {
      sticky: true,
      actions: [
        { label: "TAKE THE TOUR", primary: true, autoFocus: true, onClick: () => startTour("first-run") },
        {
          label: "MAYBE LATER",
          onClick: () => {
            update({ onboarded: true });
            send("CLOSE");
            say(line("tourSkip"));
          },
        },
        {
          label: "I'VE GOT IT",
          onClick: () => {
            update({ onboarded: true });
            send("CLOSE");
            say(line("dismissed"));
            void returnHome(200);
          },
        },
      ],
    });
  };

  /** On screen, on her own time, nothing else being said, and the student isn't typing or mid-session. */
  const canSpeak = () => {
    const cur = stateRef.current;
    return (
      !!cur?.enabled &&
      AUTONOMOUS.has(modeRef.current) &&
      !busy() &&
      !dragRef.current &&
      !bubbleRef.current &&
      maySpeak({ lastTyping: lastTypingRef.current, lastStudy: lastStudyRef.current, quiet: quietNow(), hidden: document.hidden })
    );
  };

  const waitToSpeak = async (maxMs) => {
    const until = Date.now() + maxMs;
    while (!canSpeak()) {
      if (Date.now() > until || stateRef.current?.quiet) return false;
      await new Promise((r) => window.setTimeout(r, 500));
    }
    return true;
  };

  /** Says a picked memory line (optionally rephrased by Claude), and records it so it won't repeat this week. */
  api.current.speakMemory = async (pick, { actions = null, celebrate = false, waitMs = 6000 } = {}) => {
    if (!pick?.line) return false;
    const text = await maybeRephrase(pick.line.text, pick.vars);
    if (!(await waitToSpeak(waitMs))) return false;
    memory.markSaid(pick.line);
    setMood(celebrate ? "excited" : "happy");
    if (celebrate) {
      sfx("streak");
      playGesture("kiss");
    }
    refreshAnchor();
    say(text, actions ? { actions } : {});
    return true;
  };

  const memoryActions = (pick) => {
    const nav = navRef.current;
    const close = { label: "NOT NOW", onClick: () => setBubble(null) };
    if (pick.action === "quick5") {
      return [{ label: "5 CARDS", primary: true, onClick: () => startQuiz() }, { label: "GOING TO BED", onClick: () => setBubble(null) }];
    }
    if (pick.action === "weakDrill") {
      const course = nav.courses.find((c) => c.id === pick.vars.courseUuid || c.uuid === pick.vars.courseUuid);
      if (!course || !nav.onOpenCourse) return null;
      return [
        {
          label: "DRILL IT",
          primary: true,
          onClick: () => {
            setBubble(null);
            openCourseView(nav.onOpenCourse, course.id, { item: "qz-deck", moduleId: pick.vars.moduleUuid, deckMode: "module" });
          },
        },
        close,
      ];
    }
    return null;
  };

  /** The launch line: the most personal thing she knows, within a few seconds of opening. */
  api.current.sayOpener = async () => {
    try {
      await api.current.openWithMemory();
    } finally {
      openerDoneRef.current = true;
    }
  };
  api.current.openWithMemory = async () => {
    const cur = stateRef.current;
    if (!cur?.enabled || cur.quiet || !cur.onboarded) return;
    await memory.ready();
    if (!stateRef.current?.askedName && !memory.fact("name")) {
      if (await waitToSpeak(6000)) api.current.askName();
      return;
    }
    if (!stateRef.current?.askedMore) {
      if (await waitToSpeak(6000)) api.current.askMore();
      return;
    }
    const pick = await memory.opener({ timeLabel: clockLabel() }).catch(() => null);
    if (!pick) {
      const part = dayPart();
      const chance = part === "late" ? 0.7 : part === "morning" ? 0.4 : 0;
      if (Math.random() < chance && canSpeak()) {
        setMood("happy");
        refreshAnchor();
        say(line(part === "late" ? "lateHello" : "morningHello", { time: clockLabel() }));
      }
      return;
    }
    const ok = await api.current.speakMemory(pick, { actions: memoryActions(pick), celebrate: !!pick.celebrate });
    if (!ok) return;
    if (pick.memoryKey) memory.patchFact(pick.memoryKey, pick.celebrate ? { celebrated: true } : { said: true });
    if (pick.then) {
      const follow = await memory.lineFor(pick.then.trigger, pick.then.vars);
      if (follow) await api.current.speakMemory({ line: follow, vars: pick.then.vars }, { waitMs: 20000 });
    }
  };

  /* Something changed mid-visit (a comeback, a milestone): say it once she's free, or save it for next time. */
  api.current.onMemoryNews = async (news) => {
    if (!openerDoneRef.current || stateRef.current?.quiet) return;
    const item = news.find((n) => n.type === "milestone") || news.find((n) => n.type === "joke_retired") || news.find((n) => n.type === "comeback");
    if (!item) return;
    const [trigger, memoryKey] = {
      milestone: [`milestone.${item.id}`, `milestone:${item.id}`],
      joke_retired: ["jokeRetired", "joke:nemesis"],
      comeback: ["comeback", `comeback:${item.courseUuid}`],
    }[item.type];
    const celebrate = item.type !== "comeback";
    const picked = await memory.lineFor(trigger, item);
    if (!picked) return;
    const ok = await api.current.speakMemory({ line: picked, vars: item }, { celebrate, waitMs: 120000 });
    if (ok) memory.patchFact(memoryKey, item.type === "milestone" ? { celebrated: true } : { said: true });
  };

  /* Blocked days: she says what she moved, or that she'll plan around them. */
  useEffect(() => {
    const onBlocked = async (e) => {
      if (!stateRef.current?.enabled || stateRef.current?.quiet) return;
      const note = await memory.replanFor();
      const picked = note
        ? await memory.lineFor("blockedReplan", note)
        : await memory.lineFor("blockedMarked", { when: blockedWhen(e.detail?.days || []) });
      if (picked) void api.current.speakMemory({ line: picked, vars: note || {} }, { waitMs: 8000 });
    };
    const onForgot = () => {
      if (!stateRef.current?.enabled || stateRef.current?.quiet) return;
      void api.current.speakMemory({ line: pickLine("forgot", {}), vars: {} }, { waitMs: 8000 });
    };
    window.addEventListener("studyhub-companion-blocked", onBlocked);
    window.addEventListener("studyhub-companion-forgot", onForgot);
    return () => {
      window.removeEventListener("studyhub-companion-blocked", onBlocked);
      window.removeEventListener("studyhub-companion-forgot", onForgot);
    };
  }, [memory]);

  return { memoryActions, canSpeak };
}
