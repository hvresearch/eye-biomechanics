import type { PresetName } from "../presets/load";

/** Scene-level inputs shared by both eyes (spec §4.5). */
export interface SceneState {
  /** Target distance along the line of sight, meters; Infinity for a distant target. */
  targetDistanceM: number;
  /** Target direction, degrees from straight ahead (x temporal-right, y superior). */
  targetDirectionDeg: { x: number; y: number };
  luminanceCdM2: number;
  ageYears: number;
  ipdMm: number;
  timeS: number;
  preset: PresetName;
}

/** Derived per-eye state (spec §4.5). Milestone 1 fills accommodation and a fixed pupil. */
export interface EyeState {
  accommodationD: number;
  demandD: number;
  amplitudeD: number;
  pupilMm: number;
  /** Gaze quaternion [x, y, z, w]; identity until Milestone 2. */
  gaze: readonly [number, number, number, number];
  ciliaryActivation: number;
  /**
   * Parameter A of the document's lens accommodation model (Navarro 1985 Table 4) that
   * makes the built optics accommodate by `accommodationD` (paraxial far-point shift).
   * Table 4's nominal A is not itself the far-point shift, so the two differ.
   */
  lensParameterA: number;
  eomActivation: number[];
  eomLengthMm: number[];
}
