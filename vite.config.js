import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

const REMOTE_PWA_FILES = ["manifest.webmanifest", "sw.js", "icon.svg"];

/** Copy Station remote PWA shell assets + a staticRoot-ready folder. */
function stationRemotePwa() {
  return {
    name: "station-remote-pwa",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] || "";
        const match = REMOTE_PWA_FILES.find((f) => url === `/${f}` || url === `/remote/${f}`);
        if (!match) return next();
        const file = path.resolve("remote", match);
        if (!fs.existsSync(file)) return next();
        if (match.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
        if (match.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
        if (match.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const dist = path.resolve("dist");
      if (!fs.existsSync(dist)) return;
      for (const name of REMOTE_PWA_FILES) {
        const src = path.resolve("remote", name);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, name));
      }
      const remoteHtmlPath = path.join(dist, "remote.html");
      if (!fs.existsSync(remoteHtmlPath)) return;
      const out = path.join(dist, "station-remote");
      fs.mkdirSync(out, { recursive: true });
      const html = fs.readFileSync(remoteHtmlPath, "utf8");
      fs.writeFileSync(path.join(out, "index.html"), html);
      const assetsOut = path.join(out, "assets");
      fs.mkdirSync(assetsOut, { recursive: true });
      const needed = new Set();
      for (const match of html.matchAll(/\.\/assets\/([^"']+)/g)) {
        needed.add(match[1]);
      }
      // remote chunk preloads vendor-react / font css; follow one level of imports
      for (const file of [...needed]) {
        const full = path.join(dist, "assets", file);
        if (!fs.existsSync(full) || !file.endsWith(".js")) continue;
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/\.\/([A-Za-z0-9._-]+\.js)/g)) needed.add(m[1]);
        for (const m of src.matchAll(/\.\/([A-Za-z0-9._-]+\.css)/g)) needed.add(m[1]);
      }
      for (const file of needed) {
        const src = path.join(dist, "assets", file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assetsOut, file));
      }
      // font woff/woff2 referenced from copied CSS
      for (const file of fs.readdirSync(assetsOut)) {
        if (!file.endsWith(".css")) continue;
        const css = fs.readFileSync(path.join(assetsOut, file), "utf8");
        for (const m of css.matchAll(/url\(\.?\/?([^)]+\.woff2?)\)/g)) {
          const font = path.basename(m[1].split("?")[0]);
          const src = path.join(dist, "assets", font);
          if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assetsOut, font));
        }
      }
      for (const name of REMOTE_PWA_FILES) {
        const src = path.join(dist, name);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, name));
      }
    },
  };
}

/** Relative base so assets resolve inside Electron (`file:`) and installers. */
export default defineConfig({
  base: "./",
  plugins: [react(), stationRemotePwa()],
  build: {
    rollupOptions: {
      input: { main: "index.html", overlay: "overlay.html", remote: "remote.html" },
      external: ["better-sqlite3", "officeparser", "koffi"],
      output: {
        manualChunks(id) {
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          const vendorTiptap = [
            "@tiptap/react",
            "@tiptap/pm",
            "@tiptap/starter-kit",
            "@tiptap/extension-placeholder",
            "@tiptap/extension-typography",
            "@tiptap/extension-highlight",
            "@tiptap/extension-task-list",
            "@tiptap/extension-task-item",
          ];
          if (vendorTiptap.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
            return "vendor-tiptap";
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    exclude: [...configDefaults.exclude, "ponytail/**"],
  },
});
