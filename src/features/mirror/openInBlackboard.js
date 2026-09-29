/** Opens a Blackboard URL in the signed-in Blackboard window (never the system browser, which has no session). */
export function openInBlackboard(url) {
  if (!url) return;
  void window.studyHub?.blackboard?.openUrl?.(url);
}
