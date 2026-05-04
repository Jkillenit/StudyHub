import { createRoot } from "react-dom/client";
import { StudyHubApp } from "./app/StudyHubApp.jsx";
import "bootstrap/dist/css/bootstrap.min.css";
import "./studyhub-bootstrap.css";
import "./index.css";

createRoot(document.getElementById("root")).render(<StudyHubApp />);
