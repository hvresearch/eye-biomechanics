import { cross, dot, normalize, type Vec3 } from "../math/vec";
import { QUAT_IDENTITY, quatFromAxisAngle, quatRotate, type Quat } from "../math/quat";

/**
 * Line-of-sight angles in an eye's local frame (x temporal, y superior, z posterior):
 * azimuth `xDeg` (positive temporal) and elevation `yDeg` (positive up), Fick order.
 */
export interface GazeDeg {
  xDeg: number;
  yDeg: number;
}

const DEG = Math.PI / 180;
/** Primary line of sight: straight ahead, toward the object (−z). */
export const PRIMARY_DIRECTION: Vec3 = [0, 0, -1];

export function gazeDirection(g: GazeDeg): Vec3 {
  const x = g.xDeg * DEG;
  const y = g.yDeg * DEG;
  return [Math.sin(x) * Math.cos(y), Math.sin(y), -Math.cos(x) * Math.cos(y)];
}

export function gazeFromDirection(d: Vec3): GazeDeg {
  const u = normalize(d);
  return { xDeg: Math.atan2(u[0], -u[2]) / DEG, yDeg: Math.asin(Math.max(-1, Math.min(1, u[1]))) / DEG };
}

/**
 * Eye orientation for a line of sight under Listing's law: the single rotation from primary
 * position whose axis lies in Listing's plane (z = 0, perpendicular to the primary line of
 * sight), so it carries no torsion about the primary direction.
 */
export function gazeQuaternion(g: GazeDeg): Quat {
  const d = gazeDirection(g);
  const c = Math.max(-1, Math.min(1, dot(PRIMARY_DIRECTION, d)));
  const angle = Math.acos(c);
  if (angle < 1e-15) return QUAT_IDENTITY;
  // PRIMARY × d = (d_y, −d_x, 0): always in Listing's plane.
  return quatFromAxisAngle(cross(PRIMARY_DIRECTION, d), angle);
}

/** Line of sight of an eye oriented by q. */
export function directionFromQuaternion(q: Quat): Vec3 {
  return quatRotate(q, PRIMARY_DIRECTION);
}

/**
 * Torsion of an orientation in Fick coordinates, degrees: the signed angle about the line of
 * sight from the Fick horizontal axis (perpendicular to the line of sight and to the head's
 * vertical) to the eye's own horizontal axis. Zero for purely horizontal or vertical
 * Listing gaze; nonzero ("false torsion") for oblique gaze.
 */
export function fickTorsionDeg(q: Quat): number {
  const d = directionFromQuaternion(q);
  const h = normalize(cross(d, [0, 1, 0]));
  const e = quatRotate(q, [1, 0, 0]);
  return Math.atan2(dot(cross(h, e), d), dot(h, e)) / DEG;
}
