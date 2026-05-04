# Study Hub — product roadmap & technical plan

This document is the **single planning artifact** for upcoming work: glossary architecture, per-chapter notes (local-first), and Blackboard / file import. It is updated as decisions land.

**Product backlog** (rated feature requests, impact vs difficulty, formula practice, UI queue): see [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md).

---

## 1. Goals

| Area | Goal |
|------|------|
| **Glossary** | Standalone course-level data. Every chapter and the Final review **surface** terms (hover + optional deep panel); glossary is **not** embedded in slide/PDF binaries. |
| **Notes** | Intuitive notes **alongside** each chapter; all storage **local** to the app; easy to open, edit, and find. |
| **Import** | Streamlined path from **Blackboard exports and downloads** (and generic folders) into the app, with **user-friendly** defaults; defer institutional APIs. |

---

## 2. Principles

- **Local-first**: Notes and imported-library metadata live on disk (Electron) or persisted storage (web); no required cloud.
- **No assumption of Blackboard API** for v1: optimize for **ZIP exports**, **manual folder picks**, and **common file types** (PDF, PPTX, DOCX, HTML).
- **Glossary is a service**: One source of truth (`terms` + definitions + tagging); renderers (React chapters, imported HTML, future readers) **consume** it via IDs or link rules.
- **Progressive enhancement**: Ship **import library + open file** before **perfect conversion**; ship **text extraction** before **OCR** and **auto-highlight**.

---

## 3. Worklist (by difficulty, easiest → hardest)

| Priority | Work item | Difficulty | Notes |
|----------|-----------|------------|--------|
| A1 | **Glossary module**: formal schema + refactor OM300 to consume it only (no glossary logic inside “slide” concepts) | Medium | Unblocks imports and multi-course later. |
| A2 | **Chapter notes**: editor UI, per-chapter (per-course) scope, debounced autosave, entry point in chapter chrome | Low–medium | Reuse existing storage patterns where possible. |
| B1 | **Material library MVP**: “Add folder / files” → list assets → open in embedded or OS viewer | Medium | High UX value before parsers. |
| B2 | **PDF**: text extraction + reading view (see §6) | Medium–high | Scanned PDFs = later OCR. |
| B3 | **PPTX**: slide text / outline extraction (optional slide preview) | Medium–high | |
| C1 | **Blackboard export heuristics**: map common ZIP layouts to modules + attachments | High | Requires real sample exports to validate. |
| C2 | **Glossary-driven highlights on imported text** (density controls, overlap rules) | High | |
| D1 | **OCR** for scanned readings | High | Heavy; optional tier. |
| D2 | **Blackboard REST / LTI** (institutional) | Very high | OAuth, IT approval; post–v1. |

---

## 4. Phased completion plan

### Phase A — Foundation

- Finalize **glossary schema** and migration path for OM300 `glossaryData.js` → shared module (IDs, `shortDef`, `longDef`, chapter tags).
- **Notes**: model `courseId` + `chapterId` (or `sectionKey`) + `markdown` or plain text v1; persistence API in Electron main if needed for large blobs; autosave + “last edited” in UI.
- **UX**: persistent **Notes** affordance (drawer, tab, or split) consistent across chapters.

**Phase A status (implemented):**

- Glossary: `src/glossary/` — `om300Data.js` (terms), `schema.js` (JSDoc), `GlossaryTerm` + split panel + context; OM300 chapters/Final import from `glossary/index.js`.
- Bootstrap: global `bootstrap` + `studyhub-bootstrap.css`; `data-bs-theme="dark"`. **Hub bar** (`StudyHubApp.jsx`), **OM300 shell** (`Om300StudyApp.jsx`), and **user-built courses** (`UserCourseApp.jsx`) use React Bootstrap (`Navbar`, `Container`, `Nav` pills, `Card`, `Collapse`, `Form`, `Button`, `Stack`). Chapter **`Card`** in `StudyTypography.jsx` is implemented with React Bootstrap so all OM300 sections share the same component shell; **Quizlet** (`Om300Flashcards.jsx`), **Final review** (`FinalReview.jsx`), **glossary** side panel, and section lazy-load fallback use the same system.
- OM300 notes: Markdown in **`ChapterNotesSplitPanel`** beside chapter content (side-by-side from `lg` up; stacked below on narrow viewports). `localStorage` `studyHub.v2.om300.chapterNotes`, debounced autosave. Notes stay open when switching chapters (content updates per section).

### Phase B — Import & conversion v1 *(active — PDF text v1 shipped)*

- **Library UI**: imported items with type icon, title, linked chapter (optional), open action.

