import type { Vec3 } from "../math/vec3";
import type { SurfaceBase } from "./types";

/** Row-major 3 × 3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/**
 * A tilted surface's own frame: `global = pivot + rot · local`. The pivot is the vertex
 * (decenter x, decenter y, vertex z); in the local frame the surface is untilted with its
 * vertex at the origin, so its aperture is measured in the local x–y plane.
 */
export interface SurfaceFrame {
  pivot: Vec3;
  rot: Mat3;
}

const DEG = Math.PI / 180;

/**
 * Frame of a tilted surface, or null when both tilts are zero (the untilted code paths are
 * then used unchanged). The rotation is `R = Ry(yDeg) · Rx(xDeg)`: first about x, then about
 * y, both right-handed, applied to the surface about its vertex (the "tilt about X then Y"
 * order of sequential lens-design programs).
 */
export function surfaceFrame(s: Pick<SurfaceBase, "tilt" | "decenter" | "vertexZMm">): SurfaceFrame | null {
  if (s.tilt.xDeg === 0 && s.tilt.yDeg === 0) return null;
  const cx = Math.cos(s.tilt.xDeg * DEG);
  const sx = Math.sin(s.tilt.xDeg * DEG);
  const cy = Math.cos(s.tilt.yDeg * DEG);
  const sy = Math.sin(s.tilt.yDeg * DEG);
  // Ry · Rx with Rx = [[1,0,0],[0,cx,−sx],[0,sx,cx]] and Ry = [[cy,0,sy],[0,1,0],[−sy,0,cy]].
  const rot: Mat3 = [cy, sy * sx, sy * cx, 0, cx, -sx, -sy, cy * sx, cy * cx];
  return { pivot: [s.decenter.xMm, s.decenter.yMm, s.vertexZMm], rot };
}

/** Local direction → global (R · d). */
export function dirToGlobal(f: SurfaceFrame, d: Vec3): Vec3 {
  const r = f.rot;
  return [r[0] * d[0] + r[1] * d[1] + r[2] * d[2], r[3] * d[0] + r[4] * d[1] + r[5] * d[2], r[6] * d[0] + r[7] * d[1] + r[8] * d[2]];
}

/** Global direction → local (Rᵀ · d). */
export function dirToLocal(f: SurfaceFrame, d: Vec3): Vec3 {
  const r = f.rot;
  return [r[0] * d[0] + r[3] * d[1] + r[6] * d[2], r[1] * d[0] + r[4] * d[1] + r[7] * d[2], r[2] * d[0] + r[5] * d[1] + r[8] * d[2]];
}

/** Local point → global. */
export function toGlobal(f: SurfaceFrame, p: Vec3): Vec3 {
  const g = dirToGlobal(f, p);
  return [g[0] + f.pivot[0], g[1] + f.pivot[1], g[2] + f.pivot[2]];
}

/** Global point → local. */
export function toLocal(f: SurfaceFrame, p: Vec3): Vec3 {
  return dirToLocal(f, [p[0] - f.pivot[0], p[1] - f.pivot[1], p[2] - f.pivot[2]]);
}
