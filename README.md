# Study Hub

> A local-first desktop study application for college
> students. Import your course materials, generate
> structured notes and flashcard decks, and track
> retention — all without an account or subscription.

**GitHub:** [Jkillenit/StudyHub](https://github.com/Jkillenit/StudyHub)

---

## Features

| Feature | Status |
|---------|--------|
| Rich text notes editor per chapter | ✓ Available |
| Flashcard drill with KNOW IT / AGAIN | ✓ Available |
| Command palette (⌘K) with fuzzy search | ✓ Available |
| Chapter mastery tracking | ✓ Available |
| Inline glossary highlighting in notes | ✓ Available |
| PPTX → structured notes pipeline | 🔄 In development |
| Blackboard ZIP course import | 📋 Planned |
| SM-2 spaced repetition | 📋 Planned |

---

## Installation

### Download (recommended)
Download the latest installer from
[GitHub Releases](https://github.com/Jkillenit/StudyHub/releases/latest).

Run `StudyHub-Setup-x.x.x.exe` and follow the installer.

### Build from source

**Requirements:**
- Node.js 18 or higher
- npm 9 or higher
- Python 3.8 or higher (for PPTX processing)

```bash
# Clone the repository
git clone https://github.com/Jkillenit/StudyHub.git
cd studyhub

# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

---

## AI Features (Optional)

Study Hub works fully without an API key.

To unlock AI-enhanced note generation and flashcard
creation from imported slides:

1. Get a free API key at
   [console.anthropic.com](https://console.anthropic.com)
2. Open Study Hub → Settings → API Key
3. Paste your key — it is stored locally and never
   transmitted anywhere except `api.anthropic.com`

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI framework | React + Vite |
| Styling | Bootstrap (reset) + CSS custom properties |
| Rich text editor | TipTap |
| Local storage | localStorage → SQLite (in migration) |
| AI pipeline | Anthropic Claude API (user-supplied key) |
| Packaging | electron-builder |

The app is **local-first** — all course data, notes, and
flashcards are stored on your machine. No account required.
No data leaves your device except optional Claude API calls.

---

## Project Structure

studyhub/
├── .github/           CI/CD pipeline (Phase 3)
├── docs/              Product backlog, roadmap, guides
├── electron/          Main process, preload, IPC bridge
├── src/               React components, styles, logic
├── scripts/           Build and launch scripts
├── index.html         Vite entry point
└── vite.config.js     Build configuration

---

## Documentation

- [Product Backlog](docs/PRODUCT_BACKLOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built with Electron, React, and TipTap.
Designed for college students on Blackboard.*
