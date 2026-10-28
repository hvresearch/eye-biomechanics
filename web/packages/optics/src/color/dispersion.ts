import type { Medium } from "../surfaces/types";

/** Reference wavelength of `Medium.index555`, µm. */
const REF_UM = 0.555;

/**
 * Index of the medium at `wavelengthNm`: `index555` plus the Cauchy law's change from 555 nm,
 * n(λ) = index555 + B(λ⁻² − 0.555⁻²) + C(λ⁻⁴ − 0.555⁻⁴). A medium without dispersion has the
 * same index at every wavelength.
 */
export function indexAt(m: Medium, wavelengthNm: number): number {
  const d = m.dispersion;
  if (d === undefined || wavelengthNm === 555) return m.index555;
  const l2 = (wavelengthNm / 1000) ** -2;
  const r2 = REF_UM ** -2;
  return m.index555 + d.bUm2 * (l2 - r2) + d.cUm4 * (l2 * l2 - r2 * r2);
}

/**
 * Least-squares three-term Cauchy fit n(λ) = a + b/λ² + c/λ⁴ (λ in µm) to tabulated indices.
 * Returns the coefficients and the largest absolute residual.
 */
export function cauchyFit(
  wavelengthsNm: readonly number[],
  indices: readonly number[],
): { a: number; bUm2: number; cUm4: number; maxResidual: number } {
  if (wavelengthsNm.length !== indices.length || wavelengthsNm.length < 3) {
    throw new RangeError("cauchyFit needs at least three wavelength–index pairs of equal length");
  }
  // Normal equations for the basis [1, x, x²] with x = λ⁻².
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  wavelengthsNm.forEach((wl, i) => {
    const x = (wl / 1000) ** -2;
    const row = [1, x, x * x];
    for (let r = 0; r < 3; r++) {
      atb[r]! += row[r]! * indices[i]!;
      for (let c = 0; c < 3; c++) ata[r]![c]! += row[r]! * row[c]!;
    }
  });
  const [a, b, c] = solve3(ata, atb);
  let maxResidual = 0;
  wavelengthsNm.forEach((wl, i) => {
    const x = (wl / 1000) ** -2;
    maxResidual = Math.max(maxResidual, Math.abs(a + b * x + c * x * x - indices[i]!));
  });
  return { a, bUm2: b, cUm4: c, maxResidual };
}

/** Gaussian elimination with partial pivoting for a 3×3 system. */
function solve3(A: number[][], b: number[]): [number, number, number] {
  const m = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    [m[col], m[piv]] = [m[piv]!, m[col]!];
    for (let r = col + 1; r < 3; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c < 4; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = m[r]![3]!;
    for (let c = r + 1; c < 3; c++) s -= m[r]![c]! * x[c]!;
    x[r] = s / m[r]![r]!;
  }
  return [x[0]!, x[1]!, x[2]!];
}
