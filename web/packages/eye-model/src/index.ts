export { validateEyeParameters } from "./schema/validate";
export type { EyeParameters, MuscleGeometry, Medium, Provenance, Surface } from "./schema/types";
export {
  PRESET_NAMES,
  PresetNotTranscribedError,
  loadPreset,
  presetTable,
} from "./presets/load";
export type { LensAccommodationModel, PresetName, SchematicEyeTable } from "./presets/load";
export { AMPLITUDE_TABLE, amplitudeForAge } from "./accommodation/amplitude";
export type { AmplitudeTable } from "./accommodation/amplitude";
export {
  SURFACE_NAMES,
  findSurface,
  lensGeometry,
  lensParameterForAccommodation,
  relaxedLensGeometry,
} from "./accommodation/lens";
export type { LensGeometry } from "./accommodation/lens";
export {
  LAG_TABLE,
  MIN_TARGET_DISTANCE_M,
  accommodationResponse,
  defaultLag,
  demandFromDistance,
} from "./accommodation/controller";
export type { LagModel, LagTable } from "./accommodation/controller";
export type { BinocularState, EyeState, SceneState } from "./state/types";
export { SchemaVersionError, assertSupported, deriveBinocular, deriveEyeState } from "./state/derive";
export { DEFAULT_PUPIL, pupilBaseMm, pupilDiameterMm } from "./pupil/model";
export type { PupilInputs } from "./pupil/model";
export { WATSON_YELLOTT, stanleyDaviesMm, watsonYellottMm } from "./pupil/watsonYellott";
export { NEAR_RESPONSE, nearMiosisMm, vergenceDemandMA } from "./pupil/nearResponse";
export type { BinocularOptions, EyeStateOverrides } from "./state/derive";
export { SCENE_DEFAULTS, defaultScene } from "./scene/defaults";
export type { SceneDefaults } from "./scene/defaults";
export { RETINA_SURFACE_NAME, buildSurfaces, buildSurfacesAt, lensParameterFor } from "./build/surfaces";
export type { Vec3 } from "./math/vec";
export {
  EOM_TABLE,
  GLOBE_RADIUS_MM,
  MUSCLE_NAMES,
  defaultMuscles,
  insertionPoint,
  musclesFromDocument,
  obliqueOrigin,
  toDocumentMuscles,
} from "./eom/geometry";
export type { EomMuscle, EomTable, MuscleName } from "./eom/geometry";
export type { Quat } from "./math/quat";
export { QUAT_IDENTITY, quatFromAxisAngle, quatMultiply, quatNormalize, quatRotate } from "./math/quat";
export {
  PRIMARY_DIRECTION,
  directionFromQuaternion,
  fickTorsionDeg,
  gazeDirection,
  gazeFromDirection,
  gazeQuaternion,
} from "./gaze/listing";
export type { GazeDeg } from "./gaze/listing";
export { eyeDirections, targetPoint } from "./gaze/vergence";
export type { EyeDirections, SceneTarget } from "./gaze/vergence";
export { musclePath } from "./eom/path";
export type { MusclePath } from "./eom/path";
export { ACTIVATION_TABLE, activations } from "./eom/activation";
export type { ActivationTable } from "./eom/activation";
export {
  DYNAMICS_TABLE,
  dynamicTargetsFromDirections,
  eyeGazes,
  initialDynamics,
  stepDynamics,
} from "./gaze/dynamics";
export type { DynamicState, DynamicTargets, DynamicsTable, PerEye } from "./gaze/dynamics";
export { DISPERSION_TABLE, MEDIA_DISPERSION, PHOTOPIC, withDispersion } from "./optics/dispersion";
export type { MediumName } from "./optics/dispersion";
export { clinicalAxisDeg, localAxisDeg, toClinicalRefraction } from "./optics/clinical";
export type { ClinicalPrescription, Side } from "./optics/clinical";
