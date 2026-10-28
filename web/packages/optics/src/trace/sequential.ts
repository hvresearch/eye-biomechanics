import { indexAt } from "../color/dispersion";
import { distance, type Vec3 } from "../math/vec3";
import { intersect, normalAt } from "../surfaces/geometry";
import type { ConicSurface, Surface } from "../surfaces/types";
import type { Ray, TraceHit, TraceResult } from "./ray";
import { refract } from "./refract";

/**
 * Trace one ray sequentially through `surfaces`. The trace stops at the first surface the
 * ray misses (`"aperture"` when the hit lies outside the aperture, `"miss"` when there is no
 * forward intersection) or where it undergoes total internal reflection (`"tir"`); the result
 * then has `vignetted: true` with the surface name and reason. A surface whose medium index
 * equals the incoming index (the retina, a stop) is hit without refraction. Indices follow
 * each medium's dispersion at the ray's wavelength; `indexBefore` is the index of the
 * object space at that wavelength (air, 1, by default).
 */
export function traceRay(ray: Ray, surfaces: readonly Surface[], indexBefore = 1): TraceResult {
  const hits: TraceHit[] = [];
  let origin = ray.origin;
  let dir = ray.dir;
  let n = indexBefore;
  let opl = 0;

  for (const s of surfaces) {
    const hit = intersect(s, origin, dir);
    if (hit === null || hit === "miss") {
      return { hits, opticalPathMm: opl, vignetted: true, vignettedAt: s.name, reason: hit === null ? "aperture" : "miss" };
    }
    opl += n * distance(origin, hit.point);
    const n2 = indexAt(s.mediumAfter, ray.wavelengthNm);
    const normal = normalAt(s, hit.point[0], hit.point[1]);
    const out = refract(dir, normal, n, n2);
    if (out === null) {
      hits.push({ surface: s.name, point: hit.point, dirAfter: dir, indexAfter: n });
      return { hits, opticalPathMm: opl, vignetted: true, vignettedAt: s.name, reason: "tir" };
    }
    hits.push({ surface: s.name, point: hit.point, dirAfter: out, indexAfter: n2 });
    origin = hit.point;
    dir = out;
    n = n2;
  }
  return { hits, opticalPathMm: opl, vignetted: false };
}

/** End state of a ray after a sequence of surfaces (see `traceToEnd`). */
export interface TraceEnd {
  point: Vec3;
  dir: Vec3;
  /** Σ n·|segment| up to `point`, mm. */
  opticalPathMm: number;
  /** Index of the medium after the last surface at the ray's wavelength. */
  index: number;
}

/** Smallest forward ray parameter and branch tolerance of the closed-form conic step (numerical, as in surfaces/conic). */
const T_EPS = 1e-9;
const BRANCH_TOL = 1e-7;

/**
 * Forward intersection of a ray with an untilted conic as a ray parameter t, in scalars (the
 * same closed form, polish, branch, and aperture rules as `conicIntersect`): NaN when there is no
 * forward hit on the branch or it lies outside the aperture.
 */
