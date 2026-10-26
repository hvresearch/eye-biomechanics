import { Line } from "@react-three/drei";
import { useScene } from "../store/scene";

/** Traced rays in the sagittal plane, plus a marker at the best-focus position. */
export function RayFan() {
  const optics = useScene((s) => s.optics);
  if (!optics) return null;
  const chief = Math.floor(optics.fan.length / 2);
  return (
    <group>
      {optics.fan.map((line, i) => (
        <Line
          key={i}
          points={line.map(([x, y, z]) => [x, y, z] as [number, number, number])}
          color={i === chief ? "#8fe0dd" : "#6fc3c1"}
          lineWidth={i === chief ? 1.6 : 1}
          transparent
          opacity={i === chief ? 0.95 : 0.7}
        />
      ))}
      <mesh position={[0, 0, optics.bestFocusZMm]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#e0b35a" />
      </mesh>
    </group>
  );
}
