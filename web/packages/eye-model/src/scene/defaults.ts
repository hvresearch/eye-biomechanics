import table from "../../../../../data/scene/defaults.json";
import type { PresetName } from "../presets/load";
import type { SceneState } from "../state/types";

/** Shape of data/scene/defaults.json. */
export interface SceneDefaults {
  ipdMm: number;
  ageYears: number;
  luminanceCdM2: number;
  targetDistanceM: number;
  targetDirectionDeg: { x: number; y: number };
  citation: string;
  verified: boolean;
}

export const SCENE_DEFAULTS: SceneDefaults = table;

/** The starting scene for a preset (data/scene/defaults.json). */
export function defaultScene(preset: PresetName): SceneState {
  return {
    targetDistanceM: SCENE_DEFAULTS.targetDistanceM,
    targetDirectionDeg: { ...SCENE_DEFAULTS.targetDirectionDeg },
    luminanceCdM2: SCENE_DEFAULTS.luminanceCdM2,
    ageYears: SCENE_DEFAULTS.ageYears,
    ipdMm: SCENE_DEFAULTS.ipdMm,
    timeS: 0,
    preset,
  };
}
