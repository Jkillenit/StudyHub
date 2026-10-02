/** "/" menu in the message box. Picking one fills the box with plain text the parser understands. */
export const SLASH = [
  { cmd: "/quiz", hint: "Quiz me on a course", text: "quiz me " },
  { cmd: "/focus", hint: "Focus timer", text: "focus 25" },
  { cmd: "/open", hint: "Open a course or tab", text: "open " },
  { cmd: "/due", hint: "What's due this week", text: "what's due this week" },
  { cmd: "/next", hint: "What should I do next", text: "what's next" },
  { cmd: "/grades", hint: "Where my grades stand", text: "grades" },
];

export function slashMatches(q) {
  if (!q.startsWith("/") || /\s/.test(q)) return [];
  const w = q.slice(1).toLowerCase();
  return SLASH.filter((s) => s.cmd.slice(1).startsWith(w));
}
