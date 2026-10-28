import { normalize, type Vec3 } from "../math/vec3";
import type { ConicSurface, Surface } from "./types";

/** Smallest ray parameter accepted as a forward hit, in mm (numerical). */
export const T_EPS = 1e-9;
/** Relative tolerance for matching a quadratic root to the sag branch, in mm (numerical). */
const BRANCH_TOL = 1e-7;

/** Result of an intersection: the hit, `null` when it falls outside the aperture, `"miss"` when there is none. */
export type Intersection = { point: Vec3; t: number } | null | "miss";

function curvature(radiusMm: number): number {
  return Number.isFinite(radiusMm) ? 1 / radiusMm : 0;
}

export function assertNoTilt(s: Surface): void {
  if (s.tilt.xDeg !== 0 || s.tilt.yDeg !== 0) {
    throw new Error(`Surface "${s.name}" has a non-zero tilt; tilt is not supported`);
  }
}

/** Conic sag at radial distance² `r2` from the vertex axis, mm; NaN beyond the conic's edge. */
export function conicSagR2(radiusMm: number, k: number, r2: number): number {
  const c = curvature(radiusMm);
  if (c === 0) return 0;
  const arg = 1 - (1 + k) * c * c * r2;
  if (arg < 0) return Number.NaN;
  return (c * r2) / (1 + Math.sqrt(arg));
}

/** Slope dz/dr divided by r (so dz/dx = x·value), for the conic at r². */
export function conicSlopeOverR(radiusMm: number, k: number, r2: number): number {
  const c = curvature(radiusMm);
  if (c === 0) return 0;
  const arg = 1 - (1 + k) * c * c * r2;
  if (!(arg > 0)) return Number.NaN;
  return c / Math.sqrt(arg);
}

/** Surface height relative to the vertex plane at lateral position (x, y), mm. */
export function conicSag(s: ConicSurface, x: number, y: number): number {
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  return conicSagR2(s.radiusMm, s.conic, dx * dx + dy * dy);
}

/** Unit normal at lateral position (x, y), oriented toward −z (facing the incoming ray). */
export function conicNormal(s: ConicSurface, x: number, y: number): Vec3 {
  const c = curvature(s.radiusMm);
  if (c === 0) return [0, 0, -1];
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  const z = conicSag(s, x, y);
  // Gradient of F = c (r² + (1+k) z²) − 2 z.
  const g: Vec3 = [2 * c * dx, 2 * c * dy, 2 * c * (1 + s.conic) * z - 2];
  const n = normalize(g);
  return n[2] > 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * Forward roots (t > T_EPS) of the ray with the conic quadric of radius R and constant k whose
 * vertex sits at `vertexZMm` and axis at (cx, cy), polished by Newton and restricted to the
 * vertex branch, in increasing t. Apertures are not applied.
 */
export function conicRoots(
  radiusMm: number,
  k: number,
  vertexZMm: number,
  center: { xMm: number; yMm: number },
  origin: Vec3,
  dir: Vec3,
): Array<{ point: Vec3; t: number }> {
  const c = curvature(radiusMm);
  const px = origin[0] - center.xMm;
  const py = origin[1] - center.yMm;
  const pz = origin[2] - vertexZMm;
  const [dx, dy, dz] = dir;
  const k1 = 1 + k;

  let candidates: number[];
  if (c === 0) {
    if (dz === 0) return [];
    candidates = [-pz / dz];
  } else {
    const A = c * (dx * dx + dy * dy + k1 * dz * dz);
    const B = 2 * c * (px * dx + py * dy + k1 * pz * dz) - 2 * dz;
    const C = c * (px * px + py * py + k1 * pz * pz) - 2 * pz;
    if (Math.abs(A) < 1e-15) {
      if (B === 0) return [];
      candidates = [-C / B];
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return [];
      const sq = Math.sqrt(disc);
      // Numerically stable pair of roots.
      const q = -0.5 * (B + Math.sign(B || 1) * sq);
      candidates = q === 0 ? [0] : [q / A, C / q];
    }
  }

  const out: Array<{ point: Vec3; t: number }> = [];
  for (let t of candidates) {
    if (!(t > T_EPS)) continue;
    // Two Newton polish steps on F(t) remove the cancellation error of the closed form.
    for (let i = 0; i < 2 && c !== 0; i++) {
      const x = px + t * dx;
      const y = py + t * dy;
      const z = pz + t * dz;
      const f = c * (x * x + y * y + k1 * z * z) - 2 * z;
      const fp = 2 * c * (x * dx + y * dy + k1 * z * dz) - 2 * dz;
      if (fp === 0) break;
      t -= f / fp;
    }
    const x = px + t * dx;
    const y = py + t * dy;
    const zr = pz + t * dz;
    const zs = conicSagR2(radiusMm, k, x * x + y * y);
    if (Number.isNaN(zs)) continue;
    if (Math.abs(zr - zs) > BRANCH_TOL * (1 + Math.abs(zr))) continue;
    out.push({ point: [origin[0] + t * dx, origin[1] + t * dy, origin[2] + t * dz], t });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Intersect a ray with the conic: the first forward hit on the vertex branch, `null` when
 * that hit lies outside the aperture, `"miss"` when there is no forward hit on the branch.
 */
export function conicIntersect(s: ConicSurface, origin: Vec3, dir: Vec3): Intersection {
  assertNoTilt(s);
  const roots = conicRoots(s.radiusMm, s.conic, s.vertexZMm, s.decenter, origin, dir);
  if (roots.length === 0) return "miss";
  for (const r of roots) {
    if (Math.hypot(r.point[0] - s.decenter.xMm, r.point[1] - s.decenter.yMm) <= s.apertureSemiDiamMm) return r;
  }
  return null;
}
