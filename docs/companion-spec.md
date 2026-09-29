# Scout — Study Hub companion spec

## 0. Study Hub adaptation (read first)

This spec was written generically. In this repo:

- **JavaScript, not TypeScript**: files are `.js` / `.jsx` like the rest of `src/`.
- **No Framer Motion / XState / Zod**: animation is CSS keyframes + one `requestAnimationFrame` loop that
  runs only during flights; the state machine is a small transition table (`src/companion/machine.js`).
- **Files live under `src/companion/`** (renderer). Main-process AI files arrive in Phase 5.
- **Spaced repetition reuses the existing SM-2** (`src/study/sm2.js` + `db:mastery:update`), not a new
  `card_srs` table. Quiz runs are logged to the existing `study_sessions` table (`kind = 'quiz'`) so the
  Progress view shows them.
- **Companion state** (settings, XP, level, tour progress, high scores) is one JSON value in the existing
  `settings` table under `companion.state`. Dedicated tables can come with Phase 5 if needed.
- **Help without an API key** answers from a local FAQ (`src/companion/faq.js`) and still points at the
  right UI element. Claude replaces the lookup in Phase 5 using the same `point_to` contract.
- **Styling**: all companion CSS lives in `src/studyhub-bootstrap.css` and uses `--sh-*` tokens only.
- **Integrity**: Scout lives only in the main Study Hub window, never inside the Blackboard window, so it
  cannot appear over a graded Blackboard view. Assessment-mode detection lands in Phase 6.

## 1. Overview

Scout is an animated companion sprite that lives on top of the Study Hub UI, wanders on its own, and
becomes the student's guide, help desk and flashcard quiz host when clicked. It is not a chat window: it
talks in short speech bubbles, points at real UI elements, and turns flashcard review into a small game.

Goals

- A character students actually like having around, with a consistent personality.
- Onboarding: a guided tour that physically walks the student through the app.
- Help: answer "how do I..." questions about Study Hub by pointing at the right control.
- Study: run flashcard quizzes from the student's decks as a minigame with streaks and spaced repetition.

Non-goals (v1): no free-form long chat panel, no sprite activity during graded assessments, no voice/TTS.

## 2. The character: Scout the firefly

A pocket-sized firefly whose tail lantern glows brighter as the student gets answers right. The glow is
the streak meter. Character data lives in `src/companion/character.js` and can be swapped.

Appearance (SVG component)

- Round bean body ~56 × 56 px at default size; big oval eyes with one highlight each.
- Two short antennae with ball tips that carry emotion: up = excited, drooped = sad, one bent = confused,
  twitching = thinking.
- Two small translucent wings that flutter (fast when flying, slow when idle).
- Lantern tail: soft radial glow in the Study Hub accent color; brightness 0–5 maps to the quiz streak.
- Tiny backpack strap. Unlockable accessories: reading glasses, graduation cap, headlamp.
- Palette from Study Hub theme tokens.

Personality

- Upbeat study buddy with dry humor. Encouraging without being syrupy; teases gently, never mocks.
- Speech bubbles are 1–2 sentences, max ~140 characters unless the student asks for more.
- Light-related wordplay sparingly (max one pun per ~5 lines).
- Admits when it doesn't know. Never invents course facts; only quizzes from the student's own cards.
- Calmer and shorter when the student is missing a lot, more playful on a streak.

Sample lines

| Moment | Line |
|---|---|
| First launch | "Hey, I'm Scout. I know where everything in here is. Want the 60-second tour?" |
| Idle click | "Need something? I can quiz you, find a class, or show you around." |
| Correct answer | "Nailed it. Streak's at 4, I'm practically a lighthouse." |
| Wrong answer | "Close. The answer's mitochondria. We'll see that one again soon." |
| Deck finished | "12 of 15. The 3 you missed are queued for tomorrow." |
| Due cards waiting | "You've got 8 cards due in MIS 430. Five minutes?" |
| Dismissed | "Got it, I'll hang back. Click me whenever." |

## 3. Behavior and movement

One finite state machine drives every animation, movement and bubble.

| State | What Scout does | Exits to |
|---|---|---|
| idle | Hovers, slow wing flap, blinks every 3–6 s | wander after 8–20 s; menu on click; nudge on event |
| wander | Flies to a random safe waypoint on a curved path, 60–120 px/s | perch or idle on arrival; menu on click |
| perch | Lands on the top edge of a `data-perch` element | idle after 10–30 s; menu on click |
| sleep | Dims, Zzz, stops after 3 min without input | idle on any input |
| menu | Stops, shows radial menu | tour, help, quiz, idle |
| tour | Flies to target, spotlights it, shows step bubble | next step or idle |
| help | Shows input bubble, then points at the answer's element | idle |
| quiz | Docks beside the quiz panel, reacts to answers | idle on end |
| nudge | Flies near a relevant spot with one suggestion | idle after 8 s or dismiss |
| hidden | Not rendered | idle when re-enabled |

