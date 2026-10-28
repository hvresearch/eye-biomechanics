import { add, dot, normalize, scale, sub, type Vec3 } from "../math/vec3";
import type { Surface } from "../surfaces/types";
import { fieldDirection } from "./bundle";
import type { Ray } from "./ray";
import { traceToEnd } from "./sequential";

/**
 * How an eye views an object: where the object is, and the pupil disk the bundle fills.
 *
 * The object lies along the field direction through the pupil center, `objectDistanceM` in
 * front of `referenceZMm` measured axially (the corneal vertex); `Infinity` is a collimated
 * beam travelling along the field direction. `fieldDeg` follows `fieldDirection` (from +z
 * toward +x and +y). The pupil is the disk of `pupilRadiusMm` about `pupilCenterMm` in the
 * plane z = `pupilPlaneZMm`.
 */
export interface ViewSpec {
  objectDistanceM: number;
  fieldDeg: { x: number; y: number };
  referenceZMm: number;
  pupilPlaneZMm: number;
  pupilCenterMm: { x: number; y: number };
  pupilRadiusMm: number;
}

export interface PupilBundle {
  rays: Ray[];
  /** Pupil coordinates of each ray relative to the pupil center, mm, interleaved (x, y). */
  pupilXYMm: Float64Array;
  /** Grid cell of each ray, row · gridN + col (row along y, col along x). */
  gridIndex: Uint32Array;
  gridN: number;
  chief: Ray;
  collimated: boolean;
  view: ViewSpec;
  /** Rays whose aiming through the front surfaces failed (vignetted or not converged); they are traced as launched. */
  unaimed: number;
}

/** How far before the first front surface collimated rays start, mm (numerical). */
const LAUNCH_MARGIN_MM = 5;
/** Ray aiming: finite-difference step and tolerance in the pupil plane, mm; iteration limit (numerical). */
const AIM_STEP_MM = 1e-6;
const AIM_TOL_MM = 1e-6;
const AIM_MAX_ITER = 8;

interface Launcher {
  /** The ray that would cross the pupil plane at `aim` if nothing were in front of it. */
  ray(aim: readonly [number, number]): Ray;
}

function launcher(view: ViewSpec, front: readonly Surface[], wavelengthNm: number): { launch: Launcher; collimated: boolean } {
  const dir = fieldDirection(view.fieldDeg);
  const zp = view.pupilPlaneZMm;
  const center: Vec3 = [view.pupilCenterMm.x, view.pupilCenterMm.y, zp];
  if (Number.isFinite(view.objectDistanceM)) {
    if (!(view.objectDistanceM > 0)) throw new RangeError(`objectDistanceM must be > 0, got ${view.objectDistanceM}`);
    const L = view.objectDistanceM * 1000 + (zp - view.referenceZMm);
    const object = sub(center, scale(dir, L / dir[2]));
    return {
      collimated: false,
      launch: { ray: ([x, y]) => ({ origin: object, dir: normalize(sub([x, y, zp], object)), wavelengthNm }) },
    };
  }
  const zStart = Math.min(zp, ...front.map((s) => s.vertexZMm)) - LAUNCH_MARGIN_MM;
  const L0 = (zp - zStart) / dir[2];
  return {
    collimated: true,
    launch: {
      // Start on the plane perpendicular to the beam, L0 before the pupil center, so every ray
      // begins with the same optical path.
      ray: ([x, y]) => {
        const a: Vec3 = [x, y, zp];
        return { origin: sub(a, scale(dir, dot(sub(a, center), dir) + L0)), dir, wavelengthNm };
      },
    },
  };
}

/** Where a ray crosses the pupil plane after the front surfaces, or null if it is vignetted there. */
function crossing(ray: Ray, front: readonly Surface[], zp: number): [number, number] | null {
  let p = ray.origin;
  let d = ray.dir;
  if (front.length > 0) {
    const last = traceToEnd(ray, front, 1);
    if (last === null) return null;
    p = last.point;
    d = last.dir;
  }
  if (!(d[2] > 0)) return null;
  const q = add(p, scale(d, (zp - p[2]) / d[2]));
  return [q[0], q[1]];
}

