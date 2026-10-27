import type { EyeParameters } from "@eye/eye-model";
import type { Surface, Vec3 } from "@eye/optics";

/** One eye's optics job: the document and how far it is accommodated (from the main thread). */
export interface EyeOpticsRequest {
  side: "left" | "right";
  params: EyeParameters;
  /** Accommodation response (static controller or dynamics), diopters. */
  accommodationD: number;
  /** This eye's distance to the target, meters (Infinity for a distant target). */
  objectDistanceM: number;
  pupilSemiDiamMm: number;
  /** Rays in the drawn sagittal fan (odd numbers include the chief ray; 0 draws none). */
  fanRays: number;
}

export interface OpticsRequest {
  id: number;
  eyes: EyeOpticsRequest[];
}

export interface EyeOptics {
  side: "left" | "right";
  /** Accommodated optics surfaces, retina last. */
  surfaces: Surface[];
  /** Lens model parameter solved so the paraxial far point moves by `accommodationD`. */
  lensParameterA: number;
  paraxialPowerD: number;
  /** Far point of the relaxed document, clinical sign (0 for an emmetrope). */
  farPointD: number;
  defocusD: number;
  bestFocusZMm: number;
  retinaZMm: number;
  rmsSpotMm: number;
  /** One polyline per fan ray: launch point then one vertex per surface hit, mm. */
  fan: Vec3[][];
  vignettedRays: number;
}

export interface OpticsResponse {
  id: number;
  eyes: EyeOptics[];
  elapsedMs: number;
}

export interface OpticsFailure {
  id: number;
  error: string;
}

export type OpticsWorkerMessage = OpticsResponse | OpticsFailure;

export function isFailure(m: OpticsWorkerMessage): m is OpticsFailure {
  return "error" in m;
}
