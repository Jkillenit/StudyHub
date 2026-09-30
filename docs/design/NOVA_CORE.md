# Study Hub: Nova Core

## The new vision

**Nova is the app. Study Hub is her home.**

Nova is a program who lives in a workstation. The workstation is the app: panels,
screens, her desk, her stuff. She arranges it for you, pulls things up, points at
what she's talking about, runs your quizzes, and knows your semester better than you do.

The goal is an illusion: the student should feel like they have a tutor and a friend
who is alive. Every part of that illusion is built with normal code. **No AI is required
for any of it.** An optional API key "enhances" her (free conversation, richer lines),
but scripted Nova must be complete on her own.

Related docs still apply:
- `COMPANION_CHECKLIST.md`: voice, line library, idle life, study sessions, leveling
- `DESKTOP_NOVA.md`: her life outside the app
- `DESIGN_TODAY.md`: visual tokens and look

This doc defines the core systems everything else runs on. Build in the phases at the
bottom. Propose a plan for each phase and wait for approval. Stop for review after each.

---

## Principles

1. **She drives, the workspace shows.** She talks briefly and puts things on screen.
   Never a paragraph when a panel can show it.
2. **Every line of hers comes from real data.** Scripted or enhanced, numbers and facts
   come from the database through code, never made up.
3. **She is never idle in a dead way.** When you open the app she's already doing something.
4. **She is consistent.** Same opinions, same running jokes, same memory of you, every day.
5. **She never repeats herself robotically.** Variety, cooldowns, callbacks.
6. **She reacts to you.** What you click, how long you're gone, what time it is, how you're doing.
7. **The user is still in charge.** Anything she does, they can undo or do themselves.

---

## System overview

```
          Event Bus  ◀── user input, timers, sync, grades, quiz answers, window/OS events
              │
              ▼
          Director  (the "brain": picks what Nova does next)
          │   │   │
   Mood ──┘   │   └── Memory (facts, episodes, running jokes, rapport)
              ▼
        Scene Player  (runs choreography: move, say, point, open, wait)
          │        │
          ▼        ▼
     Stage API    Voice System (line library + templates)
   (controls the      │
    workspace)        ▼
          │       Speech bubble / voice
          ▼
     Workspace  (panels, anchors, layouts, her desk)

   Command Bar ──▶ intent matcher ──▶ Director      (no AI)
   Enhanced mode: LLM ──▶ same actions + same Stage API (optional)
```

---

## 1. Stage API (how she controls her home)

The single interface Nova uses to touch the UI. Scripts, the Director, the command bar,
and enhanced mode all call these same functions. Nothing else moves panels on her behalf.

**Anchors**
- [ ] Every thing she might talk about registers an anchor: `data-nova-anchor="tonight.item.1"`,
      `"course.mis430.gauge"`, `"grades.row.<uuid>"`, `"deck.chapter6"`, `"nav.calendar"`, etc.
- [ ] An anchor registry (renderer) tracks each anchor's live screen rect and whether it's visible.
- [ ] Anchor naming convention documented in one place so scripts stay readable.

**Actions** (all return promises so scenes can await them)

| Action | What it does |
|---|---|
| `walkTo(anchor)` | She walks to the anchor. Long distances: she dissolves and reappears (hologram blink) instead of walking. |
| `lookAt(anchor \| 'user')` | Gaze and head turn. |
| `pointAt(anchor)` | Points; a thin light beam runs from her hand to the element. |
| `highlight(anchor, style)` | Pulsing outline, glow, or underline on the element. Styles: `pulse`, `glow`, `underline`, `warn`, `danger`. |
| `clearHighlights()` | |
| `openPanel(id, opts)` | She grabs a panel from off screen / her desk and places it. |
| `closePanel(id)` | She swipes it away or files it back on her desk. |
| `movePanel(id, slot)` | She drags a panel by its edge to a new slot. |
| `resizePanel(id, size)` | |
| `arrange(layoutName)` | Rearranges several panels in sequence (she moves them one by one, not all at once). |
| `focusPanel(id)` | Pulls one panel forward, dims and pushes everything else back, she sits beside it. |
| `unfocus()` | |
| `scrollTo(anchor)` | Scrolls inside a panel to an item, then highlights it. |
| `openTab(route)` | Switches the workspace to another view. She "carries" you there (walks to the nav item, taps it). |
| `pinNote(anchor, text)` | Sticks a small holographic note on an element (e.g., "you need 84 here"). |
| `say(lineKey, vars)` | Speaks a line through the Voice System. |
| `emote(name)` | Plays an animation: nod, shrug, facepalm, laugh, celebrate, sigh, smug, think. |
| `wait(ms \| 'input' \| 'click:anchor')` | Pauses the scene. |