/** Jacobian of the pupil-plane crossing with respect to the aim point, by finite differences. */
function jacobian(l: Launcher, a: readonly [number, number], c: readonly [number, number], front: readonly Surface[], zp: number): Jacobian | null {
  const cx = crossing(l.ray([a[0] + AIM_STEP_MM, a[1]]), front, zp);
  const cy = crossing(l.ray([a[0], a[1] + AIM_STEP_MM]), front, zp);
  if (cx === null || cy === null) return null;
  const j11 = (cx[0] - c[0]) / AIM_STEP_MM;
  const j21 = (cx[1] - c[1]) / AIM_STEP_MM;
  const j12 = (cy[0] - c[0]) / AIM_STEP_MM;
  const j22 = (cy[1] - c[1]) / AIM_STEP_MM;
  const det = j11 * j22 - j12 * j21;
  if (!(Math.abs(det) > 0)) return null;
  return { i11: j22 / det, i12: -j12 / det, i21: -j21 / det, i22: j11 / det };
}

/** Inverse of the 2 × 2 crossing Jacobian. */
interface Jacobian {
  i11: number;
  i12: number;
  i21: number;
  i22: number;
}

/**
 * Aim so the ray crosses the pupil plane at `target` after `front`: a chord iteration from
 * `start` with the inverse Jacobian `inv` (from the chief ray; the map is nearly linear through a
 * spectacle lens), refreshing the Jacobian at the current point when convergence stalls.
 * Returns the aim point (the undeviated crossing of the launched ray) or null.
 */
function aim(
  l: Launcher,
  target: readonly [number, number],
  front: readonly Surface[],
  zp: number,
  inv0: Jacobian | null,
  start: readonly [number, number],
): [number, number] | null {
  let a: [number, number] = [start[0], start[1]];
  let inv = inv0;
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < AIM_MAX_ITER; i++) {
    const c = crossing(l.ray(a), front, zp);
    if (c === null) return null;
    const ex = c[0] - target[0];
    const ey = c[1] - target[1];
    const err = Math.hypot(ex, ey);
    if (err < AIM_TOL_MM) return a;
    if (inv === null || err > 0.5 * prev) inv = jacobian(l, a, c, front, zp);
    if (inv === null) return null;
    prev = err;
    a = [a[0] - (inv.i11 * ex + inv.i12 * ey), a[1] - (inv.i21 * ex + inv.i22 * ey)];
  }
  return null;
}

/**
 * Rays from the view's object filling the pupil disk on a gridN × gridN grid (cells whose
 * center lies inside the disk). With `front` surfaces (those before the pupil plane, such as a
 * spectacle lens) each ray is aimed by Newton iteration so that after them it crosses the pupil
 * plane at its sample.
 */
export function pupilBundle(view: ViewSpec, gridN: number, wavelengthNm: number, front: readonly Surface[] = []): PupilBundle {
  if (!(Number.isInteger(gridN) && gridN >= 2)) throw new RangeError(`gridN must be an integer ≥ 2, got ${gridN}`);
  const R = view.pupilRadiusMm;
  if (!(R > 0)) throw new RangeError(`pupilRadiusMm must be > 0, got ${R}`);
  const { launch, collimated } = launcher(view, front, wavelengthNm);
  const zp = view.pupilPlaneZMm;
  const cx = view.pupilCenterMm.x;
  const cy = view.pupilCenterMm.y;
  const rays: Ray[] = [];
  const xy: number[] = [];
  const idx: number[] = [];
  let unaimed = 0;
  // With front surfaces, aim the chief ray first; its aim point and Jacobian predict the others.
  let chiefAim: [number, number] = [cx, cy];
  let inv: Jacobian | null = null;
  if (front.length > 0) {
    const c0 = crossing(launch.ray(chiefAim), front, zp);
    inv = c0 === null ? null : jacobian(launch, chiefAim, c0, front, zp);
    const a = aim(launch, [cx, cy], front, zp, inv, chiefAim);
    if (a === null) unaimed++;
    else chiefAim = a;
  }
  for (let i = 0; i < gridN; i++) {
    const y = -R + (2 * R * i) / (gridN - 1);
    for (let j = 0; j < gridN; j++) {
      const x = -R + (2 * R * j) / (gridN - 1);
      if (Math.hypot(x, y) > R * (1 + 1e-12)) continue;
      const target: [number, number] = [cx + x, cy + y];
      let ray: Ray;
      if (front.length === 0) {
        ray = launch.ray(target);
      } else {
        const start: [number, number] =
          inv === null ? target : [chiefAim[0] + inv.i11 * x + inv.i12 * y, chiefAim[1] + inv.i21 * x + inv.i22 * y];
        const a = aim(launch, target, front, zp, inv, start);
        if (a === null) unaimed++;
        ray = launch.ray(a ?? target);
      }
      rays.push(ray);
      xy.push(x, y);
      idx.push(i * gridN + j);
    }
  }
  const chief = launch.ray(chiefAim);
  return { rays, pupilXYMm: Float64Array.from(xy), gridIndex: Uint32Array.from(idx), gridN, chief, collimated, view, unaimed };
}
