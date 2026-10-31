import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useScene } from "./store/scene";
import "./theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// Set the theme before the first paint so a stored light theme does not flash dark.
document.documentElement.dataset.theme = useScene.getState().theme;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