Movement rules

1. Scout moves in an overlay layer above the app, in window coordinates.
2. Waypoints come from safe zones: margins, gutters, and top edges of `data-perch` elements. Never over
   `data-sprite-avoid` elements (inputs, editors, the active flashcard face, video).
3. Gentle bezier paths with a slight vertical bob (4 px). Face the direction of travel.
4. If the cursor comes within 80 px while wandering, drift away (no dramatic fleeing).
5. Pause wandering until 5 s after the last typing/scrolling input.
6. Clamp back into bounds on window resize.
7. Users can drag Scout; the drop point becomes `homePosition`.
8. Unsolicited nudges: max 1 per 10 minutes and 4 per session; a dismiss doubles the cooldown.

## 4. Interactions

Clicking Scout opens a radial menu: Quiz me · Show me around · How do I...? · Hide for now.
Ctrl/Cmd+Shift+Space summons Scout and opens the menu; arrows + Enter select; Esc closes.

### 4.1 Guided tour

- Tours are data (`src/companion/tours/*.json`); each step = `{ targetId, title, text, placement, route?, waitFor? }`.
- UI targets carry stable `data-tour-id` attributes.
- Each step: Scout flies next to the target, a spotlight dims the rest of the window, the bubble shows
  Back / Next / Skip. `waitFor: "click"` waits for the student to click the target.
- If a target isn't on screen, navigate to its `route` first, wait up to 3 s, else skip the step.
- Tours: first-run (auto-offered once) and course tools. Progress saved per tour.

### 4.2 Help ("How do I...?")

- Without an API key: search the local FAQ, answer in the bubble, fly to and point at `pointTo`.
- Phase 5: Claude returns `{ say, emote, point_to, suggest }` using a UI manifest of tour ids.

### 4.3 Quiz minigame: "Light Run"

| Mode | Cards | Rules |
|---|---|---|
| Quick Run | 5–10 due cards | Default. No timer. |
| Streak Run | Unlimited | Ends on the 3rd miss. High score saved per deck. |
| Weak Spots | 10 lowest-ease cards | Hints encouraged. |
| Beat the Clock | 60 s | Multiple choice only, speed bonus. |

Flow: pick a deck (or all due) → Scout docks beside a quiz panel → answer by multiple choice, typing, or
flip-and-self-grade → correct: glow +1, happy bounce, points = 100 × multiplier (1×, 1.5×, 2×, 3× at
streaks 0/3/6/10) → miss: glow −1, sad droop, correct answer shown → hint costs half points → end screen
with score, accuracy, best streak, misses, next due date → every answer updates SM-2
(correct 5, with hint 4, partial 3, wrong 1). XP per run; accessories unlock at levels 3, 5, 10.

## 5. Architecture (as built)

- `CompanionLayer` renders into a portal: `position: fixed; inset: 0; pointer-events: none; z-index: 9000`.
  Only Scout, bubbles, menu and panels take pointer events.
- `ScoutSprite` props: `{ mood, glow, facing, flying, accessory }` — keep identical if the art is swapped.
- Movement: `useCompanionMotion` runs `requestAnimationFrame` only while flying; bob/blink/wings are CSS.
- Element lookup: `[data-tour-id]` + `getBoundingClientRect()`, re-read on resize/scroll.
- Lazy-loaded after the launch splash.

## 6. AI integration (Phase 5)

Claude returns a small JSON reply the renderer validates; it never controls Scout directly.
Model: `claude-haiku-4-5-20251001` for help, banter and grading. Canned lines cover routine moments.

```
type CompanionReply = {
  say: string;                 // <= 140 chars unless mode === 'explain'
  emote?: 'happy' | 'sad' | 'confused' | 'thinking' | 'excited';
  point_to?: string;           // must be a data-tour-id from the manifest
  suggest?: 'start_quiz' | 'start_tour' | 'open_deck' | null;
  suggest_arg?: string;
};
```

Persona prompt starting point: see `character.personaPrompt`. Max 30 AI calls/hour, cached distractors,
help answers cached for 7 days, 10 s timeout with canned fallback.

## 8. Settings, accessibility, integrity, performance

- Settings: show Scout, movement (Off/Calm/Normal/Lively), suggestions on/off, size 75/100/125%,
  accessory, reset tours, reset quiz stats.
- `prefers-reduced-motion`: default movement Off, no bob, instant moves.
- Scout is a real button (`aria-label="Scout, study companion. Open menu"`), bubbles are `aria-live="polite"`,
  full keyboard paths for menu, tour and quiz; streak shown as a number, not only glow.
- Scout never fills answers into forms and never runs during graded assessments.
- Idle cost near zero: no per-frame work unless flying; timers pause while the window is hidden.

## 9. Phases

1. Sprite + settings. 2. Movement + state machine. 3. Menu + tours (+ FAQ help). 4. Quiz minigame.
5. Claude integration. 6. Nudges polish, rewards, assessment mode, performance. 7 (optional). Desktop roaming.
