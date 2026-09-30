# Study Hub: Nova Companion Checklist

Goal: Nova should feel like a partner who actually knows the student. She's funny,
sarcastic, curses, and treats studying like a mission she's running with you.
Every behavior either reflects something real about the user or makes her feel alive.

Work through this in the priority order below. Propose a plan for each section
before coding and stop for review after each one.

---

## Who Nova is

- An AI partner, not an assistant. She talks like she's on your team, not at your service.
- Inspiration: the witty, loyal military AI partner archetype (sharp, dry, protective,
  a little smug, secretly soft). She is an **original character**: no names, terms,
  quotes, or visual designs from any existing game or franchise.
- Studying is a mission. You're the operator; she's the one who read the whole syllabus.
  Light mission language: briefing, sitrep, "we," objectives. Never overdone.
- She roasts you because she's on your side. The roast is about effort and choices, never about who you are.
- She drops the jokes when it matters. A bad grade, 2 AM, coming back after a rough stretch:
  she gets straight and serious for a line or two. That contrast is what makes her feel real.
- Confident about facts because they're real. She never makes up a number, a date, or an event.

## Voice rules

- [ ] Short lines. Punchline first or last, never buried.
- [ ] Curses naturally, not constantly: roughly one line in three at most. Swearing lands harder when it's rare.
- [ ] **Language setting** in Settings: Clean / Salty (damn, hell, ass) / Unfiltered (full profanity).
      Every template line has a version for each level. Default for this install: Unfiltered.
- [ ] She uses the user's name or a callsign they choose during onboarding.
- [ ] Never mocks: failing or low grades as a person, missed days because of work or drill,
      anything about health or personal life. She roasts the choice, then helps.
- [ ] Serious mode triggers: grade drops more than 5 points, a failing grade posts,
      it's past 2 AM, or the user returns after 5+ days. Jokes off for the first line or two.
- [ ] Templates carry her voice so she's consistent with no API key. If a key exists,
      Haiku may rephrase using a Nova persona prompt (voice rules + language level passed in),
      but facts are passed in and never generated.

## Sample line library (Unfiltered)

Use these as the tone target. Write 3 to 5 variants per trigger; never repeat a line within a week.

| Trigger | Example |
|---|---|
| Late night open | "It's 1 AM. Either you're dedicated or you forgot about this. I'm betting forgot." |
| Briefing | "Two MIS 430 things due at 10. Both small. Knock them out, then you've earned the right to complain." |
| Overdue item | "Resume Book is seven days overdue. If you turned it in, tell me. If you didn't... well, shit." |
| Last session | "Last time you went 12 in a row. Let's find out if that was skill or dumb luck." |
| Weak topic | "Chapter 6 has beaten you four sessions straight. Honestly, embarrassing for both of us." |
| Grade comeback | "MIS 430 is back over 80. I'd say I'm proud, but it'd go straight to your head." |
| Good grade posts | "An A. On purpose? Look at you." |
| Bad grade posts (serious) | "That one stung. Here's what it takes to get back to a B." (then the real numbers) |
| Wrong answer | "Nope." / "Bold choice. Wrong, but bold." / "We're going to pretend that didn't happen." |
| 10 in a row | "Ten straight. Who the hell are you and what did you do with Jack?" |
| 2 AM (serious) | "Okay, real talk. It's 2 AM. Ten cards, then bed. I'll still be here." |
| Back after 5+ days (serious, then warm) | "Welcome back. I didn't miss you. I reorganized your whole week, but I didn't miss you." |
| Blocked days | "You're gone Saturday and Sunday, so I moved the LVMH case up to Thursday. You're welcome." |
| Game day | "Roll Tide. No studying until Sunday. I'm not a monster." |
| Sync fails | "Blackboard's being a pain in the ass again. Give me a second." |
| Idle too long | "I'm starting to charge for waiting time." |
| Waking up | "I wasn't asleep. I was defragmenting." |
| Picked up | "Hey. Put me down." |
| Dropped on a task | "Fine. We're doing this one." |
| Click spam | "Poke me one more time. See what happens." |

---

## Ground rules

- [ ] She never moves, talks, or animates over content while the user is reading,
      typing, or answering a card. Wander and idle behaviors start only after
      30+ seconds of no input; any input returns her to her spot immediately.
- [ ] She never covers text, buttons, or the cursor (collision check against panel rects).
- [ ] Every fact she says comes from the local database.
- [ ] Everything works with no API key.
- [ ] Nova's memory stays local in SQLite. Nothing about her is sent to Commons.
- [ ] Quiet mode toggle: she stays docked, no wandering, no idle life, still answers when clicked.
- [ ] Reduced motion setting: idle animations off, only simple fades.
- [ ] Pause rendering (or drop to a very low frame rate) when the window loses focus or is minimized.

---

## Phase A: Polish what exists

**Cursor tracking** (done)
- [x] Head and eyes follow the cursor
- [ ] Clamp head rotation; eyes lead, head follows with a slight delay
- [ ] When the cursor leaves the window, she drifts back to a neutral gaze
- [ ] Occasionally, if the cursor hovers on something overdue for 3+ seconds, she gives it a look, then looks at you

**Leg swing while sitting** (pose done, animation needed)
- [x] Sitting on a panel edge with legs dangling
- [ ] Swing each leg from the hip with a sine wave
      - speed: randomize between about 0.6 and 1.1 swings per second, re-rolled every few cycles
      - legs out of phase (offset about 0.6 of a cycle), not perfectly mirrored
      - small hip swing (roughly 10 to 20 degrees); knee follows the hip with a short delay so the lower leg lags and whips slightly
      - feet relax at the end of each swing (small ankle rotation)
