import { Canvas } from "@react-three/fiber";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { paletteFor } from "./scene/palette";
import { useScene } from "./store/scene";
import "./theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// Set the theme before the first paint so a stored light theme does not flash dark.
document.documentElement.dataset.theme = useScene.getState().theme;

/**
 * `?perf` is the performance test's hook (e2e/perf.spec.ts): `?perf=baseline` renders an empty
 * stage canvas, the frame rate the browser reaches with nothing to draw; any other value renders
 * the app and exposes the store so the test can drive the target the way a drag does.
 */
const perf = new URLSearchParams(window.location.search).get("perf");
if (perf !== null && perf !== "baseline") (window as unknown as { __eyeScene: typeof useScene }).__eyeScene = useScene;

function Baseline() {
  const bg = paletteFor(useScene.getState().theme).bg;
  return (
    <div className="stage" data-testid="stage" style={{ height: "100%" }}>
      <Canvas frameloop="always">
        <color attach="background" args={[bg]} />
      </Canvas>
    </div>
  );
}

createRoot(root).render(<StrictMode>{perf === "baseline" ? <Baseline /> : <App />}</StrictMode>);
