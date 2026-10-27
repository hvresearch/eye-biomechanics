import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useScene } from "../store/scene";
import { EyeCutaway } from "./EyeCutaway";
import { RayFan } from "./RayFan";

export function Stage() {
  const hovered = useScene((s) => (s.hovered?.kind === "structure" ? s.hovered.label : null));
  const preset = useScene((s) => s.eyes.right.label);
  return (
    <div className="stage" data-testid="stage">
      <Canvas
        camera={{ position: [46, 10, 10], fov: 32, near: 0.1, far: 500 }}
        gl={{ localClippingEnabled: true, antialias: true }}
        dpr={[1, 2]}
        onCreated={({ gl }) => gl.setClearColor("#0f1419")}
      >
        <hemisphereLight args={["#dfe8ef", "#1a2129", 0.9]} />
        <directionalLight position={[30, 40, -20]} intensity={1.4} />
        <directionalLight position={[40, -10, 30]} intensity={0.5} />
        <EyeCutaway />
        <RayFan />
        <OrbitControls target={[0, 0, 12]} enableDamping dampingFactor={0.12} minDistance={15} maxDistance={150} />
      </Canvas>
      <div className="stage-title">
        <h1>Right eye, sagittal cutaway</h1>
        <p>{preset}</p>
      </div>
      {hovered && <div className="hover-label">{hovered}</div>}
    </div>
  );
}
