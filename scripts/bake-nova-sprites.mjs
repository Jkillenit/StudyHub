/**
 * Bakes Nova's 3D poses into sprite sheets for Desktop Nova:
 * public/personas/<pack>/sprites/<clip>.png + frames.json.
 *
 *   npx electron scripts/bake-nova-sprites.mjs [packId]
 *
 * Runs src/companion/nova3d/bake.html on a throwaway Vite dev server in a hidden window.
 * Re-run after adding clips to clips.json (scripts/bake-nova-clips.mjs).
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pack = process.argv.find((a, i) => i > 1 && !a.startsWith("-") && !a.endsWith(".mjs")) || "nova";
const OUT = path.join(ROOT, "public", "personas", pack, "sprites");

async function run() {
  const server = await createServer({ root: ROOT, configFile: path.join(ROOT, "vite.config.js"), logLevel: "error", server: { port: 0 } });
  await server.listen();
  const { port } = server.httpServer.address();
  const win = new BrowserWindow({ show: false, width: 400, height: 400, webPreferences: { backgroundThrottling: false } });
  try {
    await win.loadURL(`http://localhost:${port}/src/companion/nova3d/bake.html`);
    for (let i = 0; i < 200; i += 1) {
      if (await win.webContents.executeJavaScript("!!window.bakeReady")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const result = await win.webContents.executeJavaScript("window.bake()");
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, dataUrl] of Object.entries(result.sheets)) {
      fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    }
    delete result.sheets;
    fs.writeFileSync(path.join(OUT, "frames.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`Baked ${Object.keys(result.clips).length} clips to ${path.relative(ROOT, OUT)}\n`);
  } finally {
    win.destroy();
    await server.close();
  }
}

app.whenReady().then(() =>
  run()
    .then(() => app.exit(0))
    .catch((e) => {
      process.stderr.write(`${e?.stack || e}\n`);
      app.exit(1);
    })
);
