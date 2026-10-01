import { createRoot } from "react-dom/client";
import { StudyHubApp } from "./app/StudyHubApp.jsx";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/michroma/400.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./studyhub-bootstrap.css";
import "./index.css";
import { applyStoredMotionPref } from "./shell/motion.js";

applyStoredMotionPref();

createRoot(document.getElementById("root")).render(<StudyHubApp />);
