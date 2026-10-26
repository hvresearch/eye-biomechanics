import { normalize, type Vec3 } from "../math/vec3";
import type { Surface } from "./types";

/** Smallest ray parameter accepted as a forward hit, in mm. */
const T_EPS = 1e-9;
/** Relative tolerance for matching a quadratic root to the sag branch, in mm. */
const BRANCH_TOL = 1e-7;

function curvature(s: Surface): number {
  return Number.isFinite(s.radiusMm) ? 1 / s.radiusMm : 0;
}

function assertNoTilt(s: Surface): void {
  if (s.tilt.xDeg !== 0 || s.tilt.yDeg !== 0) {
    throw new Error(`Surface "${s.name}" has a non-zero tilt; tilt is not supported in this milestone`);
  }
}

/** Surface height relative to the vertex plane at lateral position (x, y), mm. */
export function sag(s: Surface, x: number, y: number): number {
  const c = curvature(s);
  if (c === 0) return 0;
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  const r2 = dx * dx + dy * dy;
  const arg = 1 - (1 + s.conic) * c * c * r2;
  if (arg < 0) return Number.NaN;
  return (c * r2) / (1 + Math.sqrt(arg));
}

/** Unit normal at lateral position (x, y), oriented toward −z (facing the incoming ray). */
export function normalAt(s: Surface, x: number, y: number): Vec3 {
  const c = curvature(s);
  if (c === 0) return [0, 0, -1];
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  const z = sag(s, x, y);
  // Gradient of F = c (r² + (1+k) z²) − 2 z.
  const g: Vec3 = [2 * c * dx, 2 * c * dy, 2 * c * (1 + s.conic) * z - 2];
  const n = normalize(g);
  return n[2] > 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * Intersect a ray with the surface. Returns the first forward hit inside the aperture
 * on the vertex branch of the conic, or null when the ray misses (aperture, no forward
 * root, or wrong branch only).
 */
export function intersect(
  s: Surface,
  origin: Vec3,
  dir: Vec3,
): { point: Vec3; t: number } | null {
  assertNoTilt(s);
  const c = curvature(s);
  const px = origin[0] - s.decenter.xMm;
  const py = origin[1] - s.decenter.yMm;
  const pz = origin[2] - s.vertexZMm;
  const [dx, dy, dz] = dir;
  const k1 = 1 + s.conic;

  let candidates: number[];
  if (c === 0) {
    if (dz === 0) return null;
    candidates = [-pz / dz];
  } else {
    const A = c * (dx * dx + dy * dy + k1 * dz * dz);
    const B = 2 * c * (px * dx + py * dy + k1 * pz * dz) - 2 * dz;
    const C = c * (px * px + py * py + k1 * pz * pz) - 2 * pz;
    if (Math.abs(A) < 1e-15) {
      if (B === 0) return null;
      candidates = [-C / B];
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      // Numerically stable pair of roots.
      const q = -0.5 * (B + Math.sign(B || 1) * sq);
      candidates = q === 0 ? [0] : [q / A, C / q];
    }
  }

  let best: { point: Vec3; t: number } | null = null;
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
    const x = origin[0] + t * dx;
    const y = origin[1] + t * dy;
    const z = origin[2] + t * dz;
    const rx = x - s.decenter.xMm;
    const ry = y - s.decenter.yMm;
    if (Math.hypot(rx, ry) > s.apertureSemiDiamMm) continue;
    const zs = sag(s, x, y);
    if (Number.isNaN(zs)) continue;
    const zr = z - s.vertexZMm;
    if (Math.abs(zr - zs) > BRANCH_TOL * (1 + Math.abs(zr))) continue;
    if (best === null || t < best.t) best = { point: [x, y, z], t };
  }
  return best;
}
