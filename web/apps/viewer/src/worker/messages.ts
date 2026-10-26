import type { Surface, Vec3 } from "@eye/optics";

export interface OpticsRequest {
  id: number;
  /** Optics surfaces, retina last (from buildSurfaces). */
  surfaces: Surface[];
  objectDistanceM: number;
  pupilSemiDiamMm: number;
  /** Number of rays in the drawn sagittal fan (odd numbers include the chief ray). */
  fanRays: number;
}

export interface OpticsResponse {
  id: number;
  defocusD: number;
  bestFocusZMm: number;
  retinaZMm: number;
  rmsSpotMm: number;
  /** One polyline per fan ray: launch point then one vertex per surface hit, mm. */
  fan: Vec3[][];
  vignettedRays: number;
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
