import { useEffect, useMemo } from "react";
import { DoubleSide, Plane, Vector3 } from "three";
import { useScene } from "../store/scene";
import { lathe } from "./lathe";
import { globeProfiles, type ProfilePoint } from "./profiles";

/** Sagittal cut: keep x ≤ 0 (nasal half of the right eye), expose the section toward +x. */
export const CUT_PLANE = new Plane(new Vector3(-1, 0, 0), 0);

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

/**
 * One cutaway structure. Its lathe is rebuilt only when its own profile changes, so the
 * cornea, sclera, retina, and ciliary body are not regenerated on every accommodation step.
 */
function Structure({ spec, profile }: { spec: StructureSpec; profile: ProfilePoint[] }) {
  const setHovered = useScene((s) => s.setHovered);
  const signature = profile.map(([r, z]) => `${r},${z}`).join(";");
  // The signature stands in for the profile's contents, which arrive as a new array each update.
  const geometry = useMemo(() => lathe(profile), [signature]);
  // React Three Fiber disposes objects only on unmount, not when a `geometry` prop is
  // replaced, so free each superseded geometry's GPU buffers.
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      name={spec.label}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(spec.label);
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
        clippingPlanes={[CUT_PLANE]}
        depthWrite={spec.opacity > 0.5}
      />
    </mesh>
  );
}

export function EyeCutaway() {
  const surfaces = useScene((s) => s.derived.surfaces);
  const params = useScene((s) => s.params);
  const profiles = useMemo(
    () => globeProfiles(surfaces, params.axialLengthMm, params.retina.radiusMm),
    [surfaces, params],
  );

  return (
    <group>
      {STRUCTURES.map((spec) => (
        <Structure key={spec.key} spec={spec} profile={profiles[spec.key]} />
      ))}
    </group>
  );
}
