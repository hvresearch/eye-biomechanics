import type { Vec3 } from "../math/vec3";
import type { Surface } from "../surfaces/types";
import { pupilBundle, type ViewSpec } from "../trace/aim";
import { fitZernike, type ZernikeFit } from "./fit";
import { opdMap, type OpdMap } from "./opd";
import { refractionFromZernike, type Refraction } from "./refraction";

export interface WavefrontOptions {
  /** Pupil grid size across the diameter (64 in the viewer). */
  gridN?: number;
  wavelengthNm?: number;
  maxRadialOrder?: number;
  refractionMethod?: "minimumRms" | "paraxial";
  /** Center of the reference sphere (another wavelength's chief-ray image point); this wavelength's own by default. */
  referenceImagePoint?: Vec3;
}

export interface WavefrontAnalysis {
  map: OpdMap;
  fit: ZernikeFit;
  refraction: Refraction;
}

/**
 * Bundle → OPD map → Zernike fit → refraction, in one call. Surfaces whose vertex lies in
 * front of the pupil plane (a spectacle lens) are aimed through so the bundle fills the same
 * pupil disk.
 */
export function analyzeWavefront(surfaces: readonly Surface[], view: ViewSpec, opts: WavefrontOptions = {}): WavefrontAnalysis {
  const front = surfaces.filter((s) => s.vertexZMm < view.pupilPlaneZMm);
  const bundle = pupilBundle(view, opts.gridN ?? 64, opts.wavelengthNm ?? 555, front);
  const map = opdMap(surfaces, bundle, opts.referenceImagePoint);
  const fit = fitZernike(map, opts.maxRadialOrder ?? 8);
  return { map, fit, refraction: refractionFromZernike(fit.coeffsMicrons, view.pupilRadiusMm, opts.refractionMethod) };
}
