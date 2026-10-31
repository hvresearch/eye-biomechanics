import { EOM_TABLE, MUSCLE_NAMES, type MusclePath, type Vec3 } from "@eye/eye-model";
import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, DoubleSide, TubeGeometry, Vector3 } from "three";
import drawing from "../../../../../data/anatomy/orbit-drawing.json";
import { useScene, type Side } from "../store/scene";
import { activationColor } from "./palette";
import { taperedRadius } from "./tube";

const M = drawing.muscle;

/** The common rectus origin (annulus of Zinn), eye-local frame. */
export const ANNULUS_MM: Vec3 = (() => {
  const [x = 0, y = 0, z = 0] = EOM_TABLE.muscles.find((m) => m.name === "lateralRectus")?.originMm ?? [];
  return [x, y, z];
})();

/** Drawing-only belly of the superior oblique, from the annulus to the trochlea (data/anatomy/orbit-drawing.json). */
function obliqueBelly(trochlea: Vec3): MusclePath {
  const mid: Vec3 = [(ANNULUS_MM[0] + trochlea[0]) / 2, (ANNULUS_MM[1] + trochlea[1]) / 2, (ANNULUS_MM[2] + trochlea[2]) / 2];
  const len = Math.hypot(trochlea[0] - ANNULUS_MM[0], trochlea[1] - ANNULUS_MM[1], trochlea[2] - ANNULUS_MM[2]);
  return { points: [ANNULUS_MM, mid, trochlea], lengthMm: len, pullDir: [0, 0, 1], arcMm: 0, tangentPoint: trochlea };
}

/** Tube along a muscle path whose radius tapers from belly to tendon (drawing only); `mirror` flips x (left eye). */
export function taperedTube(path: MusclePath, tendonMm: number, mirror = false): TubeGeometry {
  const sx = mirror ? -1 : 1;
  const pts = path.points.map(([x, y, z]) => new Vector3(sx * x, y, z));
  const curve = new CatmullRomCurve3(pts, false, "centripetal");
  const g = new TubeGeometry(curve, M.tubularSegments, 1, M.radialSegments, false);
  const pos = g.getAttribute("position");
  const tendonFraction = path.lengthMm > 0 ? tendonMm / path.lengthMm : 0;
  const c = new Vector3();
  const v = new Vector3();
  const ring = M.radialSegments + 1;
  for (let i = 0; i <= M.tubularSegments; i++) {
    const u = i / M.tubularSegments;
    curve.getPointAt(u, c);
    const r = taperedRadius(u, M.bellyRadiusMm, M.tendonRadiusMm, tendonFraction);
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** One extraocular muscle in its eye's local frame, colored by activation (the hot token). */
export function Muscle({ side, index }: { side: Side; index: number }) {
  const path = useScene((s) => s.binocular[side].eomPaths[index]);
  const activation = useScene((s) => s.binocular[side].eomActivation[index] ?? 0);
  const theme = useScene((s) => s.theme);
  const tendonMm = useScene(
    (s) => s.eyes[side].extraocularMuscles?.find((m) => m.name === MUSCLE_NAMES[index])?.tendon.slackLengthMm ?? 0,
  );
  const hovered = useScene((s) => s.hovered?.kind === "muscle" && s.hovered.side === side && s.hovered.index === index);
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const isSO = MUSCLE_NAMES[index] === "superiorOblique";
  // The superior oblique's modeled path (trochlea to insertion) is all tendon.
  const mirror = side === "left";
  const geometry = useMemo(
    () => (path ? taperedTube(path, isSO ? path.lengthMm : tendonMm, mirror) : null),
    [path, tendonMm, isSO, mirror],
  );
  const origin = path?.points[0];
  const bellyKey = origin ? origin.join(",") : "";
  const belly = useMemo(() => (isSO && origin ? taperedTube(obliqueBelly(origin), 0, mirror) : null), [isSO, bellyKey, mirror]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => belly?.dispose(), [belly]);
  if (!geometry) return null;
  const material = (
    <meshStandardMaterial
      color={activationColor(activation, theme)}
      emissive={activationColor(activation, theme)}
      emissiveIntensity={hovered ? 0.45 : 0.12 + 0.25 * activation}
      roughness={0.6}
      side={DoubleSide}
    />
  );
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered({ kind: "muscle", side, index });
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        e.stopPropagation();
        togglePin({ kind: "muscle", side, index });
      }}
    >
      <mesh geometry={geometry} name={`${side} ${MUSCLE_NAMES[index]}`}>
        {material}
      </mesh>
      {belly && (
        <mesh geometry={belly} name={`${side} superiorOblique belly`}>
          {material}
        </mesh>
      )}
    </group>
  );
}
