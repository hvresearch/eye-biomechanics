import { cross, type Vec3 } from "./vec";

/** Unit quaternion [x, y, z, w] representing a rotation. */
export type Quat = readonly [number, number, number, number];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(n > 0)) throw new RangeError("Rotation axis must be non-zero");
  const s = Math.sin(angleRad / 2) / n;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angleRad / 2)];
}

/** Hamilton product a·b (apply b, then a). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(n > 0)) throw new RangeError("Cannot normalize a zero quaternion");
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Rotate v by the unit quaternion q: v' = q v q*. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  const k = 2 * w;
  return [v[0] + k * uv[0] + 2 * uuv[0], v[1] + k * uv[1] + 2 * uuv[1], v[2] + k * uv[2] + 2 * uuv[2]];
}
