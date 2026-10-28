import { zernikeBasis, zernikeCount } from "../math/zernike";
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

/** Cholesky solve of the symmetric positive-definite system A x = b (A is overwritten). */
function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array {
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
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= A[i * n + k]! * y[k]!;
    y[i] = s / A[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= A[k * n + i]! * x[k]!;
    x[i] = s / A[i * n + i]!;
  }
  return x;
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
  const ata = new Float64Array(J * J);
  const atb = new Float64Array(J);
  const z = new Float64Array(J);
  const basis = new Float64Array(nValid * J); // kept for the residual pass
  const R = map.pupilRadiusMm;
  let row = 0;
  for (let i = 0; i < total; i++) {
    if (!map.valid[i]) continue;
    const x = map.xs[i]!;
    const y = map.ys[i]!;
    zernikeBasis(maxRadialOrder, Math.sqrt(x * x + y * y) / R, Math.atan2(y, x), z);
    basis.set(z, row * J);
    row++;
    const w = map.opdMicrons[i]!;
    for (let a = 0; a < J; a++) {
      const za = z[a]!;
      atb[a]! += za * w;
      const base = a * J;
      for (let b = 0; b <= a; b++) ata[base + b]! += za * z[b]!;
    }
  }
  for (let a = 0; a < J; a++) for (let b = a + 1; b < J; b++) ata[a * J + b] = ata[b * J + a]!;
  const c = choleskySolve(ata, atb, J);

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
  zernikeBasis(order, Math.hypot(x, y) / pupilRadiusMm, Math.atan2(y, x), z);
  let w = 0;
  coeffsMicrons.forEach((c, j) => (w += c * (z[j] ?? 0)));
  return w;
}
