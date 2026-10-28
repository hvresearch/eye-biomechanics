import { zernikeIndex, zernikeRho2Coefficient } from "../math/zernike";

const DEG = Math.PI / 180;

/** Sphero-cylindrical refraction (minus cylinder) and its Thibos power vectors, diopters. */
export interface Refraction {
  sphereD: number;
  cylinderD: number;
  /** Cylinder axis in the optics frame (from +x toward +y), (0, 180]. */
  axisDeg: number;
  M: number;
  J0: number;
  J45: number;
}

/** An axis angle mapped into (0, 180]. */
export function wrapAxisDeg(deg: number): number {
  const a = ((deg % 180) + 180) % 180;
  return a < 1e-12 ? 180 : a;
}

/** Thibos et al. 1997 power vectors of (S, C, axis): M = S + C/2, J0 = −(C/2)cos 2θ, J45 = −(C/2)sin 2θ. */
export function powerVectors(sphereD: number, cylinderD: number, axisDeg: number): { M: number; J0: number; J45: number } {
  const t = 2 * axisDeg * DEG;
  return { M: sphereD + cylinderD / 2, J0: (-cylinderD / 2) * Math.cos(t), J45: (-cylinderD / 2) * Math.sin(t) };
}

/** Inverse of `powerVectors` in minus-cylinder form; the axis is 180 when there is no cylinder. */
export function sphereCylFromPowerVectors(M: number, J0: number, J45: number): { sphereD: number; cylinderD: number; axisDeg: number } {
  const j = Math.hypot(J0, J45);
  const cylinderD = -2 * j;
  const axisDeg = j === 0 ? 180 : wrapAxisDeg((0.5 * Math.atan2(J45, J0)) / DEG);
  return { sphereD: M - cylinderD / 2, cylinderD, axisDeg };
}

/**
 * Refraction from OSA Zernike coefficients (µm) over a pupil of radius `pupilRadiusMm` (mm).
 *
 * "minimumRms" (Thibos et al. 1997): the second-order terms only, M = −4√3 c(2,0)/r²,
 * J0 = −2√6 c(2,2)/r², J45 = −2√6 c(2,−2)/r²; this is the sphero-cylinder that minimizes the
 * RMS of the residual wavefront.
 *
 * "paraxial": the curvature at the pupil center, which adds the ρ² terms of every higher
 * radial order with m = 0 and |m| = 2 (e.g. +12√5 c(4,0)/r² in M), derived from the
 * polynomials' ρ² coefficients. It matches a paraxial far point and is insensitive to the
 * spherical-aberration bias of the minimum-RMS form.
 */
export function refractionFromZernike(
  coeffsMicrons: readonly number[],
  pupilRadiusMm: number,
  method: "minimumRms" | "paraxial" = "minimumRms",
): Refraction {
  const r2 = pupilRadiusMm * pupilRadiusMm;
  let m0 = 0;
  let mc = 0;
  let ms = 0;
  coeffsMicrons.forEach((c, j) => {
    const { n, m } = zernikeIndex(j);
    if (n < 2 || (method === "minimumRms" && n > 2)) return;
    const a = zernikeRho2Coefficient(j) * c;
    if (m === 0) m0 += a;
    else if (m === 2) mc += a;
    else if (m === -2) ms += a;
  });
  // A ρ² term a·r²/R² (µm, r in mm) is the wavefront −(P/2)·r² of a power P in diopters, so P = −2a/R².
  const M = (-2 * m0) / r2;
  const J0 = (-2 * mc) / r2;
  const J45 = (-2 * ms) / r2;
  return { ...sphereCylFromPowerVectors(M, J0, J45), M, J0, J45 };
}
