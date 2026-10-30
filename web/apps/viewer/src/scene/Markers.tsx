import { Line } from "@react-three/drei";
import { MUSCLE_NAMES, musclesFromDocument } from "@eye/eye-model";
import { useMemo } from "react";
import { useScene, type Side } from "../store/scene";
import { insertionArc } from "./markers";
import { PALETTE } from "./palette";

/** Drawn size of a pulley marker, mm (drawing). */
const PULLEY_MARKER_MM = 0.9;
/** Screen width of an insertion arc, px (drawing). */
const INSERTION_LINE_PX = 3;

function InsertionMarker({ side, index, widthMm }: { side: Side; index: number; widthMm: number }) {
  const path = useScene((s) => s.binocular[side].eomPaths[index]);
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const sx = side === "left" ? -1 : 1;
  const pts = useMemo(() => (path ? insertionArc(path, widthMm).map(([x, y, z]) => [sx * x, y, z] as [number, number, number]) : []), [path, widthMm, sx]);
  if (pts.length < 2) return null;
  const target = { kind: "marker", side, index, marker: "insertion" } as const;
  return (
    <Line
      points={pts}
      color={PALETTE.nerve}
      lineWidth={INSERTION_LINE_PX}
      name={`${side} ${MUSCLE_NAMES[index]} insertion`}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(target);
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        e.stopPropagation();
        togglePin(target);
      }}
    />
  );
}

/**
 * Insertion and pulley markers for one eye's muscles, in the eye's local frame (x mirrored
 * for the left eye). Insertions are arcs as wide as the tabled insertion and turn with the
 * globe; pulleys are drawn only where the document gives coordinates (the default table has
 * none: "fixed pulleys not tabled").
 */
export function Markers({ side }: { side: Side }) {
  const eye = useScene((s) => s.eyes[side]);
  const muscles = useMemo(() => musclesFromDocument(eye), [eye]);
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const sx = side === "left" ? -1 : 1;
  return (
    <group>
      {muscles.map((m, i) => (
        <InsertionMarker key={m.name} side={side} index={i} widthMm={m.insertionWidthMm} />
      ))}
      {muscles.map((m, i) => {
        if (!m.pulleyMm) return null;
        const target = { kind: "marker", side, index: i, marker: "pulley" } as const;
        return (
          <mesh
            key={`${m.name}-pulley`}
            position={[sx * m.pulleyMm[0], m.pulleyMm[1], m.pulleyMm[2]]}
            name={`${side} ${m.name} pulley`}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(target);
            }}
            onPointerOut={() => setHovered(null)}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(target);
            }}
          >
            <octahedronGeometry args={[PULLEY_MARKER_MM]} />
            <meshStandardMaterial color={PALETTE.nerve} roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}
