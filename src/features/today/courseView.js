const PENDING_KEY = "studyhub.pendingCourseView";

/**
 * Opens a course on a specific view: { tab: 'grades' } or { item: 'qz-deck' }. A course that is
 * mounting picks the view up from sessionStorage; one that is already open gets the event.
 */
export function openCourseView(onOpenCourse, courseId, view) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ courseId, ...view }));
  } catch {
    /* storage unavailable: the event below still covers an open course */
  }
  onOpenCourse(courseId);
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("studyhub-open-content-tab", { detail: { courseId, ...view } }));
  }, 0);
}

/** The pending view for this course, cleared once read. */
export function takePendingCourseView(courseId) {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const view = JSON.parse(raw);
    if (view?.courseId !== courseId) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return view;
  } catch {
    return null;
  }
}
