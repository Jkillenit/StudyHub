/**
 * After electron-builder, copy the portable Windows exe to App/Study Hub.exe
 * so there is always one obvious launch path (no version in filename).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const appDir = path.join(root, "App");
const destName = "Study Hub.exe";

function main() {
  if (!fs.existsSync(releaseDir)) {
    console.warn("sync-app-exe: release/ missing — run npm run dist:win first.");
    process.exit(0);
  }

  const files = fs.readdirSync(releaseDir);
  const portable = files.find((f) => f.endsWith("-Portable.exe"));
  if (!portable) {
    console.warn("sync-app-exe: no *-Portable.exe in release/ (build may have failed).");
    process.exit(0);
  }

  fs.mkdirSync(appDir, { recursive: true });
  const src = path.join(releaseDir, portable);
  const dest = path.join(appDir, destName);
  fs.copyFileSync(src, dest);
  console.log(`sync-app-exe: copied → App\\${destName}`);
}

main();
