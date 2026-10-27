import { add, dot, normalize, scale, type Vec3 } from "../math/vec3";

/**
 * Vector Snell's law. `normal` is a unit normal facing the incoming ray (dot(dir, normal) < 0
 * for the usual orientation; either sign is accepted). Returns the unit refracted direction, or
 * null on total internal reflection.
 */
export function refract(dir: Vec3, normal: Vec3, n1: number, n2: number): Vec3 | null {
  if (n1 === n2) return dir;
  let n = normal;
  let cosI = -dot(dir, n);
  if (cosI < 0) {
    n = scale(n, -1);
    cosI = -cosI;
  }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  const out = add(scale(dir, eta), scale(n, eta * cosI - Math.sqrt(k)));
  return normalize(out);
}
