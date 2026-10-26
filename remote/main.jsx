import { createRoot } from "react-dom/client";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "./styles.css";
import App from "./App.jsx";

const root = document.getElementById("root");
createRoot(root).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "./";
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      // SW is best-effort; offline still uses last briefing in localStorage
    });
  });
}
