import { anchorNames } from "../anchors.js";

/** Dev check that the Stage works end to end: she walks to the lowest gauge, points, highlights, and pulls Standing forward. */
export async function stageDemo(stage) {
  await stage.openTab("hub:plan");
  if (!(await stage.find("panel.standing"))) return;
  const gauge = anchorNames("course.", ".gauge")[0];
  if (!gauge) {
    await stage.say("No grades yet. Sync Blackboard and I'll have something to point at.");
    return;
  }
  const status = (await stage.find(gauge))?.querySelector(".sh-gauge-status")?.textContent;
  await stage.walkTo(gauge);
  await stage.pointAt(gauge);
  await stage.highlight(gauge, "warn");
  await stage.say("This one. Look at it.");
  await stage.focusPanel("panel.standing");
  if (status) await stage.pinNote(gauge, status);
  await stage.emote("smug");
  await stage.lookAt("user");
  await stage.wait("input");
  await stage.unfocus();
  await stage.clearHighlights();
}
