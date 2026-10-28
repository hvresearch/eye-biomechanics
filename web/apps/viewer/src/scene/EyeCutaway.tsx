import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide, Plane, Vector3, type Group } from "three";
import { eyeOptics, useScene, type Side } from "../store/scene";
import { lathe } from "./lathe";
import { globeProfiles, type ProfilePoint } from "./profiles";

/** Sagittal cut in the eye's own frame: keep x ≤ 0 (nasal half), expose the section toward +x. */
const LOCAL_CUT = new Plane(new Vector3(-1, 0, 0), 0);

interface StructureSpec {
  key: keyof ReturnType<typeof globeProfiles>;
  label: string;
  color: string;
  opacity: number;
}

const STRUCTURES: StructureSpec[] = [
  { key: "sclera", label: "Sclera", color: "#ece7df", opacity: 0.95 },
  { key: "retina", label: "Retina", color: "#d77a5a", opacity: 0.95 },
  { key: "vitreous", label: "Vitreous", color: "#d9e6ea", opacity: 0.18 },
  { key: "ciliaryBody", label: "Ciliary body and muscle", color: "#c88a8a", opacity: 0.9 },
  { key: "iris", label: "Iris", color: "#4d6b8a", opacity: 0.95 },
  { key: "lens", label: "Crystalline lens", color: "#f1d9a3", opacity: 0.55 },
  { key: "aqueous", label: "Aqueous humour", color: "#cfe8f2", opacity: 0.16 },
  { key: "cornea", label: "Cornea", color: "#a9d6ea", opacity: 0.45 },
];

/** Structures drawn for an uncut eye (the inner media would be hidden by the sclera anyway). */
const CLOSED = new Set<StructureSpec["key"]>(["sclera", "cornea", "iris"]);

/**
 * One cutaway structure. Its lathe is rebuilt only when its own profile changes, so the
 * cornea, sclera, retina, and ciliary body are not regenerated on every accommodation step.
 */
function Structure({
  spec,
  profile,
  side,
  clip,
}: {
  spec: StructureSpec;
  profile: ProfilePoint[];
  side: Side;
  clip: Plane | null;
}) {
  const setHovered = useScene((s) => s.setHovered);
  const signature = profile.map(([r, z]) => `${r},${z}`).join(";");
  // The signature stands in for the profile's contents, which arrive as a new array each update.
  const geometry = useMemo(() => lathe(profile, clip === null), [signature, clip]);
  // React Three Fiber disposes objects only on unmount, not when a `geometry` prop is
  // replaced, so free each superseded geometry's GPU buffers.
  useEffect(() => () => geometry.dispose(), [geometry]);
  const label = `${spec.label} (${side} eye)`;

  return (
    <mesh
      geometry={geometry}
      name={label}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered({ kind: "structure", label });
      }}
      onPointerOut={() => setHovered(null)}
    >
      <meshStandardMaterial
        color={spec.color}
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
 * from the accommodated surfaces the optics worker returned. With `cut`, the eye is sliced
 * by its own sagittal plane, which follows the globe as it rotates.
 */
export function EyeCutaway({ side, cut }: { side: Side; cut: boolean }) {
  const surfaces = useScene((s) => eyeOptics(s.optics, side)?.surfaces ?? null);
  const params = useScene((s) => s.eyes[side]);
  // Rounded so the near miosis during an animation does not regenerate the eye every frame (drawing only).
  const pupilMm = useScene((s) => Math.round(s.binocular[side].pupilMm / PUPIL_DRAW_STEP_MM) * PUPIL_DRAW_STEP_MM);
  const profiles = useMemo(
    () => (surfaces ? globeProfiles(surfaces, params.axialLengthMm, params.retina.radiusMm, pupilMm) : null),
    [surfaces, params, pupilMm],
  );
  const group = useRef<Group>(null);
  const clip = useMemo(() => (cut ? LOCAL_CUT.clone() : null), [cut]);
  useFrame(() => {
    if (!clip || !group.current) return;
    clip.copy(LOCAL_CUT).applyMatrix4(group.current.matrixWorld);
  });

  if (!profiles) return null;
  return (
    <group ref={group}>
      {STRUCTURES.filter((spec) => cut || CLOSED.has(spec.key)).map((spec) => (
        <Structure key={spec.key} spec={spec} profile={profiles[spec.key]} side={side} clip={clip} />
      ))}
    </group>
  );
}
