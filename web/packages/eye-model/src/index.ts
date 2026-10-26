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
export { SURFACE_NAMES, findSurface, lensGeometry, relaxedLensGeometry } from "./accommodation/lens";
export type { LensGeometry } from "./accommodation/lens";