**Rules**
- [ ] She physically performs panel moves (grab edge, drag, release) with short animations,
      then the layout state updates. Use the existing animation approach in the codebase;
      layout animations (e.g., Framer Motion `layout`) are a good fit if nothing exists.
- [ ] If the user is actively using a panel, she never moves it. She asks or waits.
- [ ] Every Stage action is undoable by the user; one "Put it back" undoes her last arrangement.

---

## 2. Workspace as her home

**Panels as holographic screens**
- [ ] Panels are free floating screens in a layout system with named slots
      (`center`, `left`, `right`, `dock`, `desk`), not fixed routes only.
- [ ] Panel types: Today, Course, Deck/Quiz, Grades/What if, Calendar, Notes, Syllabus,
      Blackboard item, Focus timer, Trophy shelf, Her desk.

**Named layouts** she uses and announces
- [ ] `briefing`: Today center, her beside it
- [ ] `study`: Deck center, notes right, timer dock
- [ ] `exam_prep`: exam countdown, weak topics, deck, needed score
- [ ] `grades`: standing gauges plus what if
- [ ] `writing`: task, rubric/instructions, notes (for cases and papers)
- [ ] `tidy`: everything filed back on her desk
- [ ] The user can save their own layout; she learns it and uses it ("Fine. Your way.").

**Her desk (her space)**
- [ ] A corner of the workspace that is hers: a desk surface where closed panels are filed as small cards,
      her trophy shelf, the doodles she's kept, and a few personal objects.
- [ ] **Her space evolves.** Objects accumulate over time from real events: a trophy per exam won,
      a framed "first A," a sticky note from a running joke, a calendar with drill weekends marked.
      Nothing resets. Coming back after a semester, her desk tells the story.
- [ ] She keeps it tidy when you're away (arranges it differently each time).

**Comfort and life in the room**
- [ ] Ambient: faint grid, soft light from her glow, slow particles. Brighter when she's happy,
      dimmer late at night.
- [ ] She sits, leans, lies on the desk, dangles her legs off panels. She should look like she lives there.

---

## 3. Director (the brain, no AI)

A rules based decision system (utility scoring) that decides what Nova does next.

**Loop**
- [ ] Runs on events and on a slow tick (every 2 to 5 seconds while the app is visible).
- [ ] Builds a context snapshot: time of day, idle time, current view, what the user is doing,
      pending events (grade posted, sync done), mood, memory, cooldowns, today's plan.
- [ ] Scores a list of **intents**, picks the highest above a threshold, runs its scene.
      Nothing above threshold = continue current idle behavior.

**Intents** (each has: conditions, score function, cooldown, scene)
- Greet on open (varies by time since last visit, time of day)
- Morning / evening briefing
- React to new grade, announcement, assignment
- Suggest next task (from priority engine)
- Offer a targeted quiz (weak topic, upcoming exam)
- Nudge overdue item
- Celebrate milestone
- Comment on what the user is looking at (they hovered a gauge for 3+ seconds → she explains it)
- Tidy the workspace
- Idle life stages
- Late night check (serious mode)
- Callback to a running joke
- Reaction to user behavior (click spam, resized window, left mid sentence, fast scrolling)

**Interrupt rules**
- [ ] Priority tiers: `critical` (due in 30 min, grade posted) > `reactive` (user did something)
      > `proactive` (suggestions) > `ambient` (idle).
- [ ] Never interrupt the user mid task with proactive or ambient intents.
- [ ] Proactive lines capped (e.g., one per 10 minutes) so she doesn't nag.

**Anticipation** (a big part of feeling alive)
- [ ] If the user hovers a course for a while, she starts walking to it before they click.
- [ ] If they open a deck for an exam, she's already pulled up the needed score beside it.
- [ ] When they return after a break, she picks up exactly where they left off:
      "You were on card 14 of Chapter 6. Want to finish?"

---

## 4. Scene Player (choreography)

Scenes are data, not code, so new behaviors can be written without touching the engine.