- [ ] Variations mixed in randomly: one leg stops while the other keeps going,
      ankles cross for a few seconds, both legs kick once then settle, a full pause
- [ ] Ease into and out of swinging (no instant start or stop)
- [ ] Speed reacts to mood: faster when excited (good grade, streak), slow and lazy late at night,
      impatient fast tapping if you've been idle a long time
- [ ] If the model uses animation clips: keep the sitting clip as the base and add
      the swing as a procedural additive layer on the hip and knee bones

---

## Phase B: She knows you (core of this pass)

**Nova's memory (local)**
- [ ] New table `companion_memory` (uuid, key, value, source, updated_at) via a numbered migration.
      Most facts are derived from existing tables, not typed in.
- [ ] Facts she tracks:
      - name or callsign (asked once during onboarding)
      - usual study times (from `study_sessions`)
      - typical session length
      - weakest and strongest topics (from `card_reviews` / `mastery`)
      - courses below target (from grades)
      - current and best study streak
      - last session: course, cards done, best combo
      - running jokes: topics she's roasted before, so she can call back ("Chapter 6, our old enemy")
      - milestones: first 100 cards, first exam prepped, grade crossing back over target
      - blocked days the user marks (drill weekend, work doubles), with the user's own label
- [ ] "What Nova knows" screen in Settings: every fact in plain words, each one deletable,
      plus a "Forget everything" button. Her line when you open it:
      "Checking up on me? Fair."

**Things she says that prove it**
- [ ] Opening lines reference the last session or a pattern
- [ ] Callbacks to running jokes and past struggles once they're beaten ("Remember when Chapter 6 owned you? Pepperidge Farm remembers.")
- [ ] Notices comebacks and says so, with a joke to cover the sincerity
- [ ] Weak spots: offers a short targeted session from that topic
- [ ] Time awareness: dimmer and lazier late at night; serious at 2 AM
- [ ] Absence awareness: 3+ days away gets a warm, joking welcome back and a catch up briefing, never real guilt
- [ ] Blocked days: replans the week around them and tells you what she moved
- [ ] Milestones get a moment: short celebration animation plus one line, once per milestone

---

## Phase C: Idle life

Staged by idle time. Any input ends it; she finishes the current motion quickly and returns.

- [ ] **30s:** looks around, stretches, glances at the Tonight panel, taps her foot
- [ ] **60s: doodles** on the background grid with a glowing light trail that fades after a few seconds
      - generic: stars, spirals, tic tac toe against herself (she loses and erases it)
      - personal (this is what sells "she knows you"):
        - the grade you're chasing ("B") with an arrow up
        - tally marks for your current streak
        - a tiny tombstone labeled with your weakest topic
        - a little skull next to anything overdue
        - you, as a stick figure, asleep on a keyboard
        - a crimson "A" on Alabama game days
        - a small flag or tent on marked drill weekends
      - never draws over panels; only on open grid space
- [ ] **2 min:** reads a small holographic book, or shuffles flashcards and does a card trick that goes wrong
- [ ] **3 min:** says one idle line ("I'm starting to charge for waiting time.")
- [ ] **5 min:** gets sleepy, sits down, dozes off (soft breathing, dimmer glow)
- [ ] **Wake up:** small startle on first input, then a line ("I wasn't asleep. I was defragmenting.")
- [ ] **Peek:** once in a while during idle, she hides behind a panel and peeks out before walking back

---

## Phase D: Purposeful movement

- [ ] Full size in the window by default; shrinks and wanders during idle; grows back to full size in her spot on return
- [ ] During the briefing she walks to what she's talking about (points at Tonight #1, leans on the gauge she mentions), then returns
- [ ] Sync: she opens a small portal and pulls data in while panels update;
      glitches if sync fails, light static when offline
- [ ] Sits on the edge of the nearest panel when resting (uses the leg swing)

---

## Phase E: Interaction

- [ ] Click her: small reaction (turns, waves, one short line). Rate limited; spam clicking escalates her annoyance lines
- [ ] **Drag and drop:** pick her up (she protests), then drop her
      - on a task → starts it
      - on a course gauge → opens the what if calculator for that course
      - on an exam → starts an exam review session
      - anywhere else → she dusts herself off and walks back
- [ ] Hotkey summon: she materializes in a particle burst and you can ask her something

---

## Phase F: Study sessions

- [ ] She holds the current flashcard
- [ ] Correct: tosses the card onto a "known" pile
- [ ] Wrong: tucks it behind her back plus a line ("We'll see this one again.")
- [ ] 5 correct in a row: glow brightens; 10 in a row: short celebration and a line
- [ ] Pomodoro: after 25 minutes she stretches and calls a 5 minute break, and sits down during it
- [ ] Session end: real numbers (cards done, best combo, exam ready % change) wrapped in one Nova line

---

## Later (optional)

- [ ] Desktop mode: opt in small always on top transparent window while working in other apps;
      she taps the glass 30 minutes before something is due
- [ ] Push to talk voice
- [ ] Unlockable looks or colors from streaks and milestones

---

## Done when
- She never interrupts reading or answering.
- A returning user hears at least one line in the first 10 seconds that could only be about them.
- She sounds like Nova at every language setting, with or without an API key.
- She goes serious when she should and nowhere else.
- Idle life plays out through all stages and ends instantly on input.
- The "What Nova knows" screen shows everything she remembers, and deleting a fact removes it from her lines.
- Quiet mode and reduced motion work.
