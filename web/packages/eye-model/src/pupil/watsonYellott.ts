import table from "../../../../../data/pupil/watson-yellott-2012.json";

export const WATSON_YELLOTT = table;

function check(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be a non-negative finite number, got ${v}`);
}

/** Stanley & Davies diameter (mm) at the effective corneal flux F = L·a·M(e) (Watson & Yellott 2012). */
export function stanleyDaviesMm(luminanceCdM2: number, fieldAreaDeg2: number, eyes: 1 | 2): number {
  check("luminanceCdM2", luminanceCdM2);
  check("fieldAreaDeg2", fieldAreaDeg2);
  const { maxMm, rangeMm, fluxScale, exponent, halfConstant } = table.stanleyDavies;
  const m = eyes === 1 ? table.monocular.oneEye : table.monocular.twoEyes;
  const x = ((luminanceCdM2 * fieldAreaDeg2 * m) / fluxScale) ** exponent;
  return maxMm - (rangeMm * x) / (x + halfConstant);
}

/**
 * Watson & Yellott 2012 unified light-adapted pupil diameter (mm): the Stanley & Davies
 * diameter adjusted linearly for age about the reference age, with a slope that is itself
 * linear in that diameter. Ages are clamped to the formula's domain (20–83 years).
 */
export function watsonYellottMm(luminanceCdM2: number, fieldAreaDeg2: number, ageYears: number, eyes: 1 | 2): number {
  if (Number.isNaN(ageYears)) throw new RangeError("ageYears is NaN");
  const [lo, hi] = table.age.domainYears as [number, number];
  const age = Math.min(hi, Math.max(lo, ageYears));
  const d = stanleyDaviesMm(luminanceCdM2, fieldAreaDeg2, eyes);
  const { referenceYears, slopeIntercept, slopePerMm } = table.age;
  return d + (age - referenceYears) * (slopeIntercept + slopePerMm * d);
}
