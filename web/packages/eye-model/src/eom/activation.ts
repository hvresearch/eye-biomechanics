import table from "../../../../../data/eom/activation.json";
import { MUSCLE_NAMES, defaultMuscles } from "./geometry";

/** Shape of data/eom/activation.json. */
export interface ActivationTable {
  name: string;
  form: string;
  equation: string;
  baseline: number;
  gain: number;
  citation: string;
  verified: boolean;
}

export const ACTIVATION_TABLE: ActivationTable = table;

/** Index of each muscle's antagonist, in `MUSCLE_NAMES` order. */
const ANTAGONIST_INDEX: readonly number[] = defaultMuscles().map((m) => MUSCLE_NAMES.indexOf(m.antagonist));

/**
 * Length-proxy activation in [0, 1] for the six muscles in `MUSCLE_NAMES` order
 * (approximation, spec §4.4 v1): each muscle's fractional shortening from its primary-position
 * length, compared with its antagonist's, so the antagonist relaxes as the agonist shortens
 * (reciprocal innervation). Equation in data/eom/activation.json.
 */
export function activations(
  lengthsMm: readonly number[],
  restLengthsMm: readonly number[],
  t: ActivationTable = ACTIVATION_TABLE,
): number[] {
  if (lengthsMm.length !== MUSCLE_NAMES.length || restLengthsMm.length !== MUSCLE_NAMES.length) {
    throw new RangeError(`activations needs ${MUSCLE_NAMES.length} lengths and rest lengths`);
  }
  const s = lengthsMm.map((l, i) => {
    const rest = restLengthsMm[i]!;
    if (!(rest > 0)) throw new RangeError("Rest lengths must be positive");
    return (rest - l) / rest;
  });
  return s.map((si, i) => Math.min(1, Math.max(0, t.baseline + (t.gain * (si - s[ANTAGONIST_INDEX[i]!]!)) / 2)));
}
