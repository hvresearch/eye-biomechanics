import { Polyline } from "./Polyline";
import { GLOBE_RADIUS_MM, quatRotate, type Vec3 } from "@eye/eye-model";
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import drawing from "../../../../../data/anatomy/orbit-drawing.json";
import { useScene, type Side } from "../store/scene";
import type { StructureKey } from "../ui/hoverInfo";
import { ANNULUS_MM } from "./Muscle";
import { usePalette } from "./usePalette";

const ANNULUS = ANNULUS_MM;

type P3 = [number, number, number];

const Y = new Vector3(0, 1, 0);

/** Pointer handlers that show a structure's readout on hover and pin it on click. */
function useStructurePointer(key: StructureKey, side: Side) {
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const target = { kind: "structure", key, side } as const;
  return {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered(target);
    },
    onPointerOut: () => setHovered(null),
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      togglePin(target);
    },
  };
}

/** Orbit outline (rim ellipse plus four lines to the apex), annulus of Zinn, and optic nerve, eye-local frame. */
export function Orbit({ side }: { side: Side }) {
  const palette = usePalette();
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
  // An invisible cylinder along the nerve takes its pointer events (a screen-space line is a poor target).
  const nerve = useMemo(() => {
    const a = new Vector3(...exit);
    const b = new Vector3(...apex);
    const d = b.clone().sub(a);
    return { mid: a.add(b).multiplyScalar(0.5).toArray(), len: d.length(), q: new Quaternion().setFromUnitVectors(Y, d.normalize()) };
  }, [exit[0], exit[1], exit[2], apex[0], apex[1], apex[2]]);
  const orbitPointer = useStructurePointer("orbit", side);
  const annulusPointer = useStructurePointer("annulus", side);
  const nervePointer = useStructurePointer("opticNerve", side);
  return (
    <group>
      <Polyline points={rim} color={palette.orbit} lineWidth={1} transparent opacity={0.8} {...orbitPointer} />
      {ribs.map((pts, i) => (
        <Polyline key={i} points={pts} color={palette.orbit} lineWidth={1} transparent opacity={0.5} {...orbitPointer} />
      ))}
      <mesh position={apex} name={`annulus (${side} eye)`} {...annulusPointer}>
        <torusGeometry args={[drawing.annulus.radiusMm, drawing.annulus.tubeMm, 8, 32]} />
        <meshStandardMaterial color={palette.nerve} roughness={0.7} />
      </mesh>
      <Polyline points={[exit, apex]} color={palette.nerve} lineWidth={n.radiusMm * 2.2} />
      <mesh position={nerve.mid} quaternion={nerve.q} name={`opticNerve (${side} eye)`} {...nervePointer}>
        <cylinderGeometry args={[n.radiusMm, n.radiusMm, nerve.len, 12, 1, true]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
