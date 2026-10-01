import { openInBlackboard } from "../mirror/openInBlackboard.js";
import { openCourseView } from "./courseView.js";

/** Runs a Today item's action (see priority.js `action`). */
export function runTodayAction(action, onOpenCourse) {
  if (!action) return;
  if (action.type === "blackboard") openInBlackboard(action.url);
  else if (action.type === "review") openCourseView(onOpenCourse, action.courseUuid, { item: "qz-deck" });
  else if (action.type === "grades") openCourseView(onOpenCourse, action.courseUuid, { tab: "grades" });
  else onOpenCourse(action.courseUuid);
}
