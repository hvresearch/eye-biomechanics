import { useMemo } from "react";
import { DoubleSide, LatheGeometry, Plane, Vector2, Vector3 } from "three";
import { useScene } from "../store/scene";
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

function lathe(profile: ProfilePoint[]): LatheGeometry {
  const pts = profile.map(([r, z]) => new Vector2(Math.max(0, r), z));
  const g = new LatheGeometry(pts, 96, 0, Math.PI * 2);
  // LatheGeometry revolves about +Y; rotate so the axis of revolution is world +Z.
  g.rotateX(Math.PI / 2);
  g.scale(1, -1, 1);
  g.computeVertexNormals();
  return g;
}

export function EyeCutaway() {
  const surfaces = useScene((s) => s.derived.surfaces);
  const params = useScene((s) => s.params);
  const setHovered = useScene((s) => s.setHovered);
  const geometries = useMemo(() => {
    const p = globeProfiles(surfaces, params.axialLengthMm, params.retina.radiusMm);
    return STRUCTURES.map((spec) => ({ spec, geometry: lathe(p[spec.key]) }));
  }, [surfaces, params]);

  return (
    <group>
      {geometries.map(({ spec, geometry }) => (
        <mesh
          key={spec.key}
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
      ))}
    </group>
  );
}