**Format** (JSON or JS objects in `src/nova/scenes/`)
```json
{
  "id": "briefing.morning",
  "priority": "proactive",
  "cooldown": "20h",
  "when": { "timeOfDay": "morning", "firstOpenToday": true },
  "steps": [
    { "do": "arrange", "layout": "briefing" },
    { "do": "say", "line": "briefing.opener" },
    { "do": "walkTo", "anchor": "tonight.item.1" },
    { "do": "pointAt", "anchor": "tonight.item.1" },
    { "do": "highlight", "anchor": "tonight.item.1", "style": "glow" },
    { "do": "say", "line": "briefing.top_task", "vars": ["task.title", "task.due", "task.weight"] },
    { "if": "course.belowTarget", "then": [
      { "do": "walkTo", "anchor": "course.{course.id}.gauge" },
      { "do": "say", "line": "briefing.risk", "vars": ["course.name", "course.grade", "course.needed"] }
    ]},
    { "do": "lookAt", "target": "user" },
    { "do": "say", "line": "briefing.closer" },
    { "do": "wait", "for": "input", "timeout": "30s" },
    { "do": "clearHighlights" }
  ]
}
```
- [ ] Supports: sequence, `if`/`else` on context values, `choose` (random weighted branch),
      `parallel` (walk while talking), `wait`, and `interruptible` flags per step.
- [ ] If the user clicks or types during a scene, the scene ends gracefully
      (she stops, glances at what they did, maybe a short line).
- [ ] Scenes can be triggered by the Director, the command bar, other scenes, or enhanced mode.

---

## 5. Voice System (sounding alive without AI)

- [ ] **Line library** keyed by trigger, in data files. Each entry: variants, conditions
      (mood, rapport tier, time, language level), cooldown, and variables.
- [ ] **Template grammar** (Tracery style): lines built from interchangeable parts so the same
      moment rarely produces the same sentence. Example:
      `"#opener# #task# is due #when#. #push#"` with pools for each piece.
- [ ] **No repeats:** track recently used lines; a line can't repeat within a configurable window.
- [ ] **Variables** filled from the database and memory only: `{course.name}`, `{grade}`,
      `{needed}`, `{streak}`, `{callsign}`, `{last_session.best_combo}`, `{running_joke.topic}`.
- [ ] **Delivery:** typewriter effect in the bubble, with small human touches: occasional
      "..." pauses, a rare typo she corrects mid line, a trailing "anyway."
- [ ] **Self talk:** occasionally mutters to herself while doing things ("where did I put the calendar...").
- [ ] Language level (Clean / Salty / Unfiltered) per line; default Unfiltered.

---

## 6. Mood and personality state

Numbers that drift and change behavior. Saved between sessions.

| Variable | Goes up when | Goes down when | Affects |
|---|---|---|---|
| `energy` | morning, streaks, good grades | late night, long idle | animation speed, leg swing, glow, line pool |
| `mood` | wins, user returns, tasks done | bad grade, overdue pile, long absence | tone of lines, expressions |
| `annoyance` | click spam, ignoring her, being dragged | time passing, user apologizing (clicking her gently) | sass level, reaction lines |
| `pride` | user improves, comebacks | resets slowly | smug lines, celebrations |
| `rapport` | every session, milestones, time together | never goes down | unlocks relationship tiers |

- [ ] Mood decays toward a neutral baseline over time, so she's never stuck.
- [ ] **Stable personality profile** (fixed data): her likes, dislikes, opinions, pet peeves,
      favorite subjects, what she thinks of each course. She references them consistently
      ("I still think marketing is fake.").
- [ ] **Rapport tiers** unlock new line pools and behaviors: stranger → partner → friend → ride or die.
      Higher tiers: harder roasts, inside jokes, she sometimes talks about herself.

---

## 7. Memory

Everything local in SQLite (new tables via numbered migrations).

- [ ] **Facts** (`nova_facts`): callsign, birthday, usual study times, weak/strong topics,
      target grades, blocked day labels, preferences she's learned (layouts, quiz length).
- [ ] **Episodes** (`nova_episodes`): dated events worth remembering: "first A in MIS 430",
      "went 22 in a row on OM 300", "studied until 3 AM before the GBA exam",
      "came back after 9 days." Each has a weight; important ones get referenced later.
- [ ] **Running jokes** (`nova_jokes`): topic, times referenced, last referenced, status
      (active / retired once the user beats it).
- [ ] **Callbacks:** the Director can pick an episode as a line variable
      ("Remember when you went 22 in a row? Yeah, me neither, apparently.").
- [ ] **"What Nova knows"** screen: shows facts, episodes, and jokes in plain words; all deletable.
- [ ] **Onboarding conversation** (scripted): she boots up, introduces herself, asks your name or
      callsign, birthday, target grades, when you usually study, and anything she should never
      bug you about. Answers become facts.

---

## 8. Command Bar (talking to her without AI)

- [ ] Summon with a hotkey or by clicking her. A small input appears in her speech bubble.
- [ ] **Quick chips** under the input based on context: "What's next", "Quiz me", "Focus 25",
      "Grades", "What do I need on the final", "Tidy up".
