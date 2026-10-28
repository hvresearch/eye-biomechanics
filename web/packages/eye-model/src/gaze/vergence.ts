import { norm, sub, type Vec3 } from "../math/vec";
import { gazeDirection, gazeFromDirection, type GazeDeg } from "./listing";

/** A scene target: distance from the midpoint between the eyes and its direction. */
export interface SceneTarget {
  distanceM: number;
  /** Degrees from straight ahead in the head frame: x to the subject's right, y up. */
  directionDeg: { x: number; y: number };
}

export interface EyeDirections {
  left: GazeDeg;
  right: GazeDeg;
  vergenceDeg: number;
  /** Distance from each eye's center of rotation to the target, mm (Infinity at infinity). */
  distanceMm: { left: number; right: number };
}

const DEG = Math.PI / 180;

/**
 * Target position in the head frame (origin midway between the centers of rotation, x to the
 * subject's right, y up, z posterior), mm; null for a target at infinity.
 */
export function targetPoint(distanceM: number, directionDeg: { x: number; y: number }): Vec3 | null {
  if (!Number.isFinite(distanceM)) return null;
  const d = gazeDirection({ xDeg: directionDeg.x, yDeg: directionDeg.y });
  const mm = distanceM * 1000;
  return [d[0] * mm, d[1] * mm, d[2] * mm];
}

/** Express a head-frame direction in an eye's local frame (x temporal): mirror x for the left eye. */
function toLocal(v: Vec3, side: "left" | "right"): Vec3 {
  return side === "left" ? [-v[0], v[1], v[2]] : v;
}

/**
 * Vergence as the angle between the two lines of sight, degrees, from each eye's gaze in its
 * local frame (the definition `eyeDirections` uses for a fixated target).
 */
export function lineOfSightAngleDeg(gazes: { left: GazeDeg; right: GazeDeg }): number {
  const r = gazeDirection(gazes.right);
  const l = toLocal(gazeDirection(gazes.left), "left");
  const cos = r[0] * l[0] + r[1] * l[1] + r[2] * l[2];
  return Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
}

/**
 * Each eye's line of sight to a target (Hering: both eyes fixate it), vergence, and each
 * eye's distance to it. The right eye's center of rotation is at x = +ipd/2.
 */
export function eyeDirections(target: SceneTarget, ipdMm: number): EyeDirections {
  const { x, y } = target.directionDeg;
  const p = targetPoint(target.distanceM, target.directionDeg);
  if (!p) {
    return {
      right: { xDeg: x, yDeg: y },
      left: { xDeg: -x, yDeg: y },
      vergenceDeg: 0,
      distanceMm: { left: Number.POSITIVE_INFINITY, right: Number.POSITIVE_INFINITY },
    };
  }
  const half = ipdMm / 2;
  const vr = sub(p, [half, 0, 0]);
  const vl = sub(p, [-half, 0, 0]);
  const nr = norm(vr);
  const nl = norm(vl);
  if (!(nr > 0) || !(nl > 0)) throw new RangeError("Target coincides with an eye's center of rotation");
  const cos = (vr[0] * vl[0] + vr[1] * vl[1] + vr[2] * vl[2]) / (nr * nl);
  return {
    right: gazeFromDirection(toLocal(vr, "right")),
    left: gazeFromDirection(toLocal(vl, "left")),
    vergenceDeg: Math.acos(Math.max(-1, Math.min(1, cos))) / DEG,
    distanceMm: { left: nl, right: nr },
  };
}
