import { amplitudeForAge } from "../accommodation/amplitude";
import { accommodationResponse, demandFromDistance } from "../accommodation/controller";
import type { EyeParameters } from "../schema/types";
import { validateEyeParameters } from "../schema/validate";
import type { EyeState, SceneState } from "./types";

export class SchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaVersionError";
  }
}

/** Throws SchemaVersionError for an unsupported major version, Error for other schema failures. */
export function assertSupported(params: EyeParameters): void {
  const r = validateEyeParameters(params);
  if (r.ok) return;
  if (r.kind === "version") throw new SchemaVersionError(r.errors.join("; "));
  throw new Error(`EyeParameters "${String(params.id)}" is invalid: ${r.errors.join("; ")}`);
}

/** Pupil diameter from the document's pupil model. Milestone 1 supports only `fixed`. */
export function pupilDiameterMm(params: EyeParameters): number {
  const { model, params: p } = params.pupil;
  if (model === "fixed") {
    const d = p.diameterMm;
    if (typeof d !== "number" || !(d > 0)) throw new Error(`pupil.params.diameterMm must be a positive number`);
    return d;
  }
  throw new Error(`Unsupported pupil model "${model}" (Milestone 1 supports "fixed")`);
}

/**
 * Pure derivation of one eye's state from the scene. Milestone 1 slice: accommodation
 * (demand from target distance and far point, response with lag and amplitude clip),
 * a fixed pupil, identity gaze, and empty muscle arrays.
 *
 * `farPointD` is the eye's refractive error in clinical sign (0 for the presets, which
 * are emmetropic by construction); the viewer passes the paraxial far point when it has
 * one so that ametropic documents reduce or increase demand (spec §4.2).
 */
export function deriveEyeState(
  scene: SceneState,
  params: EyeParameters,
  side: "left" | "right",
  farPointD = 0,
): EyeState {
  void side; // Both eyes derive identically until gaze arrives in Milestone 2.
  assertSupported(params);
  const amplitudeD = amplitudeForAge(scene.ageYears);
  const demandD = demandFromDistance(scene.targetDistanceM, farPointD);
  const accommodationD = accommodationResponse(demandD, amplitudeD);
  return {
    accommodationD,
    demandD,
    amplitudeD,
    pupilMm: pupilDiameterMm(params),
    gaze: [0, 0, 0, 1],
    ciliaryActivation: amplitudeD > 0 ? accommodationD / amplitudeD : 0,
    eomActivation: [],
    eomLengthMm: [],
  };
}
