/** True when keystrokes belong to a field: input, textarea, select or contentEditable. */
export function isTypingTarget(el) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
}

/** True while the command palette is open. */
export const paletteOpen = () => !!document.querySelector(".sh-palette");
