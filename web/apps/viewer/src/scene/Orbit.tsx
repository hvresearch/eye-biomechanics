import { Line } from "@react-three/drei";
import { GLOBE_RADIUS_MM, quatRotate, type Vec3 } from "@eye/eye-model";
import { useMemo } from "react";
import drawing from "../../../../../data/anatomy/orbit-drawing.json";
import { useScene, type Side } from "../store/scene";
import { ANNULUS_MM } from "./Muscle";
import { PALETTE } from "./palette";

const ANNULUS = ANNULUS_MM;

type P3 = [number, number, number];

/** Orbit outline (rim ellipse plus four lines to the apex), annulus of Zinn, and optic nerve, eye-local frame. */
export function Orbit({ side }: { side: Side }) {
  const gaze = useScene((s) => s.binocular[side].gaze);
  const sx = side === "left" ? -1 : 1; // eye-local x is temporal; the left eye's temporal side is head −x
  const o = drawing.orbit;
  const rim = useMemo(() => {
    const pts: P3[] = [];
    for (let i = 0; i <= o.rimSegments; i++) {
      const a = (2 * Math.PI * i) / o.rimSegments;
      pts.push([o.rimHalfWidthMm * Math.cos(a), o.rimHalfHeightMm * Math.sin(a), o.rimZMm]);
    }
    return pts;
  }, [o]);
  const apex: P3 = [sx * ANNULUS[0], ANNULUS[1], ANNULUS[2]];
  const ribs: P3[][] = [0, 0.25, 0.5, 0.75].map((f) => {
    const a = 2 * Math.PI * f;
    return [[o.rimHalfWidthMm * Math.cos(a), o.rimHalfHeightMm * Math.sin(a), o.rimZMm], apex];
  });
  // The nerve leaves the globe nasal to the posterior pole and rotates with it.
  const n = drawing.opticNerve;
  const exitLocal: Vec3 = [-n.exitOffsetNasalMm, 0, Math.sqrt(GLOBE_RADIUS_MM ** 2 - n.exitOffsetNasalMm ** 2)];
  const e = quatRotate(gaze, exitLocal);
  const exit: P3 = [sx * e[0], e[1], e[2]];
  return (
    <group>
      <Line points={rim} color={PALETTE.orbit} lineWidth={1} transparent opacity={0.8} />
      {ribs.map((pts, i) => (
        <Line key={i} points={pts} color={PALETTE.orbit} lineWidth={1} transparent opacity={0.5} />
      ))}
      <mesh position={apex} name={`Annulus of Zinn (${side} eye)`}>
        <torusGeometry args={[drawing.annulus.radiusMm, drawing.annulus.tubeMm, 8, 32]} />
        <meshStandardMaterial color={PALETTE.nerve} roughness={0.7} />
      </mesh>
      <Line points={[exit, apex]} color={PALETTE.nerve} lineWidth={n.radiusMm * 2.2} />
    </group>
  );
}
