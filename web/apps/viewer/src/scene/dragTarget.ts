import { gazeFromDirection, type Vec3 } from "@eye/eye-model";

export interface DraggedTarget {
  distanceM: number;
  directionDeg: { x: number; y: number };
}

/**
 * Where a pointer ray (head frame, mm: x to the subject's right, y up, z posterior) meets
 * the frontal plane z = planeZMm, as a scene target (distance from the midpoint between the
 * eyes and direction). Null when the ray is parallel to the plane, points away from it, or
 * the hit is not in front of the eyes.
 */
export function dragToTarget(rayOrigin: Vec3, rayDir: Vec3, planeZMm: number): DraggedTarget | null {
  if (Math.abs(rayDir[2]) < 1e-12) return null;
  const t = (planeZMm - rayOrigin[2]) / rayDir[2];
  if (!(t > 0)) return null;
  const p: Vec3 = [rayOrigin[0] + t * rayDir[0], rayOrigin[1] + t * rayDir[1], planeZMm];
  if (!(p[2] < 0)) return null;
  const g = gazeFromDirection(p);
  return { distanceM: Math.hypot(p[0], p[1], p[2]) / 1000, directionDeg: { x: g.xDeg, y: g.yDeg } };
}
