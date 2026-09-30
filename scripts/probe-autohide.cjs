/**
 * Manual auto-hide check. Prints the hide decision every second (titles are never printed).
 *   npx electron scripts/probe-autohide.cjs        (PROBE_SECONDS=10 to stop on its own)
 */
const { app } = require("electron");
const path = require("path");

app.whenReady().then(() => {
  const { snapshot, displays } = require(path.join(__dirname, "..", "electron", "desktop", "winProbe.cjs"));
  const { shouldHide, loadMatchers } = require(path.join(__dirname, "..", "electron", "desktop", "autoHide.cjs"));
  const matchers = loadMatchers();
  setInterval(() => {
    const t = performance.now();
    const snap = snapshot();
    const res = shouldHide(snap, displays(), matchers);
    const ms = (performance.now() - t).toFixed(1);
    process.stdout.write(`${new Date().toLocaleTimeString()} hide=${res.hide} reason=${res.reason || "-"} windows=${snap.windows.length} notif=${snap.notifState} ${ms}ms\n`);
  }, 1000);
  const limit = Number(process.env.PROBE_SECONDS);
  if (limit > 0) setTimeout(() => app.quit(), limit * 1000);
});
app.on("window-all-closed", (e) => e.preventDefault());
