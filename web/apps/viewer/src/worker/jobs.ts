import {
  applyRefraction,
  applyRefractivePreset,
  decomposeRefraction,
  loadPreset,
  mirrorEye,
  validateEyeParameters,
  type Decomposition,
  type EyeParameters,
  type FarPointFn,
  type PresetName,
} from "@eye/eye-model";
import { paraxialPower } from "@eye/optics";

/** Paraxial far point in one meridian, for presets and the decomposition. */
export const farPointOf: FarPointFn = (s, meridianDeg = 0) => paraxialPower(s, 1, { meridianDeg }).farPointD;

/**
 * Work on the eye documents that runs paraxial optics, so it runs in the worker (CLAUDE.md: all
 * optics off the main thread):
 * - `preset`: the schematic eye with a refractive preset solved into the right eye, the left its mirror;
 * - `predicted`: the schematic eye with a predicted refraction put into its anterior cornea;
 * - `decomposition`: only the decomposition of a right eye against the schematic eye.
 */
export type EyesJob =
  | { kind: "preset"; schematic: PresetName; refractive: string }
  | { kind: "predicted"; schematic: PresetName; rx: { sphereD: number; cylinderD: number; axisDeg: number }; ageYears: number }
  | { kind: "decomposition"; eye: EyeParameters; schematic: PresetName };

export interface EyesJobResult {
  /** Both eyes (null for a decomposition job). */
  eyes: { left: EyeParameters; right: EyeParameters } | null;
  /** The right eye's decomposition, or null when it cannot be computed. */
  decomposition: Decomposition | null;
}

/** The decomposition readout relative to the schematic eye, or null when it cannot be computed. */
function decompose(eye: EyeParameters, schematic: PresetName): Decomposition | null {
  try {
    return decomposeRefraction(eye, loadPreset(schematic), farPointOf);
  } catch {
    return null;
  }
}

/**
 * Both eyes with a predicted refraction at an age: the schematic eye's anterior cornea changed so
 * the right eye's refraction moves by the predicted sphere and cylinder (an approximation:
 * remodeling acts on the whole globe), the left its mirror.
 */
function predictedRight(schematic: PresetName, rx: { sphereD: number; cylinderD: number; axisDeg: number }, ageYears: number): EyeParameters {
  const base = loadPreset(schematic);
  const doc = applyRefraction(base, { mechanism: "corneal", sphereD: rx.sphereD, cylinderD: rx.cylinderD, axisDegTabo: rx.axisDeg }, farPointOf, "right");
  doc.id = `${base.id}-predicted-${ageYears}y-right`;
  doc.label = `Predicted at ${ageYears} years, right eye (${base.label})`;
  const r = validateEyeParameters(doc);
  if (!r.ok) throw new Error(`The predicted eye does not validate: ${r.errors.join("; ")}`);
  return r.value;
}

/** Pure job handler, shared by the worker and the store's in-process fallback (unit tests). */
export function runEyesJob(job: EyesJob): EyesJobResult {
  switch (job.kind) {
    case "preset": {
      const right = applyRefractivePreset(loadPreset(job.schematic), job.refractive, farPointOf, "right");
      return { eyes: { right, left: mirrorEye(right, "left") }, decomposition: decompose(right, job.schematic) };
    }
    case "predicted": {
      const right = predictedRight(job.schematic, job.rx, job.ageYears);
      return { eyes: { right, left: mirrorEye(right, "left") }, decomposition: decompose(right, job.schematic) };
    }
    case "decomposition":
      return { eyes: null, decomposition: decompose(job.eye, job.schematic) };
  }
}
