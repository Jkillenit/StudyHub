# Nova Dev Log: 2026-09-29 to 2026-09-30

## Summary

Study Hub went from "a Blackboard scraper with Quizlet" to **Nova**: a companion who
*is* the app. The Study Hub workspace becomes her home, she arranges it for you, and
everything runs through her. She's fully scripted (no AI required), with an optional
API key to "enhance" her. Built for me and friends, local, not for profit.

---

## How we got here

1. **Problem check.** Study Hub had features but no problem it solved. The real problem:
   Blackboard has all the data but never tells you what to do tonight.
2. **"Tonight" pivot.** Added a priority engine (urgency × grade weight × grade risk) and a
   Today screen that ranks what matters. Exam aware SM-2 (intervals capped at the exam date),
   needed score badges, companion led review sessions.
3. **UI redesign.** Dropped the green terminal look for a holographic, Stark style HUD built
   around the companion: deep blue black, cyan accent, frosted panels, arc gauges.
4. **Companion becomes Nova.** Funny, sarcastic, curses, Cortana inspired. Leveling, idle life,
   memory of the user.
5. **Desktop Nova.** She leaves the app and lives on the desktop as a sprite.
6. **Nova is the app.** Final shift: she's the interface, Study Hub is her workstation.

---

## Key decisions

| Decision | Detail |
|---|---|
| Core product | Nova is the app. Study Hub is her home and workspace. |
| AI | Fully non AI. Optional API key enhances her but nothing depends on it. |
| Facts | Every number and fact she says comes from the local database. Never made up, even in enhanced mode. |
| Audience | Me and friends. Local, not for profit. Profanity and references are fine. |
| Persona packs | Nova ships by default. Private packs (e.g., a Cortana version) load from the user data folder, never committed to the repo. |
| Language | Clean / Salty / Unfiltered setting. My default: Unfiltered. |
| Creator mode | On for my install: she knows I built her and blames me for everything. |
| Commons | Deferred. Professor insights later; public UA grade distributions preferred over reviews. |
| Priority | Stage API first, then build up. |

---

## Design docs (in `docs/design/`)

| File | What it covers |
|---|---|
| `DESIGN_TODAY.md` + `today-mockup.html` | Holographic redesign: tokens, type, layout, components, motion, what to remove |
| `COMPANION_CHECKLIST.md` | Behaviors: leg swing, idle life and doodles, memory, study sessions, drag and drop, guardrails |
| `NOVA_VOICE.md` | Character bible: origin lore, creator mode, humor types, references, serious mode, line library, easter eggs |
| `NOVA_CORE.md` | Architecture: Stage API, workspace as home, Director, scenes, voice system, mood, memory, command bar, enhanced mode |
| `DESKTOP_NOVA.md` | Desktop sprite: walking on windows, activity awareness, Blackboard notifications, focus mode dim |
| Persona packs prompt | Swappable identity (name, lines, model, voice, bone map), build check that only Nova ships |

**Read order for Cursor:** NOVA_CORE → NOVA_VOICE → COMPANION_CHECKLIST → DESIGN_TODAY → DESKTOP_NOVA.

---

## Nova in one page

**Who she is**
- Study AI built by a broke college guy in his early 20s at 2 AM on energy drinks and spite.
- Partner, not assistant. Sarcastic, loyal, roasts your effort because she's on your team.
- Halo and Modern Warfare nods, Clippy trauma, dark humor about grades and doom, self aware software jokes.
- Goes serious for bad grades, 2 AM, long absences, and real stress. Never jokes about self harm;
  real distress gets a straight answer and a real person (988).

**How she's built (no AI)**
- **Stage API:** walk to, point at, highlight, open/move/focus panels, arrange layouts, pin notes. All UI elements register anchors.
- **Director:** utility scoring picks what she does next from events, time, mood, memory. Handles anticipation and interrupt rules.
- **Scenes:** choreography written as data (walk, point, say, wait).
- **Voice system:** line library with template grammar, no repeats, real data variables, human touches (pauses, typos).
- **Mood:** energy, mood, annoyance, pride, rapport. Rapport tiers unlock new lines.
- **Memory:** facts, dated episodes, running jokes, callbacks. "What Nova knows" screen, all deletable.
- **Command bar:** typed commands matched to actions without AI ("quiz me on 430", "focus 50").
- **Enhanced mode:** AI gets persona, mood, memory, and data tools; must answer with `say` + Stage actions, so she moves the same either way.

**Her home**
- Panels are holographic screens she physically moves. Named layouts: briefing, study, exam prep, grades, writing, tidy.
- Her desk evolves from real events: trophies, first A, kept doodles. Nothing resets.

**Game layer**
- Leveling brings her systems back online instead of just colors.
- Memory fragments: her backstory unlocks as you study.
- Integrity reflects real study state (overdue items, exam readiness). Glitchy when you're behind, never dies, no lost progress.
- Modes: Memory Recovery (story), Defrag (mastery map), Firewall (timed). Exams are boss fights, wins go on the trophy shelf.
- Weekly missions built from real data. XP rewards studying well, not grinding easy cards.

**Desktop Nova**
- Sprite on the desktop: sits on and falls off windows, walks the taskbar, climbs up in the morning.
- Reads active window titles only (local, never saved) to know what you're working on.
- Grade envelope, announcement signs, "due in 30 min" glass tap. Checks Blackboard every 30 to 60 min from the tray.
- Focus mode dims everything except the active window.
- Auto hides during Zoom, screen shares, fullscreen, presentations. Build and test this first.

---

## Under consideration: voice (Voicebox)

- Voicebox (github.com/jamiepine/voicebox): local, MIT, REST API on `127.0.0.1:17493`, Windows supported.
- Plan: pre-generate scripted lines and cache them; generate live only for lines with data.
  Start generating when the bubble starts typing. Mood picks delivery style (Qwen3-TTS instructions / Chatterbox emotion tags).
- Glow or mouth pulses with audio volume (simple lip sync).
- Push to talk: Voicebox speech to text feeds the non AI command bar.
- Voice profile lives in the persona pack. Falls back to text if Voicebox isn't running.
- Next: confirm request format at `/docs`, write `NOVA_AUDIO.md`.

---

## Open items

- [ ] Fix priority engine: overdue items overpowering weight; check submitted status before ranking.
- [ ] Standardize course display names (raw Blackboard codes still showing).
- [ ] Rig: both persona models need the same bone setup or a bone map.
- [ ] Decide leveling curve and memory fragment story.
- [ ] Voice: install Voicebox, test speed on my laptop, pick model.
- [ ] Update `PROJECT_BRIEF.md` vision and decisions log to reflect "Nova is the app."
- [ ] Public UA grade distribution data: does it exist?

## Next up

1. Finish current Cursor pass (redesign + functionality).
2. **Nova Core Phase 1:** Stage API + anchors on the Today screen with one hardcoded scene.
   Success = she walks to a gauge, points at it, and pulls a panel forward.
3. Then Phase 2 (workspace as home) and Phase 3 (scenes + voice system).
