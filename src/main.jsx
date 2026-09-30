import { createRoot } from "react-dom/client";
import { StudyHubApp } from "./app/StudyHubApp.jsx";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./studyhub-bootstrap.css";
import "./index.css";
import { applyStoredMotionPref } from "./shell/motion.js";

applyStoredMotionPref();

createRoot(document.getElementById("root")).render(<StudyHubApp />);
