import { zernikeBasis, zernikeCount, zernikeIndex, zernikeRho2Coefficient } from "../math/zernike";
import { conicSagR2, conicSlopeOverR } from "./conic";
import type { ZernikeSurface } from "./types";

/** Finite-difference step for the slope of the Zernike height, mm (numerical). */
const SLOPE_STEP_MM = 1e-6;

function maxOrderFor(count: number): number {
  let n = 0;
  while (zernikeCount(n) < count) n++;
  return n;
}

/** Zernike height Σ c_j Z_j(r/a, θ) at decentered (dx, dy), mm (coefficients are µm). */
function height(s: ZernikeSurface, dx: number, dy: number): number {
  const count = s.coeffsMicrons.length;
  if (count === 0) return 0;
  const order = maxOrderFor(count);
  const basis = new Float64Array(zernikeCount(order));
  zernikeBasis(order, Math.hypot(dx, dy) / s.normRadiusMm, Math.atan2(dy, dx), basis);
  let h = 0;
  for (let j = 0; j < count; j++) h += (s.coeffsMicrons[j] ?? 0) * (basis[j] ?? 0);
  return h * 1e-3;
}

/** Conic base sag plus the Zernike height, mm; NaN beyond the base conic's edge. */
export function zernikeSurfaceSag(s: ZernikeSurface, x: number, y: number): number {
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  return conicSagR2(s.radiusMm, s.conic, dx * dx + dy * dy) + height(s, dx, dy);
}

/** Slopes (∂z/∂x, ∂z/∂y): the base analytically, the Zernike height by central differences. */
export function zernikeSurfaceSlope(s: ZernikeSurface, x: number, y: number): [number, number] {
  const dx = x - s.decenter.xMm;
  const dy = y - s.decenter.yMm;
  const k = conicSlopeOverR(s.radiusMm, s.conic, dx * dx + dy * dy);
  const h = SLOPE_STEP_MM;
  const hx = (height(s, dx + h, dy) - height(s, dx - h, dy)) / (2 * h);
  const hy = (height(s, dx, dy + h) - height(s, dx, dy - h)) / (2 * h);
  return [k * dx + hx, k * dy + hy];
}

/** Vertex curvature along the meridian: base 1/R plus 2·(ρ² coefficient)/a² of the m = 0, ±2 terms. */
export function zernikeMeridianCurvature(s: ZernikeSurface, meridianRad: number): number {
  let c = Number.isFinite(s.radiusMm) ? 1 / s.radiusMm : 0;
  const a2 = s.normRadiusMm * s.normRadiusMm;
  s.coeffsMicrons.forEach((coef, j) => {
    const r2 = zernikeRho2Coefficient(j);
    if (r2 === 0 || coef === 0) return;
    const { m } = zernikeIndex(j);
    const ang = m === 0 ? 1 : m > 0 ? Math.cos(2 * meridianRad) : Math.sin(2 * meridianRad);
    c += (2 * r2 * coef * 1e-3 * ang) / a2;
  });
  return c;
}
