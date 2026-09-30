/**
 * Dev only: runs one Desktop Nova background Blackboard check now, on your real profile, and prints
 * counts (never titles). Close Study Hub first (single-instance lock).
 *   npx electron scripts/bb-check-now.cjs
 */
const { app } = require("electron");
const path = require("path");

app.setName("Study Hub");
app.setPath("userData", path.join(app.getPath("appData"), "Study Hub"));

const watcherMod = require(path.join(__dirname, "..", "electron", "desktop", "bbWatcher.cjs"));
const create = watcherMod.createBbWatcher;
let watch = null;
watcherMod.createBbWatcher = (deps) => {
  watch = create({
    ...deps,
    check: async (id) => {
      const res = await deps.check(id);
      const p = res.payload || {};
      const submitted = (p.assignments || []).filter((a) => a.submitted).length;
      process.stdout.write(
        `course ${id}: ${res.ok ? "ok" : res.error} ann=${p.announcements?.length ?? "-"} asg=${p.assignments?.length ?? "-"} submitted=${submitted} grades=${p.gradeItems?.length ?? "-"} source=${p.gradeSource ?? "-"}\n`
      );
      return res;
    },
    onEvents: (events) => {
      process.stdout.write(`events: ${events.map((e) => e.kind).join(", ") || "none"}\n`);
      deps.onEvents(events);
    },
    onSession: (s) => {
      process.stdout.write(`session: ${s}\n`);
      deps.onSession(s);
    },
  });
  return watch;
};
require(path.join(__dirname, "..", "electron", "main.cjs"));

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 6000));
  await watch.runOnce();
  process.stdout.write("done\n");
  setTimeout(() => app.exit(0), 8000);
});
