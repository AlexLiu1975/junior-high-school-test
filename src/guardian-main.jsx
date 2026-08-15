import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import GuardianApp from "./guardian/GuardianApp.jsx";

createRoot(document.getElementById("guardian-root")).render(
  <StrictMode>
    <GuardianApp />
  </StrictMode>,
);
