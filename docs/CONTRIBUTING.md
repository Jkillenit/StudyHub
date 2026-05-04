# Contributing to Study Hub

## Getting started

```bash
git clone https://github.com/Jkillenit/StudyHub.git
cd studyhub
npm install
npm run dev
```

## Branch naming

feature/short-description
fix/short-description
docs/short-description

## Commit style

Use present tense, imperative mood:
  ✓ "Add glossary highlight to notes editor"
  ✗ "Added glossary highlighting"
  ✗ "Adds glossary highlight"

## Before submitting

- [ ] `npm run build` passes with no errors
- [ ] Feature matches an item in docs/PRODUCT_BACKLOG.md
- [ ] No new console.log statements in production code
- [ ] CSS changes use existing token variables only

## Adding a backlog item

New features go in docs/PRODUCT_BACKLOG.md following the
existing ID format (UI-xxx, NT-xxx, QZ-xxx, etc.) with
Impact, Difficulty, and Est. time rated by the implementer.
