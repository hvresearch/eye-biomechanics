import type { EyeParameters } from "../schema/types";
import { NEAR_RESPONSE, nearMiosisMm } from "./nearResponse";
import { WATSON_YELLOTT, watsonYellottMm } from "./watsonYellott";

/** Scene inputs to the pupil: field luminance, the subject's age, and the current vergence demand. */
export interface PupilInputs {
  luminanceCdM2: number;
  ageYears: number;
  vergenceMA: number;
}

/** The default pupil model of the presets (spec §4.3): Watson & Yellott with the data file's viewing defaults. */
export const DEFAULT_PUPIL: EyeParameters["pupil"] = {
  model: "watsonYellott2012",
  params: { ...WATSON_YELLOTT.defaults },
};

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`pupil.params.${key} must be a number`);
  return v;
}

/** Light-adapted diameter before near miosis (mm). */
export function pupilBaseMm(params: EyeParameters, inputs: PupilInputs): number {
  const { model, params: p } = params.pupil;
  if (model === "fixed") {
    const d = p.diameterMm;
    if (typeof d !== "number" || !(d > 0)) throw new Error(`pupil.params.diameterMm must be a positive number`);
    return d;
  }
  if (model === "watsonYellott2012") {
    const eyes = num(p, "eyes");
    if (eyes !== 1 && eyes !== 2) throw new Error(`pupil.params.eyes must be 1 or 2, got ${eyes}`);
    return watsonYellottMm(inputs.luminanceCdM2, num(p, "fieldAreaDeg2"), inputs.ageYears, eyes);
  }
  throw new Error(`Unsupported pupil model "${model}" (supported: "fixed", "watsonYellott2012")`);
}

/**
 * Pupil diameter (mm) from the document's pupil model. `"fixed"` returns its `diameterMm`
 * unchanged (fixtures). `"watsonYellott2012"` applies the unified formula at the scene's
 * luminance and age, subtracts the near miosis for the vergence demand (spec §4.3, driven by
 * vergence after Feil 2017), and floors the result at 2 mm.
 */
export function pupilDiameterMm(params: EyeParameters, inputs: PupilInputs): number {
  const base = pupilBaseMm(params, inputs);
  if (params.pupil.model === "fixed") return base;
  return Math.max(NEAR_RESPONSE.floorMm, base - nearMiosisMm(inputs.vergenceMA));
}
