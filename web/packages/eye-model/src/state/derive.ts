import type { Surface } from "@eye/optics";
import { amplitudeForAge } from "../accommodation/amplitude";
import { accommodationResponse, demandFromDistance } from "../accommodation/controller";
import { activations } from "../eom/activation";
import { musclesFromDocument } from "../eom/geometry";
import { musclePath } from "../eom/path";
import { eyeGazes, type DynamicState, type PerEye } from "../gaze/dynamics";
import { gazeQuaternion, type GazeDeg } from "../gaze/listing";
import { eyeDirections, lineOfSightAngleDeg } from "../gaze/vergence";
import { pupilBaseMm, pupilDiameterMm } from "../pupil/model";
import { vergenceDemandMA } from "../pupil/nearResponse";
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

/** Overrides from the dynamics stepper: where the eye is now rather than where it is headed. */
export interface EyeStateOverrides {
  gaze?: GazeDeg;
  accommodationD?: number;
  /** Current angle between the lines of sight, degrees (drives the near miosis). */
  vergenceDeg?: number;
}

/**
 * Pure derivation of one eye's state from the scene (spec §4.5).
 *
 * Accommodation: demand from this eye's distance to the target and its far point, response
 * with lag and amplitude clip (or `overrides.accommodationD` from the dynamics). Gaze:
 * Listing's law toward the target (or `overrides.gaze`). Muscles: paths, lengths, and
 * length-proxy activations for the document's muscles (or the default table). Pupil: the
 * document's pupil model at the scene's luminance and age, with near miosis for the vergence
 * demand of the static fixation (or `overrides.vergenceDeg`).
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
  // A document without a lens accommodation model has a fixed lens (spec §3.2: absent means
  // not modeled), so it cannot accommodate whatever the age.
  const amplitudeD = params.lensAccommodationModel ? amplitudeForAge(scene.ageYears) : 0;
  const demandD = demandFromDistance(targetDistanceM, farPointD);
  const accommodationD = overrides.accommodationD ?? accommodationResponse(demandD, amplitudeD);
  const lensParameterA = farPointOf ? lensParameterFor(params, accommodationD, farPointOf) : accommodationD;

  const gazeDeg = overrides.gaze ?? dirs[side];
  const gaze = gazeQuaternion(gazeDeg);
  const muscles = musclesFromDocument(params);
  const eomRestLengthMm = muscles.map((m) => musclePath(m, QUAT_IDENTITY).lengthMm);
  const eomPaths = muscles.map((m) => musclePath(m, gaze));
  const eomLengthMm = eomPaths.map((p) => p.lengthMm);

  const pupilInputs = {
    luminanceCdM2: scene.luminanceCdM2,
    ageYears: scene.ageYears,
    vergenceMA: vergenceDemandMA(overrides.vergenceDeg ?? dirs.vergenceDeg, scene.ipdMm),
  };

  return {
    accommodationD,
    demandD,
    amplitudeD,
    pupilMm: pupilDiameterMm(params, pupilInputs),
    pupilBaseMm: pupilBaseMm(params, pupilInputs),
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
  // The readout is the angle between the lines of sight in both modes; the dynamics' horizontal
  // azimuth difference is only its internal state and differs from it off the horizontal plane.
  const vergenceDeg = gazes
    ? lineOfSightAngleDeg(gazes)
    : eyeDirections({ distanceM: scene.targetDistanceM, directionDeg: scene.targetDirectionDeg }, scene.ipdMm).vergenceDeg;
  const one = (side: "left" | "right") =>
    deriveEyeState(scene, eyes[side], side, opts.farPointD?.[side] ?? 0, opts.farPointOf, {
      ...(gazes ? { gaze: gazes[side], vergenceDeg } : {}),
      ...(dyn ? { accommodationD: dyn.accommodationD[side] } : {}),
    });
  return { left: one("left"), right: one("right"), vergenceDeg };
}
