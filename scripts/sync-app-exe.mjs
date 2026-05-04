/**
 * After electron-builder, keep a stable launcher path at App/Study Hub.exe.
 * Prefer win-unpacked/StudyHub.exe (current electron-builder output), and
 * fall back to the newest *-Portable.exe in release/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const appDir = path.join(root, "App");
const destName = "Study Hub.exe";
const unpackedExe = path.join(releaseDir, "win-unpacked", "StudyHub.exe");
const dest = path.join(appDir, destName);

function main() {
  if (!fs.existsSync(releaseDir)) {
    console.warn("sync-app-exe: release/ missing — run npm run dist:win first.");
    process.exit(0);
  }

  fs.mkdirSync(appDir, { recursive: true });

  const candidates = [];
  if (fs.existsSync(unpackedExe)) candidates.push(unpackedExe);
  const portable = fs
    .readdirSync(releaseDir)
    .filter((f) => f.endsWith("-Portable.exe"))
    .sort((a, b) => fs.statSync(path.join(releaseDir, b)).mtimeMs - fs.statSync(path.join(releaseDir, a)).mtimeMs)[0];
  if (portable) candidates.push(path.join(releaseDir, portable));

  if (!candidates.length) {
    console.warn("sync-app-exe: no StudyHub.exe in win-unpacked and no *-Portable.exe in release/.");
    process.exit(0);
  }

  for (const src of candidates) {
    try {
      fs.copyFileSync(src, dest);
      console.log(`sync-app-exe: copied ${path.basename(src)} → App\\${destName}`);
      process.exit(0);
    } catch (err) {
      console.warn(`sync-app-exe: copy failed from ${path.basename(src)} (${err.code || err.message}); trying next source...`);
    }
  }

  if (fs.existsSync(dest)) {
    console.warn(`sync-app-exe: keeping existing App\\${destName} (new source locked/unavailable).`);
    process.exit(0);
  }
  console.error("sync-app-exe: no usable source executable found for App launcher.");
  process.exit(1);
}

main();
