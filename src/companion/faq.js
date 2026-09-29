/**
 * Scout's answer sheet until an API key is set. `pointTo` must be a data-tour-id;
 * `route` says where it lives ("hub" or "course") so Scout can take the student there first.
 */
export const FAQ = [
  {
    id: "sync-bb",
    q: "How do I sync Blackboard?",
    a: "Connect Blackboard once on the home screen, then hit Sync. Assignments, announcements, grades and files come over.",
    keywords: ["blackboard", "sync", "bb", "connect", "login", "import"],
    pointTo: "hub-blackboard",
    route: "hub",
  },
  {
    id: "add-course",
    q: "How do I add a course?",
    a: "Express Import builds a course from a PowerPoint. Manual Setup makes an empty one you can fill yourself.",
    keywords: ["add", "course", "new", "create", "class", "setup"],
    pointTo: "hub-add-course",
    route: "hub",
  },
  {
    id: "import-slides",
    q: "How do I turn slides into flashcards?",
    a: "Use Express Import with a .pptx. I pull out definitions, sections and formulas, and the definitions become flashcards.",
    keywords: ["slides", "pptx", "powerpoint", "flashcards", "import", "make", "cards", "lecture"],
    pointTo: "hub-add-course",
    route: "hub",
  },
  {
    id: "whats-due",
    q: "Where do I see what's due?",
    a: "The Today dashboard on the home screen lists everything due in the next two weeks across all your classes.",
    keywords: ["due", "deadline", "assignment", "homework", "today", "upcoming", "week"],
    pointTo: "today-due",
    route: "hub",
  },
  {
    id: "calendar",
    q: "Is there a calendar?",
    a: "Yep. Flip the Today dashboard to Calendar for a month view. You can add your own items too.",
    keywords: ["calendar", "month", "schedule", "date", "plan"],
    pointTo: "today-views",
    route: "hub",
  },
  {
    id: "flashcards",
    q: "How do flashcards work here?",
    a: "Open a course, then Flashcard Deck under Drill. Rate each card and spaced repetition decides when you see it again.",
    keywords: ["flashcard", "flashcards", "deck", "review", "drill", "spaced", "repetition", "sm2", "study"],
    pointTo: "course-drill",
    route: "course",
    tour: "course-tools",
  },
  {
    id: "practice-test",
    q: "Can I take a practice test?",
    a: "Inside a course, pick Practice Test under Drill. Choose modules, question count and format, then go.",
    keywords: ["practice", "test", "exam", "quiz", "questions", "mock"],
    pointTo: "course-drill",
    route: "course",
  },
  {
    id: "study-guide",
    q: "How do I make a study guide?",
    a: "Study Guide under Drill builds a printable guide from the modules you pick, plus a time estimate for your exam.",
    keywords: ["study", "guide", "print", "exam", "review", "summary", "estimate"],
    pointTo: "course-drill",
    route: "course",
  },
  {
    id: "grades",
    q: "Where are my grades?",
    a: "Recent grades show on the Today dashboard. Inside a course, the Grades tab has the full breakdown and a what-if calculator.",
    keywords: ["grade", "grades", "score", "gpa", "calculator", "what", "if", "percent"],
    pointTo: "course-tabs",
    route: "course",
  },
  {
    id: "progress",
    q: "How do I see my progress?",
    a: "Progress under Drill shows your review history, mastery per module, and recent sessions.",
    keywords: ["progress", "stats", "mastery", "history", "streak"],
    pointTo: "course-drill",
    route: "course",
  },
  {
    id: "palette",
    q: "Is there a faster way to get around?",
    a: "Ctrl+K opens the command palette. Type a course or chapter and jump straight there.",
    keywords: ["shortcut", "keyboard", "palette", "fast", "search", "jump", "navigate", "ctrl"],
    pointTo: "titlebar-palette",
  },
  {
    id: "quiz-scout",
    q: "Can you quiz me?",
    a: "Absolutely. Pick Quiz me from my menu and I'll run your flashcards as a game. My lantern tracks your streak.",
    keywords: ["quiz", "game", "scout", "light", "run", "streak", "play"],
    action: "quiz",
  },
  {
    id: "api-key",
    q: "How do I give you a brain upgrade?",
    a: "Add an Anthropic API key in the AI assistant. Then I can answer anything about the app and grade typed answers smarter.",
    keywords: ["api", "key", "ai", "claude", "anthropic", "smart", "brain", "chat"],
    action: "open-ai",
  },
  {
    id: "privacy",
    q: "Where is my data stored?",
    a: "Right here on your computer, in a local database. Nothing goes to a server unless you add an API key for AI features.",
    keywords: ["data", "privacy", "private", "local", "stored", "cloud", "safe", "save"],
  },
  {
    id: "scout-settings",
    q: "How do I change or hide you?",
    a: "Click SCOUT in the title bar. You can turn me off, slow me down, resize me, or swap accessories.",
    keywords: ["hide", "scout", "settings", "turn", "off", "move", "size", "annoying", "stop"],
    pointTo: "titlebar-scout",
  },
];

export const POPULAR = ["sync-bb", "flashcards", "whats-due", "quiz-scout"];

const tokens = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

const STOP = new Set(["how", "do", "the", "to", "is", "can", "my", "where", "what", "does", "an", "it", "in", "of", "for", "me", "you"]);

/** Rank FAQ entries for a free-text question. Empty query returns the popular ones. */
export function searchFaq(query, limit = 4) {
  const q = tokens(query).filter((t) => !STOP.has(t));
  if (!q.length) return POPULAR.map((id) => FAQ.find((f) => f.id === id)).filter(Boolean);
  const scored = FAQ.map((f) => {
    const kw = new Set(f.keywords);
    const qt = new Set(tokens(f.q));
    let score = 0;
    for (const t of q) {
      if (kw.has(t)) score += 2;
      else if (qt.has(t)) score += 1.5;
      else if ([...kw].some((k) => k.startsWith(t) || t.startsWith(k))) score += 1;
    }
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.f);
}
