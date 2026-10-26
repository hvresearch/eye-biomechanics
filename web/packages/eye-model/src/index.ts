export { validateEyeParameters } from "./schema/validate";
export type { EyeParameters, MuscleGeometry, Medium, Provenance, Surface } from "./schema/types";
export {
  PRESET_NAMES,
  PresetNotTranscribedError,
  loadPreset,
  presetTable,
} from "./presets/load";
export type { LensAccommodationModel, PresetName, SchematicEyeTable } from "./presets/load";