**Phase B (baseline):** OM300 **Materials** offcanvas — add files / scan folder (Electron IPC), list in `localStorage`, **Open** uses OS default app. See `electron/main.cjs` (`pick-folder-materials`, `open-path`, `register-material-paths`).

**Phase B (2026 update — PDF read v1):** **`studyhub:extract-pdf-text`** in the main process uses **`pdf-parse`** (`PDFParse` + `getText()`); preload exposes **`extractPdfText`**. Materials lists a **Read text** action for `.pdf` rows (desktop only) opening a modal with extracted plain text. Scanned/image PDFs may return empty text (see **D1** OCR later). Remaining PDF work: search-in-text, performance on very large files, optional **PDF.js** embedded viewer.

- **PDF**: extract text for search/read mode; keep “open original” fallback.
- **PPTX**: extract text per slide; defer pixel-perfect rendering.
- Document **user-facing steps**: e.g. “Download files from Blackboard Content” / “Export course package if available.”

### Phase C — Blackboard-aligned polish

- Importer tuned to **one or two verified** export structures (version + institution).
- **Optional**: map BB folders → app modules.

### Phase D — Intelligence & scale

- Auto glossary highlights on imported content (toggle + sensitivity).
- OCR, cloud backup, cross-device sync — **only after** local workflows are stable.

---

## 5. Further improvements (post–MVP)

- Notes: `@glossary` links, search across notes + imports, export (Markdown bundle).
- Flashcards generated from glossary or note highlights.
- Note history / snapshots before large edits.
- Multi-course hub already exists (`UserCourseApp` path); align glossary + notes keys with that model.

### 5.1 Ink / stylus (e.g. Apple Pencil) — feasibility *(not implemented)*

| Context | Realistic? | Notes |
|---------|------------|--------|
| **Study Hub as Electron desktop (Windows/macOS)** | Partially | Pen hardware on **laptop/tablet** surfaces can be handled via **Pointer Events** (`pointerType: "pen"`). **Apple Pencil** targets the **iPad** (or Sidecar display); on a normal MacBook there is no Pencil digitizer. |
| **iPad / Safari / PWA** | Yes | Pointer Events + touch; good separation of pen vs finger. A **canvas ink layer** (vector strokes or raster) is a standard web pattern. |
| **Storage** | Yes | Stroke JSON or PNG/WebP blobs in **IndexedDB** or Electron **userData**; watch quotas for long sessions. |
| **Handwriting → text** | Harder | Needs on-device ML or cloud OCR; not “free” like Markdown. Optional later. |
| **Native Apple Pencil APIs (Swift)** | N/A to stack | Would require a **native** or **Capacitor** shell, not the current Electron+React setup. |

**Catalog recommendation:** Treat **ink** as a **separate layer** from Markdown (e.g. “Sketches” attachment per chapter): canvas component, save strokes or exported image, optional future OCR. Priority: after core notes/import stabilize.

---

## 6. External resources & “call vs build”

Use **mature libraries or embedded viewers** where they save time and maintenance. Prefer **fewer, well-supported** dependencies.

