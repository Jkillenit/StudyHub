import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Relative base so assets resolve inside Electron (`file:`) and installers. */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
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
});
