import type { MusclePath } from "../eom/path";
import type { GazeDeg } from "../gaze/listing";
import type { Quat } from "../math/quat";
import type { PresetName } from "../presets/load";

/** Scene-level inputs shared by both eyes (spec §4.5). */
export interface SceneState {
  /** Target distance from the midpoint between the eyes, meters; Infinity for a distant target. */
  targetDistanceM: number;
  /** Target direction, degrees from straight ahead in the head frame (x to the subject's right, y superior). */
  targetDirectionDeg: { x: number; y: number };
  luminanceCdM2: number;
  ageYears: number;
  ipdMm: number;
  timeS: number;
  preset: PresetName;
}

/** Derived per-eye state (spec §4.5). */
export interface EyeState {
  accommodationD: number;
  demandD: number;
  amplitudeD: number;
  /** Pupil diameter after near miosis, mm. */
  pupilMm: number;
  /** Light-adapted pupil diameter before near miosis, mm. */
  pupilBaseMm: number;
  /** Orientation (Listing's law) in the eye's local frame, [x, y, z, w]. */
  gaze: Quat;
  /** Line of sight in the eye's local frame (x temporal, y superior), degrees. */
  gazeDeg: GazeDeg;
  /** This eye's distance to the target (from its center of rotation), meters. */
  targetDistanceM: number;
  ciliaryActivation: number;
  /**
   * Parameter A of the document's lens accommodation model (Navarro 1985 Table 4) that
   * makes the built optics accommodate by `accommodationD` (paraxial far-point shift).
   * Table 4's nominal A is not itself the far-point shift, so the two differ.
   */
  lensParameterA: number;
  /** Per muscle, in `MUSCLE_NAMES` order. */
  eomActivation: number[];
  eomLengthMm: number[];
  /** Primary-position lengths, the reference for the length-proxy activation. */
  eomRestLengthMm: number[];
  eomPaths: MusclePath[];
}

/** Both eyes from one scene (spec §4.5 `derive`). */
export interface BinocularState {
  left: EyeState;
  right: EyeState;
  vergenceDeg: number;
}
