export type { Vec3 } from "./math/vec3";
export { add, cross, distance, dot, norm, normalize, scale, sub } from "./math/vec3";
export type {
  CauchyDispersion,
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
  zernikeBasisXY,
  zernikeToCartesian,
  cartesianRow,
  zernikeCount,
  zernikeIndex,
  zernikeJ,
  zernikeNorm,
  zernikeRadial,
  zernikeRho2Coefficient,
  zernikeValue,
} from "./math/zernike";
export { cauchyFit, indexAt } from "./color/dispersion";
export { objectVergenceForImageD, paraxialPower } from "./paraxial/abcd";
export type { ParaxialOptions, ParaxialResult } from "./paraxial/abcd";
export type { Ray, TraceHit, TraceResult, VignetteReason } from "./trace/ray";
export { refract } from "./trace/refract";
export { traceRay, traceToEnd } from "./trace/sequential";
export type { TraceEnd } from "./trace/sequential";
export { collimatedBundle, fieldDirection, pointSourceBundle, pupilGrid } from "./trace/bundle";
export { DEFAULT_LAUNCH_OFFSET_MM, InsufficientRaysError, retinalDefocusD, splitImageSurface } from "./metrics/defocus";
export type { DefocusOptions, DefocusResult } from "./metrics/defocus";
export { pupilBundle } from "./trace/aim";
export type { PupilBundle, ViewSpec } from "./trace/aim";
export { ChiefRayError, opdMap } from "./wavefront/opd";
export type { OpdMap } from "./wavefront/opd";
export { fitZernike, zernikeWavefront } from "./wavefront/fit";
export type { ZernikeFit } from "./wavefront/fit";
export { powerVectors, refractionFromZernike, sphereCylFromPowerVectors, wrapAxisDeg } from "./wavefront/refraction";
export type { Refraction } from "./wavefront/refraction";
export { analyzeWavefront } from "./wavefront/analyze";
export type { WavefrontAnalysis, WavefrontOptions } from "./wavefront/analyze";
export { fft2, fftShift } from "./image/fft";
export { defaultPixelArcmin, polychromaticPsf, psf } from "./image/psf";
export type { Psf, PsfOptions, WavefrontInput } from "./image/psf";
export { diffractionMtf, mtf, otf, otfPair } from "./image/mtf";
export type { Mtf, Otf } from "./image/mtf";
export { grating, snellenE } from "./image/targets";
export type { Bitmap, EOrientation } from "./image/targets";
export { retinalImage, retinalImagePair } from "./image/retinal";
export { SPECTACLE_DEFAULTS, lensSurfaces } from "./lenses/prescription";
export type { Prescription } from "./lenses/prescription";
export { nelderMead } from "./lenses/nelderMead";
export type { NelderMeadOptions, NelderMeadResult } from "./lenses/nelderMead";
export { autoPrescribe } from "./lenses/autoprescribe";
export type { AutoPrescribeOptions, AutoPrescribeResult } from "./lenses/autoprescribe";
