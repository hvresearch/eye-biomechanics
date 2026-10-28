import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { MUSCLE_NAMES } from "@eye/eye-model";
import { useScene } from "../store/scene";
import { muscleLabel, muscleTooltip } from "../ui/tooltips";
import { Globe } from "./Globe";
import { PALETTE } from "./palette";
import { Target } from "./Target";
import { Transport } from "../ui/Transport";

/** Advances the oculomotor dynamics once per rendered frame while the transport plays. */
function Animator() {
  const playing = useScene((s) => s.playing);
  const tick = useScene((s) => s.tick);
  useFrame((_, delta) => {
    if (playing) tick(delta);
  });
  return null;
}

function HoverLabel() {
  const hovered = useScene((s) => s.hovered);
  const binocular = useScene((s) => s.binocular);
  if (!hovered) return null;
  if (hovered.kind === "structure") return <div className="hover-label">{hovered.label}</div>;
  const e = binocular[hovered.side];
  const i = hovered.index;
  const name = MUSCLE_NAMES[i];
  if (!name) return null;
  const len = e.eomLengthMm[i] ?? Number.NaN;
  const rest = e.eomRestLengthMm[i] ?? Number.NaN;
  return (
    <div className="hover-label muscle" data-testid="muscle-hover">
      <strong>
        {muscleLabel(name)} ({hovered.side} eye)
      </strong>
      <span>
        Length {len.toFixed(1)} mm ({len - rest >= 0 ? "+" : "−"}
        {Math.abs(len - rest).toFixed(2)} mm), activation {(e.eomActivation[i] ?? 0).toFixed(2)}
      </span>
      <small>{muscleTooltip()}</small>
    </div>
  );
}

export function Stage() {
  const preset = useScene((s) => s.eyes.right.label);
  return (
    <div className="stage" data-testid="stage">
      <Canvas
        camera={{ position: [0, 175, 120], fov: 32, near: 1, far: 5000 }}
        gl={{ localClippingEnabled: true, antialias: true }}
        dpr={[1, 2]}
        onCreated={({ gl }) => gl.setClearColor(PALETTE.bg)}
      >
        <hemisphereLight args={["#dfe8ef", "#1a2129", 0.9]} />
        <directionalLight position={[60, 120, -80]} intensity={1.4} />
        <directionalLight position={[-80, -20, -60]} intensity={0.5} />
        <Animator />
        <Globe side="right" cut />
        <Globe side="left" cut={false} />
        <Target />
        <OrbitControls makeDefault target={[0, 0, -5]} enableDamping dampingFactor={0.12} minDistance={40} maxDistance={900} />
      </Canvas>
      <div className="stage-title">
        <h1>Both eyes from above, right eye in axial section</h1>
        <p>{preset}</p>
      </div>
      <HoverLabel />
      <Transport />
    </div>
  );
}