- [ ] **Intent matcher (no AI):** keyword and fuzzy matching of typed text to commands with slots.
      Examples:
      - "quiz me on mis 430" → `startQuiz({ course: 'MIS 430' })`
      - "what's due tomorrow" → `showDue({ range: 'tomorrow' })`
      - "what do i need on the final for gba" → `whatIf({ course: 'GBA 490', item: 'final' })`
      - "focus 50" → `startFocus({ minutes: 50 })`
      - "put grades on the left" → `movePanel('grades', 'left')`
      - "open the syllabus for marketing" → `openPanel('syllabus', { course: 'MKT 300' })`
- [ ] Course names match on nicknames too ("marketing", "strategy", "430").
- [ ] **Small talk pool:** common phrases get scripted answers ("hi", "thanks", "I'm tired",
      "you're annoying", "good night", "how are you") that use mood and memory.
- [ ] **Unknown input:** she answers in character and shows the closest commands
      ("No idea what that means. Did you want one of these?"). With a key in enhanced mode,
      unknown input goes to the AI instead.

---

## 9. Enhanced mode (optional API key)

Nothing in scripted mode is removed or depends on this.

- [ ] Settings: "Enhance Nova" with key entry (stored via the existing safeStorage flow).
- [ ] When enabled:
      - Free conversation in the command bar
      - She can explain concepts using your notes and course content
      - Richer, less repeated lines (the AI rewrites scripted lines in her voice, same facts)
      - Better card generation and study guides
- [ ] **The AI plays Nova through the same systems.** It receives: persona and voice rules,
      current mood, rapport tier, relevant memory, and a list of tools. It must respond with
      structured output: `{ "say": "...", "actions": [ ...Stage API calls... ] }`.
      So an enhanced Nova still walks, points, highlights, and arranges panels exactly like
      scripted Nova.
- [ ] **Data tools** for the AI: `getTonight`, `getCourse`, `getGrades`, `whatIf`, `getDue`,
      `getDeckStats`, `getWeakTopics`, `searchNotes`, `getMemory`. It never states a number
      it didn't get from a tool.
- [ ] If a call fails or times out, she falls back to scripted mode mid conversation in character
      ("Lost my connection to the smart part of my brain. Still here though.").
- [ ] Usage indicator in Settings so the user can see what it's costing them.

---

## Tricks that sell "she's alive" (checklist)

- [ ] **Caught in the act:** when the app opens, she's already doing something (reading, rearranging
      her desk, doodling) and reacts to you arriving.
- [ ] **Continuity:** she remembers where panels were, what you were doing, and picks up there.
- [ ] **Gaze:** looks at what she's talking about, then back at you when she's done.
- [ ] **Hesitation:** occasional "hmm," a pause before an answer, changing her mind about a layout.
- [ ] **Imperfection:** a rare typo she fixes, knocking a panel slightly crooked and straightening it.
- [ ] **Reactions to you:** resize the window while she's sitting on something ("Hey. I was sitting there."),
      close a panel she just opened ("Rude."), leave mid sentence ("...and he's gone.").
- [ ] **Time sense:** knows how long you've been gone, day of week, holidays, your birthday,
      game days, semester start and finals week.
- [ ] **Opinions:** consistent likes and dislikes she brings up on her own.
- [ ] **Her own life:** mentions what she did while you were gone (sorted your cards, reorganized
      the calendar, "read the whole syllabus for fun, because I have no life").
- [ ] **Breathing and blinking** always on, even when still.
- [ ] **Serious when it matters:** jokes off for bad grades, 2 AM, long absences, then back to normal.

---

## Build phases

1. **Stage API + anchors:** anchor registry, all Stage actions working on the existing
   Today screen, undo. Test: a hardcoded script that walks, points, highlights, opens and moves panels.
2. **Workspace as home:** panel slot layout, named layouts, focus view, her desk (static first).
3. **Scene Player + Voice System:** scene format, line library, templates, no repeat tracking.
   Port the morning briefing and study session into scenes.
4. **Director + Event Bus + Mood:** intents, scoring, cooldowns, interrupt rules, anticipation.
5. **Memory + onboarding + "What Nova knows":** facts, episodes, running jokes, rapport tiers.
6. **Command Bar:** chips, intent matcher, small talk, unknown input handling.
7. **Her evolving desk:** objects from real events, trophy shelf, tidying.
8. **Enhanced mode:** key, structured output, data tools, fallback.

## Done when

- With no API key, a new user can go through onboarding, get briefed, be quizzed, run focus
  mode, and ask the common questions entirely through Nova.
- She moves, points at, highlights, and arranges real panels while talking about them.
- After two weeks of use, she references at least three real past events and one running joke unprompted.
- She never repeats the same exact line twice in one day.
- Turning enhanced mode on makes her smarter without changing how she moves or behaves.
- The user can still do everything without talking to her.
