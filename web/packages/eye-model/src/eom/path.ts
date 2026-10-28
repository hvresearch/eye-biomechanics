import { add, cross, distance, dot, norm, normalize, scale, sub, type Vec3 } from "../math/vec";
import { quatRotate, type Quat } from "../math/quat";
import { GLOBE_RADIUS_MM, type EomMuscle } from "./geometry";

export interface MusclePath {
  /** Origin, pulley (if any), tangent point, arc samples, insertion; mm, eye-local frame. */
  points: Vec3[];
  lengthMm: number;
  /** Unit direction of pull on the globe: from the tangent point (or insertion) toward the free end. */
  pullDir: Vec3;
  /** Length of the wrap over the globe (arc of contact), mm; 0 when the muscle does not wrap. */
  arcMm: number;
  /** Where the muscle leaves the globe (the insertion when there is no wrap). */
  tangentPoint: Vec3;
}

/** Any unit vector perpendicular to a (for the degenerate antipodal case). */
function perpendicular(a: Vec3): Vec3 {
  const trial: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(a, trial));
}

/**
 * Path of one muscle with the eye oriented by `gaze` (rotation about the globe center, taken
 * as the center of rotation: an approximation). The origin and pulley are fixed in the orbit;
 * the insertion rotates with the globe. From its free end (the pulley when present, else the
 * origin) the muscle runs straight to the tangent point on the sphere, in the plane through
 * the globe center, the free end, and the insertion, then follows the great circle to the
 * insertion. When the straight segment from the free end to the insertion stays outside the
 * sphere there is no wrap.
 */
export function musclePath(m: EomMuscle, gaze: Quat, globeRadiusMm = GLOBE_RADIUS_MM, arcSamples = 16): MusclePath {
  const R = globeRadiusMm;
  const ins = quatRotate(gaze, m.insertionMm);
  const free = m.pulleyMm ?? m.originMm;
  const head: Vec3[] = m.pulleyMm ? [m.originMm, m.pulleyMm] : [m.originMm];
  const pre = m.pulleyMm ? distance(m.originMm, m.pulleyMm) : 0;
  const f = norm(free);
  if (!(f > R)) throw new RangeError(`${m.name}: the muscle's free end lies inside the globe`);

  // The segment free→insertion arrives from inside the sphere iff ins·free < R².
  if (dot(ins, free) >= R * R) {
    return {
      points: [...head, ins],
      lengthMm: pre + distance(free, ins),
      pullDir: normalize(sub(free, ins)),
      arcMm: 0,
      tangentPoint: ins,
    };
  }

  // In-plane basis: e1 toward the free end, e2 toward the insertion's side.
  const e1 = scale(free, 1 / f);
  const nRaw = cross(free, ins);
  const n = norm(nRaw) > 1e-12 * f * R ? normalize(nRaw) : perpendicular(e1);
  const e2 = cross(n, e1);
  const phiIns = Math.atan2(dot(ins, e2), dot(ins, e1));
  const phiTan = Math.acos(R / f);
  const at = (phi: number): Vec3 => add(scale(e1, R * Math.cos(phi)), scale(e2, R * Math.sin(phi)));
  const tangent = at(phiTan);
  const arc = phiIns - phiTan;
  const points: Vec3[] = [...head, tangent];
  for (let i = 1; i < arcSamples; i++) points.push(at(phiTan + (arc * i) / arcSamples));
  points.push(ins);
  return {
    points,
    lengthMm: pre + Math.sqrt(f * f - R * R) + R * arc,
    pullDir: normalize(sub(free, tangent)),
    arcMm: R * arc,
    tangentPoint: tangent,
  };
}
