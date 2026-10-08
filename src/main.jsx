import { createRoot } from "react-dom/client";
import { StudyHubApp } from "./app/StudyHubApp.jsx";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./studyhub-bootstrap.css";
import "./index.css";
import { applyStoredMotionPref } from "./shell/motion.js";
import { applyStoredPack } from "./shell/pack.js";

applyStoredMotionPref();
applyStoredPack();

createRoot(document.getElementById("root")).render(<StudyHubApp />);
