import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { Vector3 } from "three";
import { useScene } from "../store/scene";
import { InfoCard, Pins, useHoverInfo } from "../ui/Pins";
import { useShortcuts, type ShortcutAction } from "../ui/shortcuts";
import { Transport } from "../ui/Transport";
import { Globe } from "./Globe";
import { PALETTE } from "./palette";
import { Target } from "./Target";
import { VIEW_TRANSITION_S, cameraFor } from "./views";

/** Advances the oculomotor dynamics once per rendered frame while the transport plays. */
function Animator() {
  const playing = useScene((s) => s.playing);
  const tick = useScene((s) => s.tick);
  useFrame((_, delta) => {
    if (playing) tick(delta);
  });
  return null;
}

interface Controls {
  target: Vector3;
  update: () => void;
}

function isControls(c: unknown): c is Controls {
  return typeof c === "object" && c !== null && "target" in c && c.target instanceof Vector3 && "update" in c;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Moves the camera to the snapped clinical view over VIEW_TRANSITION_S, then hands it back to the orbit controls. */
function CameraRig() {
  const view = useScene((s) => s.view);
  const side = useScene((s) => s.cut.side);
  const ipd = useScene((s) => s.scene.ipdMm);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const move = useRef<{ from: Vector3; fromTarget: Vector3; to: Vector3; toTarget: Vector3; up: Vector3; t: number } | null>(null);

  useEffect(() => {
    if (!view) {
      // Back to free orbiting: the orbit controls assume a head-up camera.
      camera.up.set(0, 1, 0);
      move.current = null;
      return;
    }
    if (!isControls(controls)) return;
    const pose = cameraFor(view, side, ipd);
    move.current = {
      from: camera.position.clone(),
      fromTarget: controls.target.clone(),
      to: new Vector3(...pose.position),
      toTarget: new Vector3(...pose.target),
      up: new Vector3(...pose.up),
      t: 0,
    };
    camera.up.copy(move.current.up);
  }, [view, side, ipd, camera, controls]);

  useFrame((_, delta) => {
    const m = move.current;
    if (!m || !isControls(controls)) return;
    m.t = Math.min(1, m.t + delta / VIEW_TRANSITION_S);
    const k = smoothstep(m.t);
    camera.position.lerpVectors(m.from, m.to, k);
    controls.target.lerpVectors(m.fromTarget, m.toTarget, k);
    controls.update();
    if (m.t >= 1) move.current = null;
  });
  return null;
}

function HoverCard() {
  const hovered = useScene((s) => s.hovered);
  const info = useHoverInfo(hovered);
  if (!hovered || !info) return null;
  return (
    <div className="hover-label" data-testid={hovered.kind === "muscle" ? "muscle-hover" : "hover-readout"}>
      <InfoCard info={info} testId="hover-card" />
    </div>
  );
}

export function Stage() {
  const preset = useScene((s) => s.eyes.right.label);
  const view = useScene((s) => s.view);
  const setView = useScene((s) => s.setView);
  const run = useCallback((a: ShortcutAction) => {
    const s = useScene.getState();
    if (a.kind === "view") s.setView(a.view);
    else if (a.kind === "togglePlay") s.setPlaying(!s.playing);
    else s.unpinAll();
  }, []);
  useShortcuts(run);
  const cutSide = useScene((s) => s.cut.side);

  return (
    <div className="stage" data-testid="stage" data-view={view ?? "free"}>
      <Canvas
        camera={{ position: [0, 175, 120], fov: 32, near: 1, far: 5000 }}
        gl={{ localClippingEnabled: true, antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        onCreated={({ gl }) => gl.setClearColor(PALETTE.bg)}
      >
        <hemisphereLight args={["#dfe8ef", "#1a2129", 0.9]} />
        <directionalLight position={[60, 120, -80]} intensity={1.4} />
        <directionalLight position={[-80, -20, -60]} intensity={0.5} />
        <Animator />
        <Globe side="right" />
        <Globe side="left" />
        <Target />
        <OrbitControls
          makeDefault
          target={[0, 0, -5]}
          enableDamping
          dampingFactor={0.12}
          minDistance={40}
          maxDistance={900}
          onStart={() => {
            // A drag leaves the snapped view; the camera's roll returns to head-up.
            if (useScene.getState().view !== null) setView(null);
          }}
        />
        <CameraRig />
      </Canvas>
      <div className="stage-title">
        <h1>Both eyes, {cutSide} eye in section</h1>
        <p>{preset}</p>
      </div>
      <HoverCard />
      <Pins />
      <Transport />
    </div>
  );
}
