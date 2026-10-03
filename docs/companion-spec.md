# Companion — Nova (pointer)

The old "Scout the firefly" spec is retired. The companion is **Nova**, a 3D hologram (VRoid +
three-vrm, portrait fallback) living in `src/companion/`. Current docs:

| Topic | Doc |
|-------|-----|
| Vision, behaviors, Nova Core steps | [`design/NOVA_CORE.md`](./design/NOVA_CORE.md) |
| Voice and character bible | [`design/NOVA_VOICE.md`](./design/NOVA_VOICE.md) |
| Behavior checklist | [`design/COMPANION_CHECKLIST.md`](./design/COMPANION_CHECKLIST.md) |
| Missing animation clips | [`design/nova-missing-clips.md`](./design/nova-missing-clips.md) |
| Dev log (2026-09-30) | [`design/NOVA_DEVLOG_2026-09-30.md`](./design/NOVA_DEVLOG_2026-09-30.md) |
| Companion track status (C.x) | [`ROADMAP.md`](./ROADMAP.md) → Companion — Nova |

UI overhaul spec ([`superpowers/specs/2026-10-01-ui-overhaul-design.md`](./superpowers/specs/2026-10-01-ui-overhaul-design.md)):

- **§2.5 Nova placement and states**: rest in the bottom-right lane, shrunk into the message box
  glyph, moved/pointing, larger session lane; content column and bar are no-go zones.
- **§3 Nova session**: side-by-side quiz/flashcard layout, shield meter (§3.1), results and rounds.
- **§5 Flavor packs**: Nova (default) and Zombies (zombie-tinted Nova, Zombies voice, power-ups).

Carried rules: Nova lives only in the main Study Hub window (never inside Blackboard), never fills
answers, works without an API key (local FAQ in `src/companion/faq.js`), and Haiku may rephrase
lines but never computes numbers.
