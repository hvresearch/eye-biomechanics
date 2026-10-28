import { Line } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { gazeDirection, quatRotate, PRIMARY_DIRECTION } from "@eye/eye-model";
import { useState } from "react";
import drawing from "../../../../../data/anatomy/orbit-drawing.json";
import { useScene } from "../store/scene";
import { dragToTarget } from "./dragTarget";
import { PALETTE } from "./palette";

const MAX_DRAW_MM = drawing.targetDrawing.maxDrawDistanceMm;
type P3 = [number, number, number];

interface Controls {
  enabled: boolean;
}

/**
 * The fixation target, drawn at its direction and at its distance up to MAX_DRAW_MM (farther
 * targets sit at that radius, labeled with their true distance). Dragging moves it in its
 * frontal plane; beyond the drawn radius a drag changes only the direction. Lines of sight
 * run from each eye's center of rotation along its current gaze.
 */
export function Target() {
  const scene = useScene((s) => s.scene);
  const binocular = useScene((s) => s.binocular);
  const setTarget = useScene((s) => s.setTarget);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const [dragging, setDragging] = useState(false);

  const dir = gazeDirection({ xDeg: scene.targetDirectionDeg.x, yDeg: scene.targetDirectionDeg.y });
  const trueMm = scene.targetDistanceM * 1000;
  const drawMm = Math.min(trueMm, MAX_DRAW_MM);
  const far = trueMm > MAX_DRAW_MM;
  const p: P3 = [dir[0] * drawMm, dir[1] * drawMm, dir[2] * drawMm];

  const half = scene.ipdMm / 2;
  const sight = (side: "left" | "right"): P3[] => {
    const e = binocular[side];
    const local = quatRotate(e.gaze, PRIMARY_DIRECTION);
    const head: P3 = side === "right" ? [local[0], local[1], local[2]] : [-local[0], local[1], local[2]];
    const c: P3 = [side === "right" ? half : -half, 0, 0];
    // Along the current gaze (which lags the target during a saccade) as far as the drawn target.
    const len = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    return [c, [c[0] + head[0] * len, c[1] + head[1] * len, c[2] + head[2] * len]];
  };

  const end = () => {
    setDragging(false);
    if (controls) controls.enabled = true;
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    const o = e.ray.origin;
    const d = e.ray.direction;
    const hit = dragToTarget([o.x, o.y, o.z], [d.x, d.y, d.z], p[2]);
    if (!hit) return;
    setTarget(far ? { distanceM: scene.targetDistanceM, directionDeg: hit.directionDeg } : hit);
  };

  return (
    <group>
      <Line points={sight("right")} color={PALETTE.accent} lineWidth={1} dashed dashSize={4} gapSize={3} transparent opacity={0.6} />
      <Line points={sight("left")} color={PALETTE.accent} lineWidth={1} dashed dashSize={4} gapSize={3} transparent opacity={0.6} />
      <mesh
        position={p}
        name="Target"
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragging(true);
          if (controls) controls.enabled = false;
        }}
        onPointerUp={end}
      >
        <sphereGeometry args={[drawing.targetDrawing.radiusMm, 24, 24]} />
        <meshStandardMaterial color={PALETTE.warn} emissive={PALETTE.warn} emissiveIntensity={dragging ? 0.6 : 0.25} />
      </mesh>
      {dragging && (
        // An invisible frontal plane through the target catches the pointer while dragging.
        <mesh position={[0, 0, p[2]]} onPointerMove={move} onPointerUp={end} onPointerLeave={end}>
          <planeGeometry args={[4000, 4000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={2} />
        </mesh>
      )}
    </group>
  );
}
