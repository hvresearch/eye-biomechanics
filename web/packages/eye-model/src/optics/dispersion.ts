import type { CauchyDispersion, Surface } from "@eye/optics";
import photopic from "../../../../../data/color/cie-1924-photopic.json";
import table from "../../../../../data/dispersion/escudero-sanz-1999.json";

export type MediumName = keyof typeof table.media;
const MEDIA = Object.keys(table.media) as MediumName[];

/**
 * Least-squares Cauchy coefficients (B, C of n = A + B/λ² + C/λ⁴, λ in µm). Written here rather
 * than calling optics' `cauchyFit` because eye-model imports optics for types only; a test
 * checks that the two agree.
 */
function fit(wavelengthsNm: readonly number[], indices: readonly number[]): CauchyDispersion {
  const xs = wavelengthsNm.map((wl) => (wl / 1000) ** -2);
  // Normal equations for [1, x, x²], solved by Cramer's rule (3×3).
  const s = [0, 0, 0, 0, 0];
  const t = [0, 0, 0];
  xs.forEach((x, i) => {
    for (let p = 0; p < 5; p++) s[p]! += x ** p;
    for (let p = 0; p < 3; p++) t[p]! += (x ** p) * indices[i]!;
  });
  const m = [
    [s[0]!, s[1]!, s[2]!],
    [s[1]!, s[2]!, s[3]!],
    [s[2]!, s[3]!, s[4]!],
  ];
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m);
  const col = (k: number) => m.map((row, r) => row.map((v, c) => (c === k ? t[r]! : v)));
  return { form: "cauchy", bUm2: det(col(1)) / d, cUm4: det(col(2)) / d };
}

/** Cauchy dispersion of each ocular medium, fitted to Escudero-Sanz & Navarro 1999 Table 2 (data/dispersion). */
export const MEDIA_DISPERSION: Record<MediumName, CauchyDispersion> = Object.fromEntries(
  MEDIA.map((name) => [name, fit(table.wavelengthsNm, table.media[name])]),
) as Record<MediumName, CauchyDispersion>;

export const DISPERSION_TABLE = table;

/**
 * Attach the ocular media's dispersion by `mediumAfter.name` (cornea, aqueous, lens, vitreous)
 * unless the medium already carries one. Media with other names (air, spectacle lenses) stay
 * non-dispersive.
 */
export function withDispersion(surfaces: readonly Surface[]): Surface[] {
  return surfaces.map((s) => {
    const name = s.mediumAfter.name as MediumName;
    if (s.mediumAfter.dispersion !== undefined || !MEDIA.includes(name)) return s;
    return { ...s, mediumAfter: { ...s.mediumAfter, dispersion: { ...MEDIA_DISPERSION[name] } } };
  });
}

/** Wavelengths and V(λ) weights (normalized to sum 1) of the polychromatic PSF (spec §5.4). */
export const PHOTOPIC: { wavelengthsNm: number[]; weights: number[]; citation: string } = (() => {
  const sum = photopic.V.reduce((a, b) => a + b, 0);
  return { wavelengthsNm: [...photopic.wavelengthsNm], weights: photopic.V.map((v) => v / sum), citation: photopic.citation };
})();
