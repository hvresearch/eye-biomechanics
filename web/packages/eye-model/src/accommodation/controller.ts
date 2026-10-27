import table from "../../../../../data/accommodation/lag-default.json";

export interface LagTable {
  name: string;
  form: string;
  equation: string;
  coefficients: { slope: number; onsetD: number };
  minTargetDistanceM: number;
  citation: string;
  verified: boolean;
}

export const LAG_TABLE: LagTable = table;

/** Closest target the controller accepts; nearer targets clamp here (never NaN). */
export const MIN_TARGET_DISTANCE_M = LAG_TABLE.minTargetDistanceM;

/** Lag of accommodation (D) as a function of demand (D). */
export type LagModel = (demandD: number) => number;

/** Piecewise-linear default lag: zero below onset, slope·(demand − onset) above. Approximation. */
export const defaultLag: LagModel = (demandD) =>
  Math.max(0, LAG_TABLE.coefficients.slope * (demandD - LAG_TABLE.coefficients.onsetD));

/**
 * Accommodative demand (D) for a target at `targetDistanceM`, relative to the eye's far
 * point. `farPointD` uses the clinical refractive-error sign: a 3 D myope has a far
 * point at 1/3 m and `farPointD = −3`; a 2 D hyperope has `farPointD = +2`; an
 * emmetrope 0. demand = max(0, 1/d + farPointD), so the uncorrected myope needs less
 * accommodation for a near target and the hyperope needs more even at infinity.
 * `Infinity` is a distant target.
 */
export function demandFromDistance(targetDistanceM: number, farPointD: number): number {
  if (Number.isNaN(targetDistanceM) || targetDistanceM < 0) {
    throw new RangeError(`targetDistanceM must be >= 0, got ${targetDistanceM}`);
  }
  const d = Math.max(targetDistanceM, MIN_TARGET_DISTANCE_M);
  const stimulus = Number.isFinite(d) ? 1 / d : 0;
  return Math.max(0, stimulus + farPointD);
}

/** Steady-state accommodative response: demand minus lag, clipped to [0, amplitude]. */
export function accommodationResponse(
  demandD: number,
  amplitudeD: number,
  lag: LagModel = defaultLag,
): number {
  const r = demandD - lag(demandD);
  return Math.min(Math.max(r, 0), Math.max(amplitudeD, 0));
}
