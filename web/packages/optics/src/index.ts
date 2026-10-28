export type { Vec3 } from "./math/vec3";
export { add, cross, distance, dot, norm, normalize, scale, sub } from "./math/vec3";
export type {
  ConicSurface,
  Medium,
  SequentialSurface,
  Surface,
  SurfaceBase,
  ToricSurface,
  ZernikeSurface,
} from "./surfaces/types";
export { intersect, meridianCurvature, normalAt, sag } from "./surfaces/geometry";
export type { Intersection } from "./surfaces/geometry";
export { placeSurface, surfacesFromSequential } from "./surfaces/sequential";
export {
  zernikeBasis,
  zernikeCount,
  zernikeIndex,
  zernikeJ,
  zernikeNorm,
  zernikeRadial,
  zernikeRho2Coefficient,
  zernikeValue,
} from "./math/zernike";
export { objectVergenceForImageD, paraxialPower } from "./paraxial/abcd";
export type { ParaxialOptions, ParaxialResult } from "./paraxial/abcd";
export type { Ray, TraceHit, TraceResult, VignetteReason } from "./trace/ray";
export { refract } from "./trace/refract";
export { traceRay } from "./trace/sequential";
export { collimatedBundle, fieldDirection, pointSourceBundle, pupilGrid } from "./trace/bundle";
export { DEFAULT_LAUNCH_OFFSET_MM, InsufficientRaysError, retinalDefocusD, splitImageSurface } from "./metrics/defocus";
export type { DefocusOptions, DefocusResult } from "./metrics/defocus";
