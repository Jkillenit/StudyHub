import { playScene } from "../stage.js";
import { workspace } from "../workspace.js";

const LINES = { briefing: "arrangeBriefing", grades: "arrangeGrades", tidy: "arrangeTidy" };

/** She announces the layout, then moves the panels herself one by one. */
const arrangeScene = (name) => async (stage) => {
  await stage.openTab("hub:plan");
  await stage.say(LINES[name]);
  await stage.arrange(name);
  await stage.lookAt("user");
};

/** Rearrange Today into a named layout: Nova does it when she can, otherwise it just happens. */
export function arrangeWorkspace(name) {
  if (!playScene(arrangeScene(name))) workspace.apply(name);
}
