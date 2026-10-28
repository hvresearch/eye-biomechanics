import table from "../../../../../data/eom/forces.json";
import { QUAT_IDENTITY, quatRotate, type Quat } from "../math/quat";
import { dot, normalize, scale, sub, type Vec3 } from "../math/vec";
import { activations } from "./activation";
import { MUSCLE_NAMES, defaultMuscles, type EomMuscle, type MuscleName } from "./geometry";
import { musclePath } from "./path";

/** Shape of data/eom/forces.json. */
export interface ForceTable {
  name: string;
  label: string;
  verified: boolean;
  equation: string;
  gramForceToN: number;
  muscles: Record<string, { maxForceGf: number; citation: string }>;
  insertionFootprintLengthMm: { value: number; citation: string };
  note: string;
}

export const FORCE_TABLE: ForceTable = table;

/** Force capacity of a muscle (activation 1), newtons. */
export function maxForceN(name: MuscleName, t: ForceTable = FORCE_TABLE): number {
  const m = t.muscles[name];
  if (!m) throw new Error(`Force table has no entry for ${name}`);
  return m.maxForceGf * t.gramForceToN;
}

/**
 * One muscle's load on the globe for a gaze, in the eye's local frame (origin at the globe
 * center, x temporal, y superior, z posterior; mm). The muscle is a force source,
 * `forceN = activation × maxForceN` (an approximation: length-proxy activation). When it wraps
 * the globe it pulls at the insertion along the surface (`insertionDir`, tangent to the sphere
 * toward the tangent point) and presses on the arc of contact; its net pull on the globe is
 * `forceN · pullDir`, the direction of the free segment from the tangent point. Without a wrap
 * both directions coincide.
 */
export interface MuscleForce {
  name: MuscleName;
  insertionMm: Vec3;
  tangentPointMm: Vec3;
  pullDir: Vec3;
  insertionDir: Vec3;
  arcOfContactMm: number;
  forceN: number;
  activation: number;
  pathLengthMm: number;
  tendonElongationMm: number;
  insertionWidthMm: number;
}

/** Unit tangent of the great circle at `p` heading toward `q` (both on the sphere). */
function greatCircleTangent(p: Vec3, q: Vec3): Vec3 {
  const u = normalize(p);
  return normalize(sub(q, scale(u, dot(q, u))));
}

/**
 * Insertion forces of the six muscles (in `MUSCLE_NAMES` order) with the eye oriented by
 * `gaze`. Activations come from the length proxy against the primary-position path lengths,
 * as in `deriveEyeState`. The tendon is in series with the muscle, so it carries the same
 * force; its stiffness sets only the reported elongation (M4 plan, Deviation 5), and a
 * non-positive stiffness is rejected.
 */
export function muscleForces(gaze: Quat, muscles: EomMuscle[] = defaultMuscles(), t: ForceTable = FORCE_TABLE): MuscleForce[] {
  if (muscles.length !== MUSCLE_NAMES.length) throw new RangeError(`muscleForces needs ${MUSCLE_NAMES.length} muscles`);
  for (const m of muscles) {
    if (!(m.tendon.stiffnessNPerMm > 0)) throw new RangeError(`${m.name}: tendon stiffness must be positive, got ${m.tendon.stiffnessNPerMm}`);
  }
  const rest = muscles.map((m) => musclePath(m, QUAT_IDENTITY).lengthMm);
  const paths = muscles.map((m) => musclePath(m, gaze));
  const act = activations(
    paths.map((p) => p.lengthMm),
    rest,
  );
  return muscles.map((m, i) => {
    const path = paths[i]!;
    const a = act[i]!;
    const forceN = a * maxForceN(m.name, t);
    const insertionMm = quatRotate(gaze, m.insertionMm);
    return {
      name: m.name,
      insertionMm,
      tangentPointMm: path.tangentPoint,
      pullDir: path.pullDir,
      insertionDir: path.arcMm > 0 ? greatCircleTangent(insertionMm, path.tangentPoint) : path.pullDir,
      arcOfContactMm: path.arcMm,
      forceN,
      activation: a,
      pathLengthMm: path.lengthMm,
      tendonElongationMm: forceN / m.tendon.stiffnessNPerMm,
      insertionWidthMm: m.insertionWidthMm,
    };
  });
}
