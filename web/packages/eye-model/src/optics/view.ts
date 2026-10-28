import type { ViewSpec } from "@eye/optics";
import defaults from "../../../../../data/visual-axis/defaults.json";
import type { EyeParameters } from "../schema/types";

export const VISUAL_AXIS_DEFAULTS = defaults;

/**
 * Distance of the pupil plane in front of the anterior corneal vertex, mm. A numerical choice
 * shared with optics' DEFAULT_LAUNCH_OFFSET_MM (a test checks they agree): bundles fill a disk in
 * this plane (Deviation 5 of the M3 plan), not the iris.
 */
export const PUPIL_PLANE_OFFSET_MM = 1;

/**
 * How the eye views a fixation target `objectDistanceM` in front of its corneal vertex along its
 * visual axis: the field angle is angle alpha toward +x (the target lies nasal of the optical
 * axis, so rays travel temporally and the fovea is temporal), the pupil is centered at
 * `pupilDecenterMm`. A document without `visualAxis` looks along its optical axis.
 */
export function eyeView(params: EyeParameters, objectDistanceM: number, pupilDiameterMm: number): ViewSpec {
  return {
    objectDistanceM,
    fieldDeg: { x: params.visualAxis?.alphaDeg ?? 0, y: 0 },
    referenceZMm: 0,
    pupilPlaneZMm: -PUPIL_PLANE_OFFSET_MM,
    pupilCenterMm: { x: params.pupilDecenterMm?.x ?? 0, y: params.pupilDecenterMm?.y ?? 0 },
    pupilRadiusMm: pupilDiameterMm / 2,
  };
}

/** The same view along the optical axis (no alpha, centered pupil), for on-axis comparisons. */
export function onAxisView(objectDistanceM: number, pupilDiameterMm: number): ViewSpec {
  return {
    objectDistanceM,
    fieldDeg: { x: 0, y: 0 },
    referenceZMm: 0,
    pupilPlaneZMm: -PUPIL_PLANE_OFFSET_MM,
    pupilCenterMm: { x: 0, y: 0 },
    pupilRadiusMm: pupilDiameterMm / 2,
  };
}
