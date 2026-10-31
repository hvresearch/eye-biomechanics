import { useEffect, useMemo } from "react";
import { DoubleSide, type Plane } from "three";
import { eyeOptics, useScene, type Side } from "../store/scene";
import type { StructureKey } from "../ui/hoverInfo";
import { lathe } from "./lathe";
import type { StructureColors } from "./palette";
import { usePalette } from "./usePalette";
import { globeProfiles, type ProfilePoint } from "./profiles";

interface StructureSpec {
  key: keyof ReturnType<typeof globeProfiles> & keyof StructureColors;
  hover: StructureKey;
  opacity: number;
}

const STRUCTURES: StructureSpec[] = [
  { key: "sclera", hover: "sclera", opacity: 0.95 },
  { key: "retina", hover: "retina", opacity: 0.95 },
  { key: "vitreous", hover: "vitreous", opacity: 0.18 },
  { key: "ciliaryBody", hover: "ciliary", opacity: 0.9 },
  { key: "zonules", hover: "zonules", opacity: 0.6 },
  { key: "iris", hover: "iris", opacity: 0.95 },
  { key: "lens", hover: "lens", opacity: 0.55 },
  { key: "aqueous", hover: "aqueous", opacity: 0.16 },
  { key: "cornea", hover: "cornea", opacity: 0.45 },
];

/** Structures drawn for an uncut eye (the inner media would be hidden by the sclera anyway). */
const CLOSED = new Set<StructureSpec["key"]>(["sclera", "cornea", "iris"]);

/**
 * One cutaway structure. Its lathe is rebuilt only when its own profile changes, so the
 * cornea, sclera, retina, and ciliary body are not regenerated on every accommodation step.
 * Hover shows its readout; a click pins it.
 */
function Structure({ spec, profile, side, clip }: { spec: StructureSpec; profile: ProfilePoint[]; side: Side; clip: Plane | null }) {
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const signature = profile.map(([r, z]) => `${r},${z}`).join(";");
  // The signature stands in for the profile's contents, which arrive as a new array each update.
  // The whole revolution is built: the cut plane may have any orientation.
  const geometry = useMemo(() => lathe(profile, true), [signature]);
  // React Three Fiber disposes objects only on unmount, not when a `geometry` prop is
  // replaced, so free each superseded geometry's GPU buffers.
  useEffect(() => () => geometry.dispose(), [geometry]);
  const target = { kind: "structure", key: spec.hover, side } as const;
  const color = usePalette().structures[spec.key];

  return (
    <mesh
      geometry={geometry}
      name={`${spec.hover} (${side} eye)`}
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
      <meshStandardMaterial
        color={color}
        transparent={spec.opacity < 1}
        opacity={spec.opacity}
        roughness={0.55}
        metalness={0}
        side={DoubleSide}
        clippingPlanes={clip ? [clip] : []}
        depthWrite={spec.opacity > 0.5}
      />
    </mesh>
  );
}

/** Resolution of the drawn pupil, mm (a drawing choice). */
const PUPIL_DRAW_STEP_MM = 0.05;

/**
 * One eye's anterior segment and globe, drawn in the optical frame (corneal vertex at z = 0)
 * from the accommodated surfaces the optics worker returned. With `clip` (a world-space plane
 * the parent keeps in step with the globe), the eye is cut and every inner structure drawn.
 */
export function EyeCutaway({ side, clip }: { side: Side; clip: Plane | null }) {
  const surfaces = useScene((s) => eyeOptics(s.optics, side)?.surfaces ?? null);
  const params = useScene((s) => s.eyes[side]);
  // Rounded so the near miosis during an animation does not regenerate the eye every frame (drawing only).
  const pupilMm = useScene((s) => Math.round(s.binocular[side].pupilMm / PUPIL_DRAW_STEP_MM) * PUPIL_DRAW_STEP_MM);
  const profiles = useMemo(
    () => (surfaces ? globeProfiles(surfaces, params.axialLengthMm, params.retina.radiusMm, pupilMm) : null),
    [surfaces, params, pupilMm],
  );

  if (!profiles) return null;
  return (
    <group>
      {STRUCTURES.filter((spec) => clip !== null || CLOSED.has(spec.key)).map((spec) => (
        <Structure key={spec.key} spec={spec} profile={profiles[spec.key]} side={side} clip={clip} />
      ))}
    </group>
  );
}
