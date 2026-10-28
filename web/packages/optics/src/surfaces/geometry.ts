import { normalize, type Vec3 } from "../math/vec3";
import { T_EPS, assertNoTilt, conicIntersect, conicNormal, conicRoots, conicSag, type Intersection } from "./conic";
import { toricMeridianCurvature, toricSag, toricSlope } from "./toric";
import type { Surface } from "./types";
import { zernikeMeridianCurvature, zernikeSurfaceSag, zernikeSurfaceSlope } from "./zernikeSag";

export type { Intersection } from "./conic";

/** Newton tolerance on |z − sag| at the hit, mm, and iteration limit (numerical). */
const NEWTON_TOL_MM = 1e-9;
const NEWTON_MAX_ITER = 20;

/** Surface height relative to the vertex plane at lateral position (x, y), mm (NaN beyond the edge). */
export function sag(s: Surface, x: number, y: number): number {
  switch (s.kind) {
    case "conic":
      return conicSag(s, x, y);
    case "toric":
      return toricSag(s, x, y);
    case "zernike":
      return zernikeSurfaceSag(s, x, y);
  }
}

function slope(s: Exclude<Surface, { kind: "conic" }>, x: number, y: number): [number, number] {
  return s.kind === "toric" ? toricSlope(s, x, y) : zernikeSurfaceSlope(s, x, y);
}

/** Unit normal at lateral position (x, y), oriented toward −z (facing the incoming ray). */
export function normalAt(s: Surface, x: number, y: number): Vec3 {
  if (s.kind === "conic") return conicNormal(s, x, y);
  const [sx, sy] = slope(s, x, y);
  return normalize([sx, sy, -1]);
}

/** Vertex curvature of the section along the meridian at angle `meridianRad` (from +x toward +y), per mm. */
export function meridianCurvature(s: Surface, meridianRad: number): number {
  switch (s.kind) {
    case "conic":
      return Number.isFinite(s.radiusMm) ? 1 / s.radiusMm : 0;
    case "toric":
      return toricMeridianCurvature(s, meridianRad);
    case "zernike":
      return zernikeMeridianCurvature(s, meridianRad);
  }
}

/** Closed-form seed for Newton: the base (or mean-curvature) conic, else the vertex plane. */
function seed(s: Exclude<Surface, { kind: "conic" }>, origin: Vec3, dir: Vec3): number | null {
  let radius: number;
  let k: number;
  if (s.kind === "toric") {
    const c = (meridianCurvature(s, 0) + meridianCurvature(s, Math.PI / 2)) / 2;
    radius = c === 0 ? Number.POSITIVE_INFINITY : 1 / c;
    k = (s.conicX + s.conicY) / 2;
  } else {
    radius = s.radiusMm;
    k = s.conic;
  }
  const roots = conicRoots(radius, k, s.vertexZMm, s.decenter, origin, dir);
  if (roots[0]) return roots[0].t;
  if (dir[2] === 0) return null;
  const t = (s.vertexZMm - origin[2]) / dir[2];
  return t > T_EPS ? t : null;
}

/**
 * Intersect a ray with the surface: the first forward hit, `null` when it lies outside the
 * aperture, `"miss"` when there is no forward hit (no root, Newton does not converge, or the
 * ray passes beyond the surface's edge). Toric and Zernike surfaces use Newton iteration on
 * z(t) − sag(x(t), y(t)) = 0 seeded by the closed-form conic root.
 */
export function intersect(s: Surface, origin: Vec3, dir: Vec3): Intersection {
  if (s.kind === "conic") return conicIntersect(s, origin, dir);
  assertNoTilt(s);
  const t0 = seed(s, origin, dir);
  if (t0 === null) return "miss";
  let t = t0;
  let converged = false;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const x = origin[0] + t * dir[0];
    const y = origin[1] + t * dir[1];
    const z = origin[2] + t * dir[2];
    const zs = sag(s, x, y);
    if (Number.isNaN(zs)) return "miss";
    const f = z - s.vertexZMm - zs;
    if (Math.abs(f) < NEWTON_TOL_MM) {
      converged = true;
      break;
    }
    const [sx, sy] = slope(s, x, y);
    const fp = dir[2] - sx * dir[0] - sy * dir[1];
    if (!(Math.abs(fp) > 0) || Number.isNaN(fp)) return "miss";
    t -= f / fp;
  }
  if (!converged || !(t > T_EPS)) return "miss";
  const point: Vec3 = [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]];
  if (Math.hypot(point[0] - s.decenter.xMm, point[1] - s.decenter.yMm) > s.apertureSemiDiamMm) return null;
  return { point, t };
}
