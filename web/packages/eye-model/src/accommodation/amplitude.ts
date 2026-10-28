import table from "../../../../../data/accommodation/anderson-2008-amplitude.json";

export interface AmplitudeTable {
  name: string;
  citation: string;
  doi: string;
  verified: boolean;
  equation: string;
  coefficients: { maxD: number; slopePerYear: number; centerAgeYears: number; offset: number };
  domain: { minAgeYears: number; maxAgeYears: number; note?: string };
}

export const AMPLITUDE_TABLE: AmplitudeTable = table;

/**
 * Objective accommodative amplitude in diopters as a function of age (Anderson et al.
 * 2008 sigmoid). Ages below the table's domain use the lower bound; ages above it
 * return 0 (presbyopia).
 */
export function amplitudeForAge(ageYears: number): number {
  if (Number.isNaN(ageYears)) throw new RangeError("ageYears is NaN");
  const { minAgeYears, maxAgeYears } = AMPLITUDE_TABLE.domain;
  if (ageYears > maxAgeYears) return 0;
  const age = Math.max(ageYears, minAgeYears);
  const { maxD, slopePerYear, centerAgeYears, offset } = AMPLITUDE_TABLE.coefficients;
  return maxD / (1 + Math.exp(slopePerYear * (age - centerAgeYears) - offset));
}
