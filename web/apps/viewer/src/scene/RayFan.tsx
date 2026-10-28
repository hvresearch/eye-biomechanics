import { Line } from "@react-three/drei";
import { eyeOptics, useScene, type Side } from "../store/scene";
import { PALETTE } from "./palette";

/** Traced rays in the eye's sagittal plane (optical frame), plus a marker at the best-focus position. */
export function RayFan({ side }: { side: Side }) {
  const optics = useScene((s) => eyeOptics(s.optics, side));
  if (!optics || optics.fan.length === 0) return null;
  const chief = Math.floor(optics.fan.length / 2);
  return (
    <group>
      {optics.fan.map((line, i) => (
        <Line
          key={i}
          points={line.map(([x, y, z]) => [x, y, z] as [number, number, number])}
          color={i === chief ? PALETTE.accentStrong : PALETTE.accent}
          lineWidth={i === chief ? 1.6 : 1}
          transparent
          opacity={i === chief ? 0.95 : 0.7}
        />
      ))}
      <mesh position={[0, 0, optics.bestFocusZMm]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={PALETTE.warn} />
      </mesh>
    </group>
  );
}
