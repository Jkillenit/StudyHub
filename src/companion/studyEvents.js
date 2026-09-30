/** Study tools report progress here; Nova listens for XP and reactions. Safe when she's off. */
export const STUDY_EVENT = "studyhub-study-event";

/** `{ type: "card", correct }` or `{ type: "test", correct, total }`. */
export function emitStudyEvent(detail) {
  window.dispatchEvent(new CustomEvent(STUDY_EVENT, { detail }));
}
