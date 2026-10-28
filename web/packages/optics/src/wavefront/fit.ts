import { zernikeBasisXY, zernikeCount } from "../math/zernike";
import { InsufficientRaysError } from "../metrics/defocus";
import type { OpdMap } from "./opd";

/** Fraction of pupil samples that must be valid before a wavefront is fitted (Review Focus 3). */
const MIN_VALID_FRACTION = 0.6;

export interface ZernikeFit {
  /** OSA/ANSI coefficients, µm, j = 0 … zernikeCount(maxOrder) − 1. */
  coeffsMicrons: number[];
  maxOrder: number;
  /** RMS wavefront error excluding piston and tilt (j ≥ 3), µm. */
  rmsMicrons: number;
  /** Higher-order RMS (n ≥ 3, j ≥ 6), µm. */
  hoRmsMicrons: number;
  /** RMS of the data about the fitted polynomial, µm. */
  residualRmsMicrons: number;
  pupilRadiusMm: number;
}

/** In-place Cholesky factorization A = L·Lᵀ of a symmetric positive-definite n × n matrix (L in the lower triangle). */
function choleskyFactor(A: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j]!;
    for (let k = 0; k < j; k++) d -= A[j * n + k]! ** 2;
    if (!(d > 0)) throw new Error("Zernike fit is singular: too few or degenerate pupil samples");
    const ljj = Math.sqrt(d);
    A[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j]!;
      for (let k = 0; k < j; k++) s -= A[i * n + k]! * A[j * n + k]!;
      A[i * n + j] = s / ljj;
    }
  }
  return A;
}

/** Solve L·Lᵀ x = b with a factor from `choleskyFactor`. */
function choleskySolve(L: Float64Array, b: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i * n + k]! * y[k]!;
    y[i] = s / L[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k * n + i]! * x[k]!;
    x[i] = s / L[i * n + i]!;
  }
  return x;
}

/** The basis matrix of a sample layout and the Cholesky factor of its normal equations. */
interface Design {
  basis: Float64Array;
  factor: Float64Array;
}

/**
 * Designs by sample layout (pupil grid, radius, order, and which samples are valid). Maps that
 * share a layout, such as the eye with and without spectacles in one request, fit with one
 * factorization.
 */
const designs = new Map<string, Design>();
const DESIGN_CACHE_SIZE = 8;

function layoutKey(map: OpdMap, maxOrder: number): string {
  let sig = 0;
  for (let i = 0; i < map.valid.length; i++) if (map.valid[i]) sig = (sig * 31 + i + 1) % 2147483647;
  return `${maxOrder}|${map.gridN}|${map.pupilRadiusMm}|${map.valid.length}|${sig}|${map.xs[0]}|${map.ys[0]}`;
}

function design(map: OpdMap, maxOrder: number, nValid: number): Design {
  const key = layoutKey(map, maxOrder);
  let d = designs.get(key);
  if (d !== undefined) return d;
  const J = zernikeCount(maxOrder);
  const ata = new Float64Array(J * J);
  const z = new Float64Array(J);
  const basis = new Float64Array(nValid * J);
  const R = map.pupilRadiusMm;
  let row = 0;
  for (let i = 0; i < map.valid.length; i++) {
    if (!map.valid[i]) continue;
    zernikeBasisXY(maxOrder, map.xs[i]! / R, map.ys[i]! / R, z);
    basis.set(z, row * J);
    row++;
    for (let a = 0; a < J; a++) {
      const za = z[a]!;
      const base = a * J;
      for (let b = 0; b <= a; b++) ata[base + b]! += za * z[b]!;
    }
  }
  d = { basis, factor: choleskyFactor(ata, J) };
  if (designs.size >= DESIGN_CACHE_SIZE) designs.clear();
  designs.set(key, d);
  return d;
}

/**
 * Least-squares Zernike fit of the valid samples of an OPD map on the unit disk of radius
 * `map.pupilRadiusMm` (normal equations, Cholesky). Throws `InsufficientRaysError` when fewer
 * than 60% of the samples are valid.
 */
export function fitZernike(map: OpdMap, maxRadialOrder = 8): ZernikeFit {
  const total = map.valid.length;
  let nValid = 0;
  for (let i = 0; i < total; i++) nValid += map.valid[i]!;
  if (nValid < MIN_VALID_FRACTION * total || nValid === 0) throw new InsufficientRaysError(nValid, total);
  const J = zernikeCount(maxRadialOrder);
  const { basis, factor } = design(map, maxRadialOrder, nValid);
  const R = map.pupilRadiusMm;
  const atb = new Float64Array(J);
  let row = 0;
  for (let i = 0; i < total; i++) {
    if (!map.valid[i]) continue;
    const w = map.opdMicrons[i]!;
    const off = row * J;
    for (let a = 0; a < J; a++) atb[a]! += basis[off + a]! * w;
    row++;
  }
  const c = choleskySolve(factor, atb, J);

  let res = 0;
  row = 0;
  for (let i = 0; i < total; i++) {
    if (!map.valid[i]) continue;
    let f = 0;
    const off = row * J;
    for (let a = 0; a < J; a++) f += c[a]! * basis[off + a]!;
    row++;
    res += (map.opdMicrons[i]! - f) ** 2;
  }
  const coeffs = Array.from(c);
  const sumSq = (from: number) => coeffs.slice(from).reduce((s, v) => s + v * v, 0);
  return {
    coeffsMicrons: coeffs,
    maxOrder: maxRadialOrder,
    rmsMicrons: Math.sqrt(sumSq(3)),
    hoRmsMicrons: Math.sqrt(sumSq(6)),
    residualRmsMicrons: Math.sqrt(res / nValid),
    pupilRadiusMm: R,
  };
}

/** Wavefront of the coefficients at pupil position (x, y) relative to the center, µm. */
export function zernikeWavefront(coeffsMicrons: readonly number[], x: number, y: number, pupilRadiusMm: number): number {
  let order = 0;
  while (zernikeCount(order) < coeffsMicrons.length) order++;
  const z = new Float64Array(zernikeCount(order));
  zernikeBasisXY(order, x / pupilRadiusMm, y / pupilRadiusMm, z);
  let w = 0;
  coeffsMicrons.forEach((c, j) => (w += c * (z[j] ?? 0)));
  return w;
}