function conicT(s: ConicSurface, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const c = Number.isFinite(s.radiusMm) ? 1 / s.radiusMm : 0;
  const px = ox - s.decenter.xMm;
  const py = oy - s.decenter.yMm;
  const pz = oz - s.vertexZMm;
  const k1 = 1 + s.conic;
  let t1 = Number.NaN;
  let t2 = Number.NaN;
  if (c === 0) {
    if (dz === 0) return Number.NaN;
    t1 = -pz / dz;
  } else {
    const A = c * (dx * dx + dy * dy + k1 * dz * dz);
    const B = 2 * c * (px * dx + py * dy + k1 * pz * dz) - 2 * dz;
    const C = c * (px * px + py * py + k1 * pz * pz) - 2 * pz;
    if (Math.abs(A) < 1e-15) {
      if (B === 0) return Number.NaN;
      t1 = -C / B;
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return Number.NaN;
      const q = -0.5 * (B + Math.sign(B || 1) * Math.sqrt(disc));
      if (q === 0) t1 = 0;
      else {
        t1 = q / A;
        t2 = C / q;
      }
    }
  }
  let best = Number.NaN;
  for (let root = 0; root < 2; root++) {
    let t = root === 0 ? t1 : t2;
    if (!(t > T_EPS)) continue;
    for (let i = 0; i < 2 && c !== 0; i++) {
      const x = px + t * dx;
      const y = py + t * dy;
      const z = pz + t * dz;
      const fp = 2 * c * (x * dx + y * dy + k1 * z * dz) - 2 * dz;
      if (fp === 0) break;
      t -= (c * (x * x + y * y + k1 * z * z) - 2 * z) / fp;
    }
    const x = px + t * dx;
    const y = py + t * dy;
    const r2 = x * x + y * y;
    if (r2 > s.apertureSemiDiamMm * s.apertureSemiDiamMm) continue;
    let zs = 0;
    if (c !== 0) {
      const arg = 1 - k1 * c * c * r2;
      if (arg < 0) continue;
      zs = (c * r2) / (1 + Math.sqrt(arg));
    }
    const zr = pz + t * dz;
    if (Math.abs(zr - zs) > BRANCH_TOL * (1 + Math.abs(zr))) continue;
    if (!(best <= t)) best = t;
  }
  return best;
}

/**
 * `traceRay` without the per-surface record: the last hit, direction, optical path, and index,
 * or null when the ray is vignetted anywhere. The hot path of OPD maps and ray aiming: untilted
 * conic surfaces take a scalar, allocation-free step; others use `intersect`.
 */
export function traceToEnd(ray: Ray, surfaces: readonly Surface[], indexBefore = 1): TraceEnd | null {
  let [ox, oy, oz] = ray.origin;
  let [dx, dy, dz] = ray.dir;
  let n = indexBefore;
  let opl = 0;
  for (const s of surfaces) {
    let hx: number;
    let hy: number;
    let hz: number;
    let nx: number;
    let ny: number;
    let nz: number;
    if (s.kind === "conic" && s.tilt.xDeg === 0 && s.tilt.yDeg === 0) {
      const t = conicT(s, ox, oy, oz, dx, dy, dz);
      if (Number.isNaN(t)) return null;
      hx = ox + t * dx;
      hy = oy + t * dy;
      hz = oz + t * dz;
      opl += n * t;
      const c = Number.isFinite(s.radiusMm) ? 1 / s.radiusMm : 0;
      if (c === 0) {
        nx = 0;
        ny = 0;
        nz = -1;
      } else {
        // Gradient of c(r² + (1+k)z²) − 2z at the hit, oriented toward −z.
        nx = 2 * c * (hx - s.decenter.xMm);
        ny = 2 * c * (hy - s.decenter.yMm);
        nz = 2 * c * (1 + s.conic) * (hz - s.vertexZMm) - 2;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const sgn = nz > 0 ? -1 / len : 1 / len;
        nx *= sgn;
        ny *= sgn;
        nz *= sgn;
      }
    } else {
      const hit = intersect(s, [ox, oy, oz], [dx, dy, dz]);
      if (hit === null || hit === "miss") return null;
      opl += n * distance([ox, oy, oz], hit.point);
      [hx, hy, hz] = hit.point;
      [nx, ny, nz] = normalAt(s, hx, hy);
    }
    const n2 = indexAt(s.mediumAfter, ray.wavelengthNm);
    if (n2 !== n) {
      // Vector Snell's law (as `refract`), with the normal turned to face the incoming ray.
      let cosI = -(dx * nx + dy * ny + dz * nz);
      if (cosI < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
        cosI = -cosI;
      }
      const eta = n / n2;
      const k = 1 - eta * eta * (1 - cosI * cosI);
      if (k < 0) return null;
      const f = eta * cosI - Math.sqrt(k);
      let rx = eta * dx + f * nx;
      let ry = eta * dy + f * ny;
      let rz = eta * dz + f * nz;
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
      rx /= len;
      ry /= len;
      rz /= len;
      dx = rx;
      dy = ry;
      dz = rz;
    }
    ox = hx;
    oy = hy;
    oz = hz;
    n = n2;
  }
  return { point: [ox, oy, oz], dir: [dx, dy, dz], opticalPathMm: opl, index: n };
}