| Need | Option | Role | Tradeoff |
|------|--------|------|----------|
| **UI layout / components** | [React Bootstrap](https://react-bootstrap.github.io/), [MUI](https://mui.com/), or stay **inline styles** (current OM300) | Faster forms, modals, drawers for Notes/Import | Bundle size + theming alignment with existing dark UI |
| **PDF display** | [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla) via `react-pdf` or direct | Reliable in-browser/Electron renderer | WASM/worker setup; large files need care |
| **PDF text extraction** | `pdf-parse` (Node, main process) or PDF.js text layer | Search + glossary pipeline | May miss layout; scans need OCR |
| **PPTX text** | Unzip `ppt/slides/slide*.xml` + XML parse, or **SheetJS** / specialized libs | Slide text without Office | Not full fidelity for charts/images |
| **DOCX** | `mammoth.js` (HTML) or `docx` reader | Readable text in app | Format loss |
| **Ship faster** | **Shell out** to OS default app for “Open in external viewer” | Zero parser risk for v0 | Less integrated UX |

**Recommendation:** For Electron, run **heavy parsing in the main process** (IPC to renderer); use **PDF.js** in renderer if we need integrated viewing + text selection; use **React Bootstrap or a small headless component set** only if we commit to a design system—otherwise extend current styled components to avoid visual clash.

---

## 7. Glossary architecture (target state)

- **Data**: `GlossaryStore` — array or map of `{ id, term, hover, detail[], chapterTags[] }`.
- **Rendering**: `GlossaryTerm` (or auto-link pass) takes **`id` only**; no dependency on “which slide” the text came from.
- **Final + chapters**: both use the **same** store; Final can keep long-form recap copy while still referencing the same IDs.
- **Imports**: extracted plain text runs through a **linker** that wraps known terms (configurable aggressiveness).

---

## 8. Notes architecture (target state)

- **Format (v1)**: **Markdown** — stored as `.md` strings; rendered in-app with a small, safe subset (headings, lists, bold, links). Users can learn gradually; see user-facing help for a one-page cheat sheet.
- **Scope key**: `{ app: "study-hub" | "om300", courseId, sectionId }` (exact names TBD with `userCourseModel` / OM300 chapter ids).
- **Storage**: `localStorage` for small payloads; **Electron `userData`** JSON or SQLite for larger content and import metadata.
- **UX**: visible **Notes** region per section; optional **global “All notes”** list filtered by course/chapter.
- **Privacy**: all local; export optional for user backup.

---

## 9. Blackboard import — user story (v1)

1. User clicks **Import materials** → chooses a **folder** (or ZIP extracted to folder).
2. App scans for **PDF, PPTX, DOCX, HTML** (configurable).
3. User sees **Library** with files; can **assign** a file to an OM300 chapter for quick access (optional).
4. Opening a PDF uses **embedded viewer or OS**; **extracted text** appears when available for search and future glossary highlights.

### 9.1 Why “import library first” (folder + list + open) before heavy conversion

- **De-risks Blackboard variability**: Exports differ by school and version; a **catalog of files the user already has** works regardless of ZIP layout. Parsing can catch up file-by-file type.
- **Immediate value**: Users confirm “my materials are in the app” and can **open** them (embedded or OS) without waiting for text extraction, OCR, or glossary linking.
- **Clear layering**: (1) **Inventory** → (2) **View** → (3) **Extract text** → (4) **Search / glossary / notes links**. Each step is shippable and testable.
- **Avoids blocking on parsers**: PDF/PPTX libraries fail on edge cases; the library UI still works if one file falls back to external viewer.
- **Matches mental model**: “Bring my Blackboard downloads into Study Hub” = **add folder**, see list, open — same as other note apps.

---

## 10. PDF viewing — options (pros / cons)

| Approach | Pros | Cons |
|----------|------|------|
| **A. OS / default app (“Open externally”)** | Fast to ship; zero PDF engine in your bundle; best compatibility for odd PDFs; printing often “just works.” | Context switch; feels less “inside the app”; no unified search UI until text is extracted separately; mobile/Electron UX varies. |
| **B. Embedded PDF.js** | Stays in-app; consistent UI; text selection for copy/paste; pairs well with side-by-side notes; same path in Electron and browser if desired. | Larger bundle + worker setup; performance tuning for huge files; scanned PDFs still need OCR separately; maintenance as PDF.js updates. |
| **C. Hybrid (recommended trajectory)** | v1: library + **open external** OR minimal embed; v2: **PDF.js** for “study mode” when you need in-app reading + notes split. | Two code paths short-term; need clear UX (when embed vs external). |

*Decision timing*: Pick A/B/C at import v1 kickoff; default recommendation in this doc is **C** unless bundle size is critical.

---

## 11. UI direction

- **Decision**: Prefer **Bootstrap (e.g. React Bootstrap)** for **the whole app** where feasible — OM300 and hub screens migrate over time toward shared layout, forms, modals, and nav patterns.
- **Feasibility**: Feasible; cost is a **theming pass** (dark palette, spacing) so new Bootstrap surfaces match existing Study Hub look, then incremental replacement of inline layout chunks rather than one “big bang” rewrite.
- **Status**: Hub + OM300 study chrome migrated (see Phase A). **Materials** still uses offcanvas; **AI assistant** / **UserCourseApp** can follow the same patterns incrementally.

---

## 12. Open decisions (to resolve during implementation)

- [ ] Glossary schema file location and whether OM300 remains one JSON module or per-course files.
- [x] Notes v1: **Markdown** (see §8).
- [x] UI: **Bootstrap-oriented** migration for full app (see §11).
- [ ] Electron-only vs web parity for import (file picker / File System Access API).
- [ ] PDF: embed vs external vs hybrid for v1 (see §10).

---

*Last updated: Bootstrap overhaul (hub + OM300); split notes panel; Phase B paused; ink/stylus feasibility catalog (§5.1).*

Archived note: older import/AI draft text was deleted from the repo root to avoid contradicting this file.
