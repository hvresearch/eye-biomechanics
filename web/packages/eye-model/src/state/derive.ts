import type { Surface } from "@eye/optics";
import { amplitudeForAge } from "../accommodation/amplitude";
import { accommodationResponse, demandFromDistance } from "../accommodation/controller";
import { activations } from "../eom/activation";
import { musclesFromDocument } from "../eom/geometry";
import { musclePath } from "../eom/path";
import { eyeGazes, type DynamicState, type PerEye } from "../gaze/dynamics";
import { gazeQuaternion, type GazeDeg } from "../gaze/listing";
import { eyeDirections, lineOfSightAngleDeg } from "../gaze/vergence";
import { QUAT_IDENTITY } from "../math/quat";
import type { EyeParameters } from "../schema/types";
import { validateEyeParameters } from "../schema/validate";
import { lensParameterFor } from "../build/surfaces";
import type { BinocularState, EyeState, SceneState } from "./types";

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

/** Overrides from the dynamics stepper: where the eye is now rather than where it is headed. */
export interface EyeStateOverrides {
  gaze?: GazeDeg;
  accommodationD?: number;
}

/**
 * Pure derivation of one eye's state from the scene (spec §4.5).
 *
 * Accommodation: demand from this eye's distance to the target and its far point, response
 * with lag and amplitude clip (or `overrides.accommodationD` from the dynamics). Gaze:
 * Listing's law toward the target (or `overrides.gaze`). Muscles: paths, lengths, and
 * length-proxy activations for the document's muscles (or the default table).
 *
 * `farPointD` is the eye's refractive error in clinical sign (0 for the presets, which
 * are emmetropic by construction); the composer passes the paraxial far point when it has
 * one so that ametropic documents reduce or increase demand (spec §4.2).
 *
 * `farPointOf` (the paraxial far point of built surfaces, injected by the composer so that
 * eye-model does not call optics) lets the lens parameter be solved so the optics
 * accommodate by exactly the response. Without it `lensParameterA` equals the response,
 * which overstates the optical accommodation of the Navarro model by roughly 10%.
 */
export function deriveEyeState(
  scene: SceneState,
  params: EyeParameters,
  side: "left" | "right",
  farPointD = 0,
  farPointOf?: (surfaces: Surface[]) => number,
  overrides: EyeStateOverrides = {},
): EyeState {
  assertSupported(params);
  const dirs = eyeDirections({ distanceM: scene.targetDistanceM, directionDeg: scene.targetDirectionDeg }, scene.ipdMm);
  const targetDistanceM = dirs.distanceMm[side] / 1000;
  const amplitudeD = amplitudeForAge(scene.ageYears);
  const demandD = demandFromDistance(targetDistanceM, farPointD);
  const accommodationD = overrides.accommodationD ?? accommodationResponse(demandD, amplitudeD);
  const lensParameterA = farPointOf ? lensParameterFor(params, accommodationD, farPointOf) : accommodationD;

  const gazeDeg = overrides.gaze ?? dirs[side];
  const gaze = gazeQuaternion(gazeDeg);
  const muscles = musclesFromDocument(params);
  const eomRestLengthMm = muscles.map((m) => musclePath(m, QUAT_IDENTITY).lengthMm);
  const eomPaths = muscles.map((m) => musclePath(m, gaze));
  const eomLengthMm = eomPaths.map((p) => p.lengthMm);

  return {
    accommodationD,
    demandD,
    amplitudeD,
    pupilMm: pupilDiameterMm(params),
    gaze,
    gazeDeg,
    targetDistanceM,
    ciliaryActivation: amplitudeD > 0 ? accommodationD / amplitudeD : 0,
    lensParameterA,
    eomActivation: activations(eomLengthMm, eomRestLengthMm),
    eomLengthMm,
    eomRestLengthMm,
    eomPaths,
  };
}

export interface BinocularOptions {
  /** Each eye's relaxed far point (clinical sign); 0 when unknown. */
  farPointD?: PerEye;
  farPointOf?: (surfaces: Surface[]) => number;
  /** Current oculomotor state; when given, gaze and accommodation follow it instead of the static targets. */
  dynamics?: DynamicState;
}

/** Both eyes from one scene (spec §4.5): `derive(scene, eyeParams) → { left, right }`. */
export function deriveBinocular(
  scene: SceneState,
  eyes: { left: EyeParameters; right: EyeParameters },
  opts: BinocularOptions = {},
): BinocularState {
  const dyn = opts.dynamics;
  const gazes = dyn ? eyeGazes(dyn) : undefined;
  const one = (side: "left" | "right") =>
    deriveEyeState(scene, eyes[side], side, opts.farPointD?.[side] ?? 0, opts.farPointOf, {
      ...(gazes ? { gaze: gazes[side] } : {}),
      ...(dyn ? { accommodationD: dyn.accommodationD[side] } : {}),
    });
  // The readout is the angle between the lines of sight in both modes; the dynamics' horizontal
  // azimuth difference is only its internal state and differs from it off the horizontal plane.
  const vergenceDeg = gazes
    ? lineOfSightAngleDeg(gazes)
    : eyeDirections({ distanceM: scene.targetDistanceM, directionDeg: scene.targetDirectionDeg }, scene.ipdMm).vergenceDeg;
  return { left: one("left"), right: one("right"), vergenceDeg };
}
