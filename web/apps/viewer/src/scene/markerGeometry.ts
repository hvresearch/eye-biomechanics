import type { MusclePath } from "@eye/eye-model";

type P3 = [number, number, number];

/** Samples along a drawn insertion arc (a drawing choice). */
export const INSERTION_ARC_SAMPLES = 12;
/** Drawn markers sit this fraction outside the globe so they do not z-fight with it (drawing). */
export const MARKER_LIFT = 1.015;

/**
 * The insertion drawn as an arc of the great circle through the insertion point, across the
 * muscle (perpendicular to its last segment), `widthMm` long, in the eye's local frame.
 */
export function insertionArc(path: MusclePath, widthMm: number, samples = INSERTION_ARC_SAMPLES): P3[] {
  const n = path.points.length;
  const p = path.points[n - 1];
  const q = path.points[n - 2];
  if (!p || !q) return [];
  const R = Math.hypot(p[0], p[1], p[2]);
  if (!(R > 0)) return [];
  const u: P3 = [p[0] / R, p[1] / R, p[2] / R];
  // Along the muscle at the insertion, then across it: w = û × t, tangent to the sphere.
  const t: P3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const w: P3 = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  const wl = Math.hypot(w[0], w[1], w[2]);
  if (!(wl > 0)) return [];
  const half = widthMm / (2 * R);
  const r = R * MARKER_LIFT;
  const pts: P3[] = [];
  for (let i = 0; i <= samples; i++) {
    const a = -half + (2 * half * i) / samples;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([r * (u[0] * c + (w[0] / wl) * s), r * (u[1] * c + (w[1] / wl) * s), r * (u[2] * c + (w[2] / wl) * s)]);
  }
  return pts;
}
