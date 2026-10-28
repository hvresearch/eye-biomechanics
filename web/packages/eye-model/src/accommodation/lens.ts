import type { EyeParameters, Surface } from "../schema/types";

export interface LensGeometry {
  anteriorRadiusMm: number;
  posteriorRadiusMm: number;
  thicknessMm: number;
  anteriorConic: number;
  posteriorConic: number;
  index555: number;
  anteriorChamberDepthMm: number;
}

export const SURFACE_NAMES = {
  corneaAnterior: "cornea.anterior",
  corneaPosterior: "cornea.posterior",
  lensAnterior: "lens.anterior",
  lensPosterior: "lens.posterior",
} as const;

export function findSurface(params: EyeParameters, name: string): Surface {
  const s = params.surfaces.find((x) => x.name === name);
  if (s === undefined) throw new Error(`EyeParameters "${params.id}" has no surface named ${name}`);
  return s;
}

/** Reference radius of a lens surface: `radiusMm`, or the section along `axisDeg` (`rxMm`) for a toric. */
function radius(s: Surface): number {
  const r = s.type === "toric" ? s.rxMm : s.radiusMm;
  if (r === undefined) throw new Error(`Surface ${s.name} has no ${s.type === "toric" ? "rxMm" : "radiusMm"}`);
  return r;
}

/** Reference conic constant: `conic`, or `conicX` for a toric. */
function conicOf(s: Surface): number {
  return (s.type === "toric" ? s.conicX : s.conic) ?? 0;
}

/**
 * Relaxed lens geometry read straight from the document's surfaces. For a toric lens surface
 * the radius and conic are those of its `axisDeg` section; the builder applies the
 * accommodation change to both sections.
 */
export function relaxedLensGeometry(params: EyeParameters): LensGeometry {
  const cp = findSurface(params, SURFACE_NAMES.corneaPosterior);
  const la = findSurface(params, SURFACE_NAMES.lensAnterior);
  const lp = findSurface(params, SURFACE_NAMES.lensPosterior);
  return {
    anteriorRadiusMm: radius(la),
    posteriorRadiusMm: radius(lp),
    thicknessMm: la.thicknessToNextMm,
    anteriorConic: conicOf(la),
    posteriorConic: conicOf(lp),
    index555: la.mediumAfter.index555,
    anteriorChamberDepthMm: cp.thicknessToNextMm,
  };
}

function coefficient(coeffs: Record<string, unknown>, key: string): number {
  const v = coeffs[key];
  if (typeof v !== "number") throw new Error(`lensAccommodationModel is missing coefficient "${key}"`);
  return v;
}

/**
 * Lens geometry at accommodation A (diopters) for the document's accommodation model.
 * Without a model the relaxed geometry is returned at any A (used for raw fixtures).
 *
 * navarro1985: Navarro, Santamaría & Bescós 1985 Table 4, with L = ln(1 + A):
 *   R_a = R_a0 + a·L, R_p = R_p0 + b·L, t = t0 + c·L, ACD = ACD0 + d·L,
 *   n = n0 + e·(10A + A²), Q_a = Q_a0 + f·L, Q_p = Q_p0 + g·L,
 * every coefficient read from the document (transcribed in data/schematic-eyes).
 */
export function lensGeometry(params: EyeParameters, accommodationD: number): LensGeometry {
  if (!(accommodationD >= 0)) throw new RangeError(`accommodationD must be >= 0, got ${accommodationD}`);
  const relaxed = relaxedLensGeometry(params);
  const model = params.lensAccommodationModel;
  if (model === undefined) return relaxed;
  const form = model.form;
  if (form === "navarro1985") {
    const c = model.coefficients ?? {};
    const A = accommodationD;
    const L = Math.log1p(A);
    return {
      anteriorRadiusMm: relaxed.anteriorRadiusMm + coefficient(c, "anteriorRadiusPerLn") * L,
      posteriorRadiusMm: relaxed.posteriorRadiusMm + coefficient(c, "posteriorRadiusPerLn") * L,
      thicknessMm: relaxed.thicknessMm + coefficient(c, "thicknessPerLn") * L,
      anteriorChamberDepthMm: relaxed.anteriorChamberDepthMm + coefficient(c, "chamberDepthPerLn") * L,
      index555: relaxed.index555 + coefficient(c, "indexCoeff") * (10 * A + A * A),
      anteriorConic: relaxed.anteriorConic + coefficient(c, "anteriorConicPerLn") * L,
      posteriorConic: relaxed.posteriorConic + coefficient(c, "posteriorConicPerLn") * L,
    };
  }
  throw new Error(`Unknown lensAccommodationModel form "${String(form)}"`);
}

/** Largest lens parameter the solver will try before giving up on a larger response. */
const MAX_LENS_PARAMETER_D = 64;

/**
 * Lens-model parameter A whose built optics accommodate by `accommodationD`, i.e. whose
 * paraxial far point lies `accommodationD` diopters nearer than the relaxed eye's:
 * farPointAt(0) − farPointAt(A) = accommodationD. `farPointAt(A)` returns the far point
 * (clinical sign) of the eye built with parameter A; it is injected so that eye-model does
 * not call optics. The shift grows monotonically with A, so the root is bracketed by
 * doubling and refined by bisection. Throws when the model cannot reach the response.
 */
export function lensParameterForAccommodation(accommodationD: number, farPointAt: (lensParameterA: number) => number): number {
  if (!(accommodationD >= 0)) throw new RangeError(`accommodationD must be >= 0, got ${accommodationD}`);
  if (accommodationD === 0) return 0;
  const far0 = farPointAt(0);
  const shift = (A: number) => far0 - farPointAt(A);
  let lo = 0;
  let hi = Math.max(1, accommodationD);
  while (shift(hi) < accommodationD) {
    lo = hi;
    hi *= 2;
    if (hi > MAX_LENS_PARAMETER_D) {
      throw new RangeError(`The lens accommodation model cannot reach ${accommodationD} D of accommodation`);
    }
  }
  for (let i = 0; i < 60 && hi - lo > 1e-10; i++) {
    const mid = (lo + hi) / 2;
    if (shift(mid) < accommodationD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
