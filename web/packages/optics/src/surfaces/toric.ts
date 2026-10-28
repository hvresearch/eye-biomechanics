import type { ToricSurface } from "./types";

const DEG = Math.PI / 180;

function curvature(radiusMm: number): number {
  return Number.isFinite(radiusMm) ? 1 / radiusMm : 0;
}

/** Decentered coordinates rotated into the toric's principal sections (u along axisDeg). */
function local(s: ToricSurface, x: number, y: number): { u: number; v: number; cos: number; sin: number } {
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  const cos = Math.cos(s.axisDeg * DEG);
  const sin = Math.sin(s.axisDeg * DEG);
  return { u: dx * cos + dy * sin, v: -dx * sin + dy * cos, cos, sin };
}

/**
 * Biconic sag z = (cx u² + cy v²) / (1 + √(1 − (1+kx) cx² u² − (1+ky) cy² v²)), mm; NaN beyond
 * the surface's edge.
 */
export function toricSag(s: ToricSurface, x: number, y: number): number {
  const { u, v } = local(s, x, y);
  const cx = curvature(s.rxMm);
  const cy = curvature(s.ryMm);
  const arg = 1 - (1 + s.conicX) * cx * cx * u * u - (1 + s.conicY) * cy * cy * v * v;
  if (arg < 0) return Number.NaN;
  return (cx * u * u + cy * v * v) / (1 + Math.sqrt(arg));
}

/** Slopes (∂z/∂x, ∂z/∂y) of the biconic, analytic. */
export function toricSlope(s: ToricSurface, x: number, y: number): [number, number] {
  const { u, v, cos, sin } = local(s, x, y);
  const cx = curvature(s.rxMm);
  const cy = curvature(s.ryMm);
  const ax = (1 + s.conicX) * cx * cx;
  const ay = (1 + s.conicY) * cy * cy;
  const arg = 1 - ax * u * u - ay * v * v;
  if (!(arg > 0)) return [Number.NaN, Number.NaN];
  const sq = Math.sqrt(arg);
  const D = 1 + sq;
  const N = cx * u * u + cy * v * v;
  // d(sq)/du = −ax·u/sq, d(sq)/dv = −ay·v/sq.
  const dzdu = (2 * cx * u * D + (N * ax * u) / sq) / (D * D);
  const dzdv = (2 * cy * v * D + (N * ay * v) / sq) / (D * D);
  return [dzdu * cos - dzdv * sin, dzdu * sin + dzdv * cos];
}

/** Vertex curvature of the section along the meridian at angle `meridianRad`, per mm. */
export function toricMeridianCurvature(s: ToricSurface, meridianRad: number): number {
  const d = meridianRad - s.axisDeg * DEG;
  const c = Math.cos(d);
  const sn = Math.sin(d);
  return curvature(s.rxMm) * c * c + curvature(s.ryMm) * sn * sn;
}
